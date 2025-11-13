// src/UploadView.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Info, AlertCircle, FileImage, FileText, X } from 'lucide-react';

const UploadView = ({ accessCode }) => {
  const [name, setName] = useState('');
  const [rgbFile, setRgbFile] = useState(null);
  const [thermalTiff, setThermalTiff] = useState(null);
  
  // --- ESTADOS PARA PREVISUALIZACIÓN ---
  const [rgbPreview, setRgbPreview] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Completa el formulario para agregar un nuevo par de pulmones.');

  const rgbInputRef = useRef(null);
  const tiffInputRef = useRef(null);

  // Limpiar la URL de previsualización cuando el componente se desmonte
  // para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (rgbPreview) URL.revokeObjectURL(rgbPreview);
    };
  }, [rgbPreview]);

  // Manejador para selección de RGB (genera preview)
  const handleRgbSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRgbFile(file);
      // Crear URL temporal para visualizar
      const url = URL.createObjectURL(file);
      setRgbPreview(url);
    }
  };

  // Manejador para selección de Térmica
  const handleThermalSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setThermalTiff(file);
    }
  };

  // Función para limpiar selección
  const clearSelection = () => {
    setName('');
    setRgbFile(null);
    setThermalTiff(null);
    setRgbPreview(null);
    if (rgbInputRef.current) rgbInputRef.current.value = null;
    if (tiffInputRef.current) tiffInputRef.current.value = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !rgbFile || !thermalTiff) {
      setMessage('❌ Por favor, completa los tres campos.');
      return;
    }

    setLoading(true);
    setMessage('🔄 Subiendo y procesando archivos... Esto puede tardar un minuto.');

    const formData = new FormData();
    formData.append('name', name);
    formData.append('rgb_file', rgbFile);
    formData.append('thermal_file', thermalTiff);
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Ocurrió un error en el servidor.');
      }

      setMessage(`✅ ¡Éxito! Se agregó el par "${result.name}" a la base de datos.`);
      clearSelection(); // Limpiar formulario tras éxito

    } catch (error) {
      console.error('Error en la subida:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-gray-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2">Panel de Carga de Imágenes</h1>
          <p className="text-purple-200">Añadir nuevos pares de pulmones al sistema</p>
        </div>

        {/* Cuadro de Mensaje */}
        {message && (
          <div className={`border rounded-xl p-4 mb-6 backdrop-blur ${
            message.startsWith('❌') ? 'bg-red-500/20 border-red-400/30' : 
            message.startsWith('✅') ? 'bg-green-500/20 border-green-400/30' :
            'bg-blue-500/20 border-blue-400/30'
          }`}>
            <p className={`flex items-center gap-2 ${
              message.startsWith('❌') ? 'text-red-100' :
              message.startsWith('✅') ? 'text-green-100' :
              'text-blue-100'
            }`}>
              {message.startsWith('❌') ? <AlertCircle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              {message}
            </p>
          </div>
        )}

        {/* Formulario de Carga */}
        <form 
          onSubmit={handleSubmit}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20"
        >
          <div className="grid gap-8 md:grid-cols-2">
            
            {/* --- COLUMNA IZQUIERDA: INPUTS --- */}
            <div className="space-y-6">
              {/* 1. Nombre del Par */}
              <div>
                <label htmlFor="name" className="text-white font-semibold mb-2 block">
                  Nombre del Par (Ej: M2_20D)
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="M2_20D"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={loading}
                />
              </div>

              {/* 2. Archivo RGB */}
              <div>
                <label className="text-white font-semibold mb-2 block flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-green-400" />
                  1. Imagen RGB (.png, .jpg)
                </label>
                <input
                  type="file"
                  ref={rgbInputRef}
                  onChange={handleRgbSelect}
                  accept=".png,.jpg,.jpeg"
                  className="w-full text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 file:cursor-pointer"
                  disabled={loading}
                />
              </div>

              {/* 3. Archivo TIFF */}
              <div>
                <label className="text-white font-semibold mb-2 block flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  2. Imagen Térmica (.tiff, .tif)
                </label>
                <input
                  type="file"
                  ref={tiffInputRef}
                  onChange={handleThermalSelect}
                  accept=".tif,.tiff"
                  className="w-full text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer"
                  disabled={loading}
                />
              </div>
            </div>

            {/* --- COLUMNA DERECHA: PREVISUALIZACIÓN --- */}
            <div className="bg-black/20 rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center min-h-[300px]">
              <h3 className="text-white/50 text-sm font-bold uppercase tracking-wider mb-4">Previsualización de Carga</h3>
              
              {/* Preview RGB */}
              {rgbPreview ? (
                <div className="relative w-full max-w-xs mb-4 group">
                  <p className="text-xs text-green-400 mb-1">Vista RGB:</p>
                  <img 
                    src={rgbPreview} 
                    alt="RGB Preview" 
                    className="w-full h-auto rounded-lg border-2 border-green-500/50 shadow-lg"
                  />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                    {(rgbFile.size / (1024*1024)).toFixed(2)} MB
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-xs h-40 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-white/30 text-sm">Sin imagen RGB seleccionada</span>
                </div>
              )}

              {/* Confirmación TIFF */}
              {thermalTiff ? (
                <div className="w-full max-w-xs bg-purple-500/20 border border-purple-500/50 rounded-lg p-3 flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-purple-200 truncate">{thermalTiff.name}</p>
                    <p className="text-xs text-purple-300">{(thermalTiff.size / (1024*1024)).toFixed(2)} MB (Formato TIFF)</p>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-xs h-16 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center">
                  <span className="text-white/30 text-sm">Sin archivo Térmico seleccionado</span>
                </div>
              )}

            </div>
          </div>

          {/* Botón de Subir */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={loading || !name || !rgbFile || !thermalTiff}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-purple-500 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <>🔄 Procesando y Subiendo...</>
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  Confirmar y Subir Par
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default UploadView;