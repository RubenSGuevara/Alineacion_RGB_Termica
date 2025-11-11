import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Info, Check, X, Star } from 'lucide-react';
import { supabase, getPublicUrl } from './lib/supabase';

const MAX_CANVAS_WIDTH = 800;
const MAX_CANVAS_HEIGHT = 600;

const getScaledDimensions = (img) => {
  if (!img) return { width: 0, height: 0, scale: 1 };
  let width = img.width;
  let height = img.height;
  if (width === 0 || height === 0) return { width: 0, height: 0, scale: 1 };
  const scaleX = MAX_CANVAS_WIDTH / width;
  const scaleY = MAX_CANVAS_HEIGHT / height;
  const scale = Math.min(scaleX, scaleY, 1);
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
    scale: scale
  };
};

const applyTPSWarping = (cv, sourceCanvas, srcPoints, dstPoints, width, height) => {
  if (!sourceCanvas || !srcPoints || !dstPoints || width <= 0 || height <= 0) {
    return document.createElement('canvas');
  }
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const ctx = resultCanvas.getContext('2d', { willReadFrequently: true });
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const srcImageData = srcCtx.getImageData(0, 0, width, height);
  const dstImageData = ctx.createImageData(width, height);
  const n = srcPoints.length;
  const tpsKernel = (r) => {
    if (r === 0) return 0;
    return r * r * Math.log(r);
  };
  const L = Array(n + 3).fill(0).map(() => Array(n + 3).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = dstPoints[i].x - dstPoints[j].x;
      const dy = dstPoints[i].y - dstPoints[j].y;
      const r = Math.sqrt(dx * dx + dy * dy);
      L[i][j] = tpsKernel(r);
    }
    L[i][n] = 1;
    L[i][n + 1] = dstPoints[i].x;
    L[i][n + 2] = dstPoints[i].y;
    L[n][i] = 1;
    L[n + 1][i] = dstPoints[i].x;
    L[n + 2][i] = dstPoints[i].y;
  }
  const vx = [...srcPoints.map(p => p.x), 0, 0, 0];
  const vy = [...srcPoints.map(p => p.y), 0, 0, 0];
  const flatL = L.flat();
  const L_mat = cv.matFromArray(n + 3, n + 3, cv.CV_64F, flatL);
  const vx_mat = cv.matFromArray(n + 3, 1, cv.CV_64F, vx);
  const vy_mat = cv.matFromArray(n + 3, 1, cv.CV_64F, vy);
  const wx_mat = new cv.Mat();
  const wy_mat = new cv.Mat();
  try {
    cv.solve(L_mat, vx_mat, wx_mat, cv.DECOMP_SVD);
    cv.solve(L_mat, vy_mat, wy_mat, cv.DECOMP_SVD);
  } catch (err) {
    console.error("Error en cv.solve:", err);
    L_mat.delete(); vx_mat.delete(); vy_mat.delete(); wx_mat.delete(); wy_mat.delete();
    return resultCanvas;
  }
  const wx = Array.from(wx_mat.data64F);
  const wy = Array.from(wy_mat.data64F);
  L_mat.delete();
  vx_mat.delete();
  vy_mat.delete();
  wx_mat.delete();
  wy_mat.delete();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let newX = wx[n] + wx[n + 1] * x + wx[n + 2] * y;
      let newY = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
      for (let i = 0; i < n; i++) {
        const dx = x - dstPoints[i].x;
        const dy = y - dstPoints[i].y;
        const r = Math.sqrt(dx * dx + dy * dy);
        const k = tpsKernel(r);
        newX += wx[i] * k;
        newY += wy[i] * k;
        }
        newX = Math.max(0, Math.min(width - 1, newX));
        newY = Math.max(0, Math.min(height - 1, newY));
        const x0 = Math.floor(newX);
        const y0 = Math.floor(newY);
        const x1 = Math.min(x0 + 1, width - 1);
        const y1 = Math.min(y0 + 1, height - 1);
        const fx = newX - x0;
        const fy = newY - y0;
        for (let c = 0; c < 4; c++) {
          const idx00 = (y0 * width + x0) * 4 + c;
          const idx10 = (y0 * width + x1) * 4 + c;
          const idx01 = (y1 * width + x0) * 4 + c;
          const idx11 = (y1 * width + x1) * 4 + c;
          const val = (1 - fx) * (1 - fy) * srcImageData.data[idx00] +
                     fx * (1 - fy) * srcImageData.data[idx10] +
                     (1 - fx) * fy * srcImageData.data[idx01] +
                     fx * fy * srcImageData.data[idx11];
          dstImageData.data[(y * width + x) * 4 + c] = val;
        }
      }
  }
  ctx.putImageData(dstImageData, 0, 0);
  return resultCanvas;
};

// El componente recibe 'accessCode' pero no lo usa,
// ya que el login se maneja en App.jsx.
// Podríamos usarlo para mostrar "Bienvenido Admin"
const AdminDashboard = ({ accessCode }) => {
  const [registrations, setRegistrations] = useState([]);
  const [selectedReg, setSelectedReg] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [cvReady, setCvReady] = useState(false);

  // Estados para el visor
  const [rgbImage, setRgbImage] = useState(null);
  const [thermalImage, setThermalImage] = useState(null);
  const [registeredImage, setRegisteredImage] = useState(null);
  const [currentView, setCurrentView] = useState('overlay');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  
  const resultCanvasRef = useRef(null);

  // Cargar OpenCV (copiado de tu componente)
  useEffect(() => {
    const checkOpenCV = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        setMessage('✅ OpenCV.js cargado y listo para revisar.');
        clearInterval(checkOpenCV);
      }
    }, 100);
    return () => clearInterval(checkOpenCV);
  }, []);

  // Cargar registros pendientes automáticamente al montar
  useEffect(() => {
    loadPendingRegistrations();
  }, []);

  // Cargar registros PENDIENTES
  const loadPendingRegistrations = async () => {
    setLoading(true);
    setMessage('Cargando registros pendientes...');
    try {
      const { data, error } = await supabase
        .from('user_registrations')
        .select(`
          id, created_at, quality_score, notes, user_code, rgb_points, thermal_points,
          lung_pairs ( id, name, rgb_thumb_path, thermal_thumb_path )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setRegistrations(data);
      setMessage(`✅ ${data.length} registros pendientes cargados.`);
      
    } catch (error) {
      console.error('Error cargando registros:', error);
      setMessage('❌ Error cargando registros: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Cargar imágenes y aplicar TPS automáticamente
  const loadRegistrationDetails = async (regId) => {
    const reg = registrations.find(r => r.id === regId);
    if (!reg) return;

    setLoading(true);
    setMessage('🔄 Cargando imágenes del registro...');
    setSelectedReg(reg);
    setRegisteredImage(null); // Limpiar resultado anterior

    try {
      // 1. Cargar imágenes base (igual que en el registro)
      const rgbUrl = getPublicUrl('thumbnails-rgb', reg.lung_pairs.rgb_thumb_path);
      const thermalUrl = getPublicUrl('thumbnails-thermal', reg.lung_pairs.thermal_thumb_path);
      
      const rgbImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = rgbUrl;
      });
      
      const thermalImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = thermalUrl;
      });

      setRgbImage(rgbImg);
      setThermalImage(thermalImg);
      setMessage('✅ Imágenes cargadas. Aplicando TPS automático...');

      // 2. Aplicar TPS automáticamente
      if (!cvReady) {
        setMessage('❌ OpenCV no está listo. Recarga.');
        setLoading(false);
        return;
      }
      
      const cv = window.cv;
      const rgbDimensions = getScaledDimensions(rgbImg);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = rgbDimensions.width;
      tempCanvas.height = rgbDimensions.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(thermalImg, 0, 0, rgbDimensions.width, rgbDimensions.height);
      
      const thermalScaleX = rgbDimensions.width / thermalImg.width;
      const thermalScaleY = rgbDimensions.height / thermalImg.height;
      const thermalScaleApplied = Math.min(thermalScaleX, thermalScaleY);

      // DE-NORMALIZAR Puntos guardados y aplicar escala del canvas
      const srcPoints = reg.thermal_points.map(p => ({
        x: p.x * thermalImg.width * thermalScaleApplied,
        y: p.y * thermalImg.height * thermalScaleApplied
      }));
      const dstPoints = reg.rgb_points.map(p => ({
        x: p.x * rgbImg.width * rgbDimensions.scale,
        y: p.y * rgbImg.height * rgbDimensions.scale
      }));

      // Aplicar warping (usando tu función)
      const warpedCanvas = applyTPSWarping(cv, tempCanvas, srcPoints, dstPoints, rgbDimensions.width, rgbDimensions.height);
      const img = new Image();
      img.onload = () => {
        setRegisteredImage(img);
        setCurrentView('overlay');
        setMessage('✅ ¡Registro listo para revisión!');
        setLoading(false);
      };
      img.src = warpedCanvas.toDataURL();

    } catch (error) {
      console.error('Error procesando registro:', error);
      setMessage('❌ Error al procesar el registro.');
      setLoading(false);
    }
  };

  // Dibujar el resultado (copiado de tu componente)
  useEffect(() => {
    if (resultCanvasRef.current && rgbImage) {
      const canvas = resultCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const dimensions = getScaledDimensions(rgbImage);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (currentView === 'rgb' || currentView === 'overlay') {
        ctx.drawImage(rgbImage, 0, 0, dimensions.width, dimensions.height);
      }
      if (currentView === 'overlay' && registeredImage) {
        ctx.globalAlpha = overlayOpacity;
        ctx.drawImage(registeredImage, 0, 0, dimensions.width, dimensions.height);
        ctx.globalAlpha = 1;
      } else if (currentView === 'thermal' && registeredImage) {
        ctx.drawImage(registeredImage, 0, 0, dimensions.width, dimensions.height);
      }
    }
  }, [currentView, registeredImage, rgbImage, overlayOpacity]);

  // Función para Aprobar o Rechazar
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedReg) return;
    
    setLoading(true);
    setMessage(`Actualizando estado a: ${newStatus}...`);
    
    try {
      const { error } = await supabase
        .from('user_registrations')
        .update({ status: newStatus })
        .eq('id', selectedReg.id);
        
      if (error) throw error;
      
      setMessage(`✅ Registro ${newStatus}!`);
      
      // Limpiar y recargar la lista
      setRegisteredImage(null);
      setSelectedReg(null);
      setRgbImage(null);
      setThermalImage(null);
      loadPendingRegistrations();
      
    } catch (error) {
      console.error('Error actualizando estado:', error);
      setMessage('❌ Error al actualizar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- UI Principal del Dashboard ---
  // (Sin el 'if (!isAuthenticated)')
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-gray-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2">Panel de Revisión de Registros</h1>
          <p className="text-purple-200">{registrations.length} registros pendientes de revisión</p>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cvReady ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}></div>
            <span className="text-sm text-purple-300">
              {cvReady ? 'OpenCV.js: Listo' : 'OpenCV.js: Cargando...'}
            </span>
          </div>
        </div>

        {/* Selector de Registros */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h3 className="text-white font-semibold mb-3">Selecciona un registro pendiente:</h3>
          <select
            value={selectedReg?.id || ''}
            onChange={(e) => loadRegistrationDetails(e.target.value)}
            disabled={loading || registrations.length === 0}
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
          >
            <option value="" disabled>
              {registrations.length > 0 ? 'Selecciona un registro...' : 'No hay registros pendientes'}
            </option>
            {registrations.map(reg => (
              <option key={reg.id} value={reg.id} className="bg-slate-800">
                {reg.lung_pairs.name} (Por: {reg.user_code || 'N/A'}) - {reg.quality_score} Estrellas
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`border rounded-xl p-4 mb-6 backdrop-blur ${
            message.startsWith('❌') ? 'bg-red-500/20 border-red-400/30' : 
            'bg-blue-500/20 border-blue-400/30'
          }`}>
            <p className={`flex items-center gap-2 ${
              message.startsWith('❌') ? 'text-red-100' :
              'text-blue-100'
            }`}>
              <Info className="w-5 h-5" />
              {message}
            </p>
          </div>
        )}

        {/* Visor de Resultados (Copiado de tu componente) */}
        {registeredImage && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl px-6 pt-4 pb-0 border border-white/20 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-semibold text-lg">Revisando: {selectedReg?.lung_pairs.name}</h3>
              <div className="flex gap-1">
                <button onClick={() => setCurrentView('rgb')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'rgb' ? 'bg-green-500 text-white' : 'bg-white/10 text-white/70'}`}>RGB</button>
                <button onClick={() => setCurrentView('thermal')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'thermal' ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/70'}`}>Térmica</button>
                <button onClick={() => setCurrentView('overlay')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'overlay' ? 'bg-gradient-to-r from-green-500 to-purple-500 text-white' : 'bg-white/10 text-white/70'}`}>Superposición</button>
              </div>
            </div>
            {currentView === 'overlay' && (
              <div className="mb-2">
                <label className="text-white text-xs mb-1 block">Opacidad: {Math.round(overlayOpacity * 100)}%</label>
                <input type="range" min="0" max="1" step="0.01" value={overlayOpacity} onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))} className="w-full" />
              </div>
            )}
            <div className="flex justify-center scale-[0.60] origin-top -mb-[55%]">
              <canvas ref={resultCanvasRef} className="w-full h-auto rounded-lg border-2 border-white/20" />
            </div>
          </div>
        )}

        {/* Panel de Aprobación */}
        {selectedReg && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
            <h3 className="text-white font-semibold text-2xl mb-4">Decisión de Revisión</h3>
            <div className="mb-4">
              <p className="text-purple-200 text-2xl">Calificación de Usuario: 
                <span className="text-yellow-400 font-bold text-4xl ml-2">
                  {'★'.repeat(selectedReg.quality_score)}{'☆'.repeat(5 - selectedReg.quality_score)}
                </span>
              </p>
              <p className="text-purple-200 mt-2 text-2xl">Notas de Usuario:</p>
              <blockquote className="text-white italic border-l-2 border-purple-400 pl-3 py-1 mt-1 text-2xl">
                {selectedReg.notes || "(Sin notas)"}
              </blockquote>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => handleUpdateStatus('approved')}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-2xl font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                Aprobar
              </button>
              <button
                onClick={() => handleUpdateStatus('rejected')}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50"
              >
                <X className="w-5 h-5" />
                Rechazar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminDashboard;