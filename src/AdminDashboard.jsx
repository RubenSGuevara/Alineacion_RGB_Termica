import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Info, Check, X, Star, Archive, Database, Upload, ArrowLeft, Download } from 'lucide-react';
import { supabase, getPublicUrl } from './lib/supabase';

// Importamos el componente UploadView
import UploadView from './UploadView';

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

// ------------------------------------------------------------------
// --- COMPONENTE PRINCIPAL ---
// ------------------------------------------------------------------

const AdminDashboard = ({ accessCode }) => {

  // 1. NUEVO ESTADO PARA CONTROLAR LA VISTA
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'upload'

  // --- ESTADOS DE PENDIENTES ---
  const [registrations, setRegistrations] = useState([]);
  const [selectedReg, setSelectedReg] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [cvReady, setCvReady] = useState(false);

  // Estados para el visor PENDIENTE
  const [rgbImage, setRgbImage] = useState(null);
  const [thermalImage, setThermalImage] = useState(null);
  const [registeredImage, setRegisteredImage] = useState(null);
  const [currentView, setCurrentView] = useState('overlay');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const resultCanvasRef = useRef(null);

  // --- ESTADOS DE VERIFICADOS (NUEVO) ---
  const [verifiedList, setVerifiedList] = useState([]);
  const [selectedVerified, setSelectedVerified] = useState(null);
  // Visor VERIFICADO (Independiente)
  const [verRgbImage, setVerRgbImage] = useState(null);
  const [verThermalImage, setVerThermalImage] = useState(null);
  const [verRegisteredImage, setVerRegisteredImage] = useState(null);
  const [verView, setVerView] = useState('overlay');
  const [verOpacity, setVerOpacity] = useState(0.5);
  const verifiedCanvasRef = useRef(null);

  // Cargar OpenCV
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

  // Cargar listas iniciales
  useEffect(() => {
    loadPendingRegistrations();
    loadVerifiedRegistrations(); // <-- Cargamos también los verificados
  }, []);

  // --- 1. LÓGICA DE PENDIENTES ---

  const loadPendingRegistrations = async () => {
    setLoading(true);
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
      if (data.length === 0 && message === '') setMessage('No hay registros pendientes.');
    } catch (error) {
      console.error('Error cargando registros:', error);
      setMessage('❌ Error cargando registros: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const loadRegistrationDetails = async (regId) => {
    const reg = registrations.find(r => r.id === regId);
    if (!reg) return;

    setLoading(true);
    setMessage('🔄 Cargando imágenes del registro pendiente...');
    setSelectedReg(reg);
    setRegisteredImage(null);

    try {
      // Cargar imágenes base
      const rgbUrl = getPublicUrl('thumbnails-rgb', reg.lung_pairs.rgb_thumb_path);
      const thermalUrl = getPublicUrl('thumbnails-thermal', reg.lung_pairs.thermal_thumb_path);
      
      const [rgbImg, thermalImg] = await Promise.all([
        loadImage(rgbUrl),
        loadImage(thermalUrl)
      ]);

      setRgbImage(rgbImg);
      setThermalImage(thermalImg);

      // Aplicar TPS
      if (!cvReady) {
        setMessage('❌ OpenCV no está listo.');
        setLoading(false);
        return;
      }
      
      await processTPS(reg, rgbImg, thermalImg, setRegisteredImage);
      setMessage('✅ Registro pendiente listo para revisión.');

    } catch (error) {
      console.error('Error procesando:', error);
      setMessage('❌ Error al procesar.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. LÓGICA DE VERIFICADOS (NUEVA) ---

  const loadVerifiedRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from('verified_alignments')
        .select(`
          id, approved_at, original_quality_score, reviewer_notes,
          lung_pairs ( id, name, rgb_thumb_path, thermal_thumb_path )
        `)
        .order('approved_at', { ascending: false }); // Los más recientes primero

      if (error) throw error;
      setVerifiedList(data);
    } catch (error) {
      console.error('Error cargando verificados:', error);
    }
  };

  const loadVerifiedDetails = async (verId) => {
    const ver = verifiedList.find(v => v.id === verId);
    if (!ver) return;

    setLoading(true); // Usamos el mismo loading global
    setMessage('🔄 Cargando registro histórico...');
    setSelectedVerified(ver);
    setVerRegisteredImage(null);

    try {
      // Necesitamos fetchear los puntos de la tabla verified_alignments
      // (el select de arriba ya debería traerlos si incluimos las columnas, vamos a ajustarlo)
      const { data: fullVer, error } = await supabase
        .from('verified_alignments')
        .select('*')
        .eq('id', verId)
        .single();
        
      if (error) throw error;

      // Cargar imágenes
      const rgbUrl = getPublicUrl('thumbnails-rgb', ver.lung_pairs.rgb_thumb_path);
      const thermalUrl = getPublicUrl('thumbnails-thermal', ver.lung_pairs.thermal_thumb_path);
      
      const [rgbImg, thermalImg] = await Promise.all([
        loadImage(rgbUrl),
        loadImage(thermalUrl)
      ]);

      setVerRgbImage(rgbImg);
      setVerThermalImage(thermalImg);

      // Aplicar TPS (reusamos la lógica)
      if (cvReady) {
        // Usamos los puntos guardados en la tabla verified
        await processTPS({
          rgb_points: fullVer.rgb_points,
          thermal_points: fullVer.thermal_points
        }, rgbImg, thermalImg, setVerRegisteredImage);
      }
      
      setMessage('✅ Visualizando registro histórico.');

    } catch (error) {
      console.error('Error histórico:', error);
      setMessage('❌ Error cargando histórico.');
    } finally {
      setLoading(false);
    }
  };

  // --- 3. HELPER FUNCTIONS COMUNES ---

  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  // Función TPS genérica para usar en ambos visores
  const processTPS = async (dataPoints, rgbImg, thermalImg, setImageSetter) => {
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

    const srcPoints = dataPoints.thermal_points.map(p => ({
      x: p.x * thermalImg.width * thermalScaleApplied,
      y: p.y * thermalImg.height * thermalScaleApplied
    }));
    const dstPoints = dataPoints.rgb_points.map(p => ({
      x: p.x * rgbImg.width * rgbDimensions.scale,
      y: p.y * rgbImg.height * rgbDimensions.scale
    }));

    const warpedCanvas = applyTPSWarping(cv, tempCanvas, srcPoints, dstPoints, rgbDimensions.width, rgbDimensions.height);
    
    const img = new Image();
    img.onload = () => setImageSetter(img);
    img.src = warpedCanvas.toDataURL();
  };

  // --- 4. USE EFFECTS PARA DIBUJAR ---

  // Canvas Pendiente
  useEffect(() => {
    drawCanvas(resultCanvasRef, currentView, registeredImage, rgbImage, overlayOpacity);
  }, [currentView, registeredImage, rgbImage, overlayOpacity]);

  // Canvas Verificado (NUEVO)
  useEffect(() => {
    drawCanvas(verifiedCanvasRef, verView, verRegisteredImage, verRgbImage, verOpacity);
  }, [verView, verRegisteredImage, verRgbImage, verOpacity]);

  const drawCanvas = (canvasRef, viewMode, regImg, baseImg, opacity) => {
    if (canvasRef.current && baseImg) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const dimensions = getScaledDimensions(baseImg);
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (viewMode === 'rgb' || viewMode === 'overlay') {
        ctx.drawImage(baseImg, 0, 0, dimensions.width, dimensions.height);
      }
      if (viewMode === 'overlay' && regImg) {
        ctx.globalAlpha = opacity;
        ctx.drawImage(regImg, 0, 0, dimensions.width, dimensions.height);
        ctx.globalAlpha = 1;
      } else if (viewMode === 'thermal' && regImg) {
        ctx.drawImage(regImg, 0, 0, dimensions.width, dimensions.height);
      }
    }
  };

  // --- ACCIONES ---

  const handleUpdateStatus = async (decision) => {
    if (!selectedReg) return;
    setLoading(true);
    const actionText = decision === 'approved' ? 'Aprobando' : 'Rechazando';
    setMessage(`⏳ ${actionText}...`);
    
    try {
      if (decision === 'rejected') {
        await supabase.from('user_registrations').delete().eq('id', selectedReg.id);
        setMessage('🗑️ Registro rechazado y eliminado.');
      } else if (decision === 'approved') {
        await supabase.from('verified_alignments').insert({
            lung_pair_id: selectedReg.lung_pairs.id,
            rgb_points: selectedReg.rgb_points,
            thermal_points: selectedReg.thermal_points,
            original_user_code: selectedReg.user_code,
            original_quality_score: selectedReg.quality_score,
            reviewer_notes: selectedReg.notes
          });
        await supabase.from('user_registrations').delete().eq('id', selectedReg.id);
        setMessage('✅ ¡Alineación verificada y guardada!');
        
        // Recargar lista de verificados
        loadVerifiedRegistrations();
      }
      
      setRegisteredImage(null);
      setSelectedReg(null);
      setRgbImage(null);
      setThermalImage(null);
      loadPendingRegistrations();
      
    } catch (error) {
      console.error('Error:', error);
      setMessage('❌ Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Función para descargar todos los datos verificados
  // Función ROBUSTA para descargar datos masivos (Paginación automática)
  const handleExportData = async () => {
    try {
      setLoading(true);
      setMessage('📦 Iniciando exportación masiva...');

      let allRows = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      // Bucle para descargar por partes (Chunks)
      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        
        // Feedback visual para el usuario
        setMessage(`📦 Descargando registros ${from + 1} - ${to + 1}...`);

        const { data, error } = await supabase
          .from('verified_alignments')
          .select(`
            id, approved_at, 
            original_user_code, original_quality_score, reviewer_notes,
            rgb_points, thermal_points,
            lung_pairs ( name, min_temp, max_temp, mean_temp )
          `)
          .range(from, to) // <--- Aquí está la magia de la paginación
          .order('approved_at', { ascending: true }); // Orden consistente es vital para paginar

        if (error) throw error;

        // Añadir el bloque actual a la lista maestra
        allRows = [...allRows, ...data];

        // Si recibimos menos filas que el límite, es la última página
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        }
        page++;
      }

      setMessage('📦 Generando archivo JSON...');

      // 2. Crear archivo JSON con la lista completa
      const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
        JSON.stringify(allRows, null, 2)
      )}`;
      
      // 3. Disparar descarga
      const link = document.createElement('a');
      link.href = jsonString;
      link.download = `dataset_completo_${new Date().toISOString().slice(0,10)}_(${allRows.length}_registros).json`;
      link.click();

      setMessage(`✅ Exportación exitosa: ${allRows.length} registros totales.`);
      
    } catch (error) {
      console.error('Error exportando:', error);
      setMessage('❌ Error al exportar datos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERIZADO ---
  // --- 2. RENDERIZADO CONDICIONAL DE UPLOAD ---
  if (viewMode === 'upload') {
    return (
      <div className="relative">
        {/* Botón flotante para regresar */}
        <div className="absolute top-6 right-6 z-50">
          <button 
            onClick={() => setViewMode('dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 shadow-lg border border-white/20 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Revisiones
          </button>
        </div>
        {/* Renderizamos el componente de carga */}
        <UploadView accessCode={accessCode} />
      </div>
    );
  }
    // ...
  // Renderizado del Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-gray-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Agregamos 'flex justify-between items-start' para poner el botón a la derecha */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 flex justify-between items-start">
          <h1 className="text-4xl font-bold text-white mb-2">Panel de Revisión</h1>
          <p className="text-purple-200">Administración de alineaciones pendientes y aprobadas</p>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cvReady ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}></div>
            <span className="text-sm text-purple-300">{cvReady ? 'OpenCV.js: Listo' : 'OpenCV.js: Cargando...'}</span>
          </div>
        </div>

        {/* 3. BOTÓN NUEVO PARA IR A SUBIR */}
        <button 
            onClick={() => setViewMode('upload')}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg hover:scale-105 transition-all border border-white/20"
          >
            <Upload className="w-5 h-5" />
            Subir Imágenes
          </button>

        {/* ---------------- SECCIÓN DE PENDIENTES ---------------- */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Eye className="w-5 h-5 text-yellow-400" />
            1. Registros Pendientes ({registrations.length})
          </h3>
          <select
            value={selectedReg?.id || ''}
            onChange={(e) => loadRegistrationDetails(e.target.value)}
            disabled={loading || registrations.length === 0}
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
          >
            <option value="" disabled>
              {registrations.length > 0 ? 'Selecciona para revisar...' : 'No hay registros pendientes'}
            </option>
            {registrations.map(reg => (
              <option key={reg.id} value={reg.id} className="bg-slate-800">
                {reg.lung_pairs.name} (Por: {reg.user_code || 'N/A'}) - {reg.quality_score}★
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className="border rounded-xl p-4 mb-6 backdrop-blur bg-blue-500/20 border-blue-400/30">
            <p className="flex items-center gap-2 text-blue-100">
              <Info className="w-5 h-5" />
              {message}
            </p>
          </div>
        )}

        {/* VISOR PENDIENTE */}
        {registeredImage && selectedReg && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl px-6 pt-4 pb-0 border border-yellow-500/30 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-yellow-100 font-semibold text-lg">Revisando: {selectedReg.lung_pairs.name}</h3>
              <div className="flex gap-1">
                <button onClick={() => setCurrentView('rgb')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'rgb' ? 'bg-green-600 text-white' : 'bg-white/10 text-white/70'}`}>RGB</button>
                <button onClick={() => setCurrentView('thermal')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'thermal' ? 'bg-purple-600 text-white' : 'bg-white/10 text-white/70'}`}>Térmica</button>
                <button onClick={() => setCurrentView('overlay')} className={`px-3 py-1 text-sm rounded-lg transition-all ${currentView === 'overlay' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/70'}`}>Superposición</button>
              </div>
            </div>
            {currentView === 'overlay' && (
              <div className="mb-2">
                <label className="text-white text-xs mb-1 block">Opacidad: {Math.round(overlayOpacity * 100)}%</label>
                <input type="range" min="0" max="1" step="0.01" value={overlayOpacity} onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))} className="w-full accent-yellow-500" />
              </div>
            )}
            <div className="flex justify-center scale-[0.60] origin-top -mb-[55%]">
              <canvas ref={resultCanvasRef} className="w-full h-auto rounded-lg border-2 border-yellow-500/30" />
            </div>
            
            {/* BOTONES DE ACCIÓN */}
            <div className="mt-8 mb-6 p-4 bg-black/20 rounded-xl border border-white/10">
              <div className="mb-4">
                <p className="text-purple-200 text-sm">Calificación: <span className="text-yellow-400 font-bold ml-1">{'★'.repeat(selectedReg.quality_score)}</span></p>
                {selectedReg.notes && <p className="text-white/70 text-sm italic mt-1">"{selectedReg.notes}"</p>}
              </div>
              <div className="flex gap-4">
                <button onClick={() => handleUpdateStatus('approved')} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-all disabled:opacity-50">
                  <Check className="w-5 h-5" /> Aprobar
                </button>
                <button onClick={() => handleUpdateStatus('rejected')} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-all disabled:opacity-50">
                  <X className="w-5 h-5" /> Rechazar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DIVISOR */}
        <div className="my-12 border-t border-white/10 relative">
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-slate-800 px-4 text-white/30 text-sm uppercase tracking-widest">
            Historial de Verificaciones
          </div>
        </div>

        {/* ---------------- SECCIÓN DE VERIFICADOS (NUEVA) ---------------- */}
        <div className="bg-emerald-900/20 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-emerald-500/30">
          <h3 className="text-emerald-100 font-semibold mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            2. Registros Aprobados ({verifiedList.length})
          </h3>

          {/* BOTÓN DE EXPORTAR */}
          <button
              onClick={handleExportData}
              disabled={loading || verifiedList.length === 0}
              className="text-xs flex items-center gap-1 px-3 py-1 bg-emerald-600/50 hover:bg-emerald-500 text-white rounded border border-emerald-500/50 transition-all disabled:opacity-50"
            >
              <Download className="w-3 h-3" /> Exportar JSON
          </button>

          <select
            value={selectedVerified?.id || ''}
            onChange={(e) => loadVerifiedDetails(e.target.value)}
            disabled={loading || verifiedList.length === 0}
            className="w-full px-4 py-3 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="" disabled>
              {verifiedList.length > 0 ? 'Selecciona para visualizar historial...' : 'No hay registros aprobados aún'}
            </option>
            {verifiedList.map(ver => (
              <option key={ver.id} value={ver.id} className="bg-slate-800">
                {ver.lung_pairs.name} - Aprobado: {new Date(ver.approved_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        {/* VISOR VERIFICADO */}
        {verRegisteredImage && selectedVerified && (
          <div className="bg-emerald-900/10 backdrop-blur-lg rounded-2xl px-6 pt-4 pb-6 border border-emerald-500/30 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-emerald-100 font-semibold text-lg flex items-center gap-2">
                <Archive className="w-4 h-4" /> Histórico: {selectedVerified.lung_pairs.name}
              </h3>
              <div className="flex gap-1">
                <button onClick={() => setVerView('rgb')} className={`px-3 py-1 text-sm rounded-lg transition-all ${verView === 'rgb' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70'}`}>RGB</button>
                <button onClick={() => setVerView('thermal')} className={`px-3 py-1 text-sm rounded-lg transition-all ${verView === 'thermal' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70'}`}>Térmica</button>
                <button onClick={() => setVerView('overlay')} className={`px-3 py-1 text-sm rounded-lg transition-all ${verView === 'overlay' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70'}`}>Superposición</button>
              </div>
            </div>
            
            {verView === 'overlay' && (
              <div className="mb-2">
                <label className="text-emerald-100/70 text-xs mb-1 block">Opacidad: {Math.round(verOpacity * 100)}%</label>
                <input type="range" min="0" max="1" step="0.01" value={verOpacity} onChange={(e) => setVerOpacity(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
              </div>
            )}

            <div className="flex justify-center scale-[0.60] origin-top -mb-[55%]">
              <canvas ref={verifiedCanvasRef} className="w-full h-auto rounded-lg border-2 border-emerald-500/30" />
            </div>

            <div className="mt-8 text-center text-emerald-200/50 text-sm">
              Visualización de solo lectura
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminDashboard;