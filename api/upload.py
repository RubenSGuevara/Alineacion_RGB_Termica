import os
import json
import numpy as np
from PIL import Image
import tifffile
from http.server import BaseHTTPRequestHandler
from io import BytesIO
from supabase import create_client, Client

# --- Funciones Helper ---
def extract_thermal_data(tiff_bytes):
    try:
        with tifffile.TiffFile(BytesIO(tiff_bytes)) as tif:
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
        print(f"Error extrayendo datos: {e}")
        return None, None

def create_thumbnail(image_bytes, size=(400, 600)):
    try:
        img = Image.open(BytesIO(image_bytes))
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        img.thumbnail(size, Image.Resampling.LANCZOS)
        buffer = BytesIO()
        img.save(buffer, 'PNG', optimize=True)
        return buffer.getvalue()
    except Exception as e:
        print(f"Error thumbnail: {e}")
        return None

# --- Handler Principal ---
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Leer el body JSON
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            body = json.loads(post_data.decode('utf-8'))
            
            name = body.get('name')
            rgb_path = body.get('rgb_path')
            tiff_path = body.get('tiff_path')

            if not all([name, rgb_path, tiff_path]):
                raise Exception("Faltan datos (name, rgb_path, tiff_path)")

            # 2. Conectar a Supabase
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_KEY")
            if not url or not key:
                raise Exception("Faltan credenciales de Supabase")
            
            supabase: Client = create_client(url, key)

            # 3. Descargar archivos ORIGINALES
            print(f"Descargando: {rgb_path} y {tiff_path}")
            rgb_bytes = supabase.storage.from_("rgb-originals").download(rgb_path)
            tiff_bytes = supabase.storage.from_("tiff-originals").download(tiff_path)

            # 4. Procesar en Memoria
            rgb_thumb_bytes = create_thumbnail(rgb_bytes)
            thermal_thumb_bytes = create_thumbnail(tiff_bytes)
            
            temp_data, temp_metadata = extract_thermal_data(tiff_bytes)
            if temp_data is None:
                # Fallback: Si no hay temperatura, usar valores default para no romper
                print("Advertencia: No se detectaron datos térmicos en Frame 1")
                temp_metadata = {'min_temp': 0, 'max_temp': 0, 'mean_temp': 0}
                # Crear un array vacío o dummy
                temp_data = np.zeros((10, 10))
            
            npy_buffer = BytesIO()
            np.save(npy_buffer, temp_data)
            npy_bytes = npy_buffer.getvalue()

            # 5. Subir RESULTADOS
            thumb_name = f"{name}_thumb.png"
            supabase.storage.from_("thumbnails-rgb").upload(
                path=thumb_name, 
                file=rgb_thumb_bytes, 
                file_options={"content-type": "image/png", "upsert": "true"}
            )
            supabase.storage.from_("thumbnails-thermal").upload(
                path=thumb_name, 
                file=thermal_thumb_bytes, 
                file_options={"content-type": "image/png", "upsert": "true"}
            )
            
            npy_name = f"{name}_temps.npy"
            supabase.storage.from_("temperature-data").upload(
                path=npy_name, 
                file=npy_bytes, 
                file_options={"content-type": "application/octet-stream", "upsert": "true"}
            )

            # 6. Insertar en Base de Datos
            
            db_row = {
                "name": name,
                "rgb_thumb_path": thumb_name,
                "thermal_thumb_path": thumb_name,
                "tiff_path": tiff_path,
                "temp_data_path": npy_name,
                "min_temp": temp_metadata['min_temp'],
                "max_temp": temp_metadata['max_temp'],
                "mean_temp": temp_metadata['mean_temp'],
                "metadata": { "processed_via": "vercel_function_upsert" }
            }
            
            # on_conflict="name" le dice a la BD: "Si el nombre ya existe, actualiza los otros campos"
            response = supabase.table("lung_pairs").upsert(db_row, on_conflict="name").execute()
            
            # Si llegamos aquí, fue exitoso
            print(f"Inserción exitosa: {response.data}")

            # 7. Responder Éxito
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'name': name}).encode())

        except Exception as e:
            print(f"Error CRÍTICO en upload.py: {str(e)}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            # Convertir excepción a string para enviarla al frontend
            self.wfile.write(json.dumps({'error': str(e)}).encode())