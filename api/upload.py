# api/upload.py

import os
import json
import numpy as np
from PIL import Image
import tifffile
from http.server import BaseHTTPRequestHandler
import cgi
from io import BytesIO
from supabase import create_client, Client

# --- Adaptación de tus funciones ---
# (Modificadas para aceptar streams de archivos en lugar de rutas)

def extract_thermal_data(tiff_stream):
    """
    Extrae Frame 1 (temperaturas) de un stream de archivo TIFF.
    """
    try:
        tiff_stream.seek(0) # Asegurarse de que leemos desde el inicio
        with tifffile.TiffFile(tiff_stream) as tif:
            if len(tif.pages) > 1:
                temp_data = tif.pages[1].asarray()
                metadata = {
                    'min_temp': float(np.min(temp_data)),
                    'max_temp': float(np.max(temp_data)),
                    'mean_temp': float(np.mean(temp_data)),
                    'shape': list(temp_data.shape)
                }
                return temp_data, metadata
        return None, None
    except Exception as e:
        print(f"Error extrayendo datos de TIFF: {e}")
        return None, None

def create_thumbnail(image_stream, size=(400, 600), quality=85):
    """
    Crea un thumbnail optimizado desde un stream de imagen
    y lo devuelve como un buffer de bytes.
    """
    try:
        image_stream.seek(0)
        img = Image.open(image_stream)
        
        # Convertir a RGB si es necesario (para TIFFs Frame 0 o PNGs con Alpha)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        # Guardar en un buffer en memoria
        buffer = BytesIO()
        img.save(buffer, 'PNG', optimize=True)
        buffer.seek(0)
        return buffer
        
    except Exception as e:
        print(f"Error creando thumbnail: {e}")
        return None

# --- El Manejador de la API de Vercel ---

class handler(BaseHTTPRequestHandler):
    
    def do_POST(self):
        try:
            # 1. Parsear el formulario (FormData)
            # Usamos cgi.FieldStorage que sabe cómo manejar multipart/form-data
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST',
                         'CONTENT_TYPE': self.headers['Content-Type']}
            )
            
            # 2. Extraer datos y archivos
            name = form.getvalue('name')
            rgb_file_item = form['rgb_file']
            thermal_file_item = form['thermal_file']

            if not all([name, rgb_file_item, thermal_file_item]):
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Faltan campos (name, rgb_file, thermal_file)'}).encode())
                return

            # Leer archivos en streams de BytesIO
            rgb_stream = BytesIO(rgb_file_item.file.read())
            tiff_stream = BytesIO(thermal_file_item.file.read())

            # 3. Inicializar Supabase (USANDO CLAVES DE SERVIDOR)
            # Estas deben estar en las Variables de Entorno de Vercel
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_KEY") # ¡IMPORTANTE: Usar Service Key!
            
            if not url or not key:
                raise Exception("Faltan las variables de entorno de Supabase (URL o SERVICE_KEY)")
                
            supabase: Client = create_client(url, key)

            # 4. Procesar archivos (usando tus funciones adaptadas)
            
            # --- Thumbnails ---
            rgb_thumb_buffer = create_thumbnail(rgb_stream)
            thermal_thumb_buffer = create_thumbnail(tiff_stream) # PIL leerá el Frame 0 (visual)
            
            # --- Datos de Temperatura ---
            temp_data, temp_metadata = extract_thermal_data(tiff_stream)
            if temp_data is None:
                raise Exception("No se pudieron extraer los datos de temperatura del TIFF (Frame 1 no encontrado).")
            
            # --- Convertir .npy a buffer ---
            npy_buffer = BytesIO()
            np.save(npy_buffer, temp_data)
            npy_buffer.seek(0)

            # 5. Subir todo a Supabase Storage
            # (Usamos .upload() que acepta buffers de bytes)
            
            # a. Thumbnail RGB
            rgb_thumb_path = f"{name}_thumb.png"
            supabase.storage.from_("thumbnails-rgb").upload(
                path=rgb_thumb_path, file=rgb_thumb_buffer.getvalue(),
                file_options={"content-type": "image/png", "upsert": "true"}
            )
            
            # b. Thumbnail Térmico
            thermal_thumb_path = f"{name}_thumb.png"
            supabase.storage.from_("thumbnails-thermal").upload(
                path=thermal_thumb_path, file=thermal_thumb_buffer.getvalue(),
                file_options={"content-type": "image/png", "upsert": "true"}
            )
            
            # c. Datos .npy
            temp_data_path = f"{name}_temps.npy"
            supabase.storage.from_("temperature-data").upload(
                path=temp_data_path, file=npy_buffer.getvalue(),
                file_options={"content-type": "application/octet-stream", "upsert": "true"}
            )
            
            # d. TIFF Original
            tiff_path = f"{name}.tiff"
            tiff_stream.seek(0)
            supabase.storage.from_("tiff-originals").upload(
                path=tiff_path, file=tiff_stream.getvalue(),
                file_options={"content-type": "image/tiff", "upsert": "true"}
            )

            # 6. Insertar en la Base de Datos
            db_row = {
                "name": name,
                "rgb_thumb_path": rgb_thumb_path,
                "thermal_thumb_path": thermal_thumb_path,
                "tiff_path": tiff_path,
                "temp_data_path": temp_data_path,
                "min_temp": temp_metadata.get('min_temp'),
                "max_temp": temp_metadata.get('max_temp'),
                "mean_temp": temp_metadata.get('mean_temp'),
                "metadata": { # Puedes añadir más metadata si quieres
                    "original_rgb_name": rgb_file_item.filename,
                    "original_tiff_name": thermal_file_item.filename
                }
            }
            
            data, error = supabase.table("lung_pairs").insert(db_row).execute()
            
            if error:
                raise Exception(f"Error en Base de Datos: {error.message}")

            # 7. Enviar respuesta de Éxito
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'name': name, 'db_response': data[1][0]}).encode())

        except Exception as e:
            # Manejar cualquier error que ocurra
            print(f"Error en handler POST: {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())