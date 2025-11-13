// src/UploadView.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Info, AlertCircle, FileImage, FileText } from 'lucide-react';
import { supabase } from './lib/supabase'; // Importamos el cliente

const UploadView = ({ accessCode }) => {
  const [name, setName] = useState('');
  const [rgbFile, setRgbFile] = useState(null);
  const [thermalTiff, setThermalTiff] = useState(null);
  const [rgbPreview, setRgbPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Completa el formulario para agregar un nuevo par.');

  const rgbInputRef = useRef(null);
  const tiffInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (rgbPreview) URL.revokeObjectURL(rgbPreview);
    };
  }, [rgbPreview]);

  const handleRgbSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRgbFile(file);
      setRgbPreview(URL.createObjectURL(file));
    }
  };

  const handleThermalSelect = (e) => {
    const file = e.target.files[0];
    if (file) setThermalTiff(file);
  };

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
      setMessage('❌ Completa todos los campos.');
      return;
    }

    setLoading(true);
    setMessage('⏳ Subiendo imágenes a Supabase...');

    try {
      // 1. Subir RGB Original directamente a Supabase
      const rgbPath = `${name}.png`; // O la extensión que sea
      const { error: rgbError } = await supabase.storage
        .from('rgb-originals')
        .upload(rgbPath, rgbFile, { upsert: true });

      if (rgbError) throw new Error(`Error subiendo RGB: ${rgbError.message}`);

      // 2. Subir TIFF Original directamente a Supabase
      const tiffPath = `${name}.tiff`;
      const { error: tiffError } = await supabase.storage
        .from('tiff-originals')
        .upload(tiffPath, thermalTiff, { upsert: true });

      if (tiffError) throw new Error(`Error subiendo TIFF: ${tiffError.message}`);

      // 3. Llamar al Backend para procesar (Solo enviamos las rutas)
      setMessage('⚙️ Procesando imágenes en el servidor...');
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          rgb_path: rgbPath,
          tiff_path: tiffPath
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error en el procesamiento.');
      }

      setMessage(`✅ ¡Éxito! Par "${result.name}" procesado y guardado.`);
      clearSelection();

    } catch (error) {
      console.error('Error:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-gray-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2">Panel de Carga</h1>
          <p className="text-purple-200">Sube imágenes directamente a la nube</p>
        </div>

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
              <Info className="w-5 h-5" />
              {message}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <div>
                <label className="text-white font-semibold mb-2 block">Nombre del Par</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="M2_20D" className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-purple-500" disabled={loading} />
              </div>
              <div>
                <label className="text-white font-semibold mb-2 block flex items-center gap-2"><FileImage className="w-4 h-4 text-green-400" /> 1. Imagen RGB</label>
                <input type="file" ref={rgbInputRef} onChange={handleRgbSelect} accept=".png,.jpg,.jpeg" className="w-full text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:bg-green-600 file:text-white file:cursor-pointer" disabled={loading} />
              </div>
              <div>
                <label className="text-white font-semibold mb-2 block flex items-center gap-2"><FileText className="w-4 h-4 text-purple-400" /> 2. Imagen Térmica (TIFF)</label>
                <input type="file" ref={tiffInputRef} onChange={handleThermalSelect} accept=".tif,.tiff" className="w-full text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:bg-purple-600 file:text-white file:cursor-pointer" disabled={loading} />
              </div>
            </div>
            
            <div className="bg-black/20 rounded-xl p-4 border border-white/10 flex flex-col items-center justify-center">
              {rgbPreview ? (
                <img src={rgbPreview} alt="Preview" className="w-full max-w-xs h-auto rounded-lg border-2 border-green-500/50 shadow-lg" />
              ) : (
                <span className="text-white/30">Previsualización</span>
              )}
            </div>
          </div>

          <div className="mt-8">
            <button type="submit" disabled={loading || !name || !rgbFile || !thermalTiff} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-purple-500 text-white rounded-xl font-bold hover:shadow-lg disabled:opacity-50">
              <Upload className="w-6 h-6" />
              {loading ? 'Procesando...' : 'Subir y Procesar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadView;