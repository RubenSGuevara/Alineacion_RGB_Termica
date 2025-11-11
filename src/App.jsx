import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Download, Play, Eye, EyeOff, Info, AlertCircle, Lock, Check } from 'lucide-react';
import { supabase, getPublicUrl } from './lib/supabase';

const TPSImageRegistration = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [lungPairs, setLungPairs] = useState([]);
  const [selectedPair, setSelectedPair] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rgbImage, setRgbImage] = useState(null);
  const [thermalImage, setThermalImage] = useState(null);
  const [rgbPoints, setRgbPoints] = useState([]);
  const [thermalPoints, setThermalPoints] = useState([]);
  const [registeredImage, setRegisteredImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentView, setCurrentView] = useState('rgb');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [showPoints, setShowPoints] = useState(true);
  const [message, setMessage] = useState('');
  const [cvReady, setCvReady] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  
  const rgbCanvasRef = useRef(null);
  const thermalCanvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  
  const MAX_CANVAS_WIDTH = 800;
  const MAX_CANVAS_HEIGHT = 600;

  useEffect(() => {
    const checkOpenCV = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        setMessage('✅ OpenCV.js cargado y listo para usar.');
        clearInterval(checkOpenCV);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkOpenCV);
      if (!cvReady) {
        setMessage('⚠️ OpenCV.js está tardando en cargar. Por favor recarga la página.');
      }
    }, 10000);

    return () => clearInterval(checkOpenCV);
  }, [cvReady]);

  const handleAuthentication = () => {
    const correctCode = import.meta.env.VITE_ACCESS_CODE || 'LUNG2024';
    if (accessCode === correctCode) {
      setIsAuthenticated(true);
      setAuthError('');
      loadLungPairs();
    } else {
      setAuthError('❌ Código de acceso incorrecto');
    }
  };

  const loadLungPairs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lung_pairs')
        .select('id, name, rgb_thumb_path, thermal_thumb_path, min_temp, max_temp');
      
      if (error) throw error;
      
      // Ordenamiento natural (1, 2, 10 en vez de 1, 10, 2)
      const sortedData = data.sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      });
      
      setLungPairs(sortedData);
      setMessage(`✅ ${sortedData.length} pares de pulmones cargados.`);
    } catch (error) {
      console.error('Error cargando pares:', error);
      setMessage('❌ Error cargando datos de Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedPair = async (pairId) => {
    const pair = lungPairs.find(p => p.id === pairId);
    if (!pair) return;

    setLoading(true);
    setMessage('🔄 Cargando imágenes...');
    setSelectedPair(pair);
    setRgbPoints([]);
    setThermalPoints([]);
    setRegisteredImage(null);

    try {
      const rgbUrl = getPublicUrl('thumbnails-rgb', pair.rgb_thumb_path);
      const thermalUrl = getPublicUrl('thumbnails-thermal', pair.thermal_thumb_path);

      const rgbImg = new Image();
      rgbImg.crossOrigin = 'anonymous';
      rgbImg.onload = () => setRgbImage(rgbImg);
      rgbImg.onerror = () => setMessage('❌ Error cargando imagen RGB');
      rgbImg.src = rgbUrl;

      const thermalImg = new Image();
      thermalImg.crossOrigin = 'anonymous';
      thermalImg.onload = () => {
        setThermalImage(thermalImg);
        setMessage(`✅ Imágenes cargadas: ${pair.name}`);
        setLoading(false);
      };
      thermalImg.onerror = () => {
        setMessage('❌ Error cargando imagen térmica');
        setLoading(false);
      };
      thermalImg.src = thermalUrl;
    } catch (error) {
      console.error('Error cargando imágenes:', error);
      setMessage('❌ Error cargando imágenes.');
      setLoading(false);
    }
  };

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

  const drawImageWithPoints = (canvas, image, points, color) => {
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    const dimensions = getScaledDimensions(image);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    
    if (showPoints && points.length > 0) {
      points.forEach((point, idx) => {
        const scaledX = point.x * dimensions.scale;
        const scaledY = point.y * dimensions.scale;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(scaledX, scaledY, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(idx + 1, scaledX + 10, scaledY - 10);
        ctx.fillText(idx + 1, scaledX + 10, scaledY - 10);
      });
      
      if (points.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(points[0].x * dimensions.scale, points[0].y * dimensions.scale);
        points.forEach(point => {
          ctx.lineTo(point.x * dimensions.scale, point.y * dimensions.scale);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  const handleCanvasClick = (e, type) => {
    const canvas = type === 'rgb' ? rgbCanvasRef.current : thermalCanvasRef.current;
    const image = type === 'rgb' ? rgbImage : thermalImage;
    const points = type === 'rgb' ? rgbPoints : thermalPoints;
    const rect = canvas.getBoundingClientRect();
    const dimensions = getScaledDimensions(image);
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const x = canvasX / dimensions.scale;
    const y = canvasY / dimensions.scale;
    
    if (deleteMode) {
      const threshold = 15 / dimensions.scale;
      let closestIndex = -1;
      let closestDistance = Infinity;
      points.forEach((point, idx) => {
        const dx = x - point.x;
        const dy = y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < threshold && distance < closestDistance) {
          closestDistance = distance;
          closestIndex = idx;
        }
      });
      if (closestIndex !== -1) {
        if (type === 'rgb') {
          const newPoints = rgbPoints.filter((_, idx) => idx !== closestIndex);
          setRgbPoints(newPoints);
          setMessage(`❌ Punto ${closestIndex + 1} eliminado de RGB. ${newPoints.length} puntos restantes.`);
        } else {
          const newPoints = thermalPoints.filter((_, idx) => idx !== closestIndex);
          setThermalPoints(newPoints);
          setMessage(`❌ Punto ${closestIndex + 1} eliminado de Térmica. ${newPoints.length} puntos restantes.`);
        }
        setRegisteredImage(null);
      } else {
        setMessage('⚠️ No hay puntos cercanos. Haz clic más cerca de un punto.');
      }
      return;
    }
    
    if (type === 'rgb') {
      const newPoints = [...rgbPoints, { x, y }];
      setRgbPoints(newPoints);
      setMessage(`Punto ${newPoints.length} marcado en RGB. ${newPoints.length >= 4 ? '✓ Listo!' : `Necesitas ${4 - newPoints.length} más.`}`);
    } else {
      const newPoints = [...thermalPoints, { x, y }];
      setThermalPoints(newPoints);
      setMessage(`Punto ${newPoints.length} marcado en Térmica. ${newPoints.length >= 4 ? '✓ Listo!' : `Necesitas ${4 - newPoints.length} más.`}`);
    }
  };

  const applyTPSRegistration = async () => {
    if (!cvReady) {
      setMessage('❌ OpenCV.js aún no está cargado.');
      return;
    }
    if (!rgbImage || !thermalImage) {
      setMessage('❌ Necesitas cargar ambas imágenes.');
      return;
    }
    if (rgbPoints.length < 4 || thermalPoints.length < 4) {
      setMessage('❌ Necesitas al menos 4 puntos en cada imagen.');
      return;
    }
    if (rgbPoints.length !== thermalPoints.length) {
      setMessage('❌ El número de puntos debe coincidir.');
      return;
    }

    setIsProcessing(true);
    setMessage('🔄 Procesando registro TPS...');

    try {
      const cv = window.cv;
      const tempCanvas = document.createElement('canvas');
      const rgbDimensions = getScaledDimensions(rgbImage);
      tempCanvas.width = rgbDimensions.width;
      tempCanvas.height = rgbDimensions.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(thermalImage, 0, 0, rgbDimensions.width, rgbDimensions.height);
      const src = cv.imread(tempCanvas);
      const dst = new cv.Mat();
      const thermalScaleX = rgbDimensions.width / thermalImage.width;
      const thermalScaleY = rgbDimensions.height / thermalImage.height;
      const thermalScaleApplied = Math.min(thermalScaleX, thermalScaleY);
      const srcPoints = thermalPoints.map(p => ({
        x: p.x * thermalScaleApplied,
        y: p.y * thermalScaleApplied
      }));
      const dstPoints = rgbPoints.map(p => ({
        x: p.x * rgbDimensions.scale,
        y: p.y * rgbDimensions.scale
      }));
      const warpedCanvas = applyTPSWarping(cv, tempCanvas, srcPoints, dstPoints, rgbDimensions.width, rgbDimensions.height);
      const img = new Image();
      img.onload = () => {
        setRegisteredImage(img);
        setCurrentView('overlay');
        setMessage('✅ Registro TPS completado!');
        setIsProcessing(false);
      };
      img.src = warpedCanvas.toDataURL();
      src.delete();
      dst.delete();
    } catch (error) {
      console.error('Error en TPS:', error);
      setMessage('❌ Error: ' + error.message);
      setIsProcessing(false);
    }
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

  const saveRegistration = async () => {
    if (!selectedPair || rgbPoints.length < 4 || thermalPoints.length < 4) {
      setMessage('❌ Necesitas completar el registro antes de guardar.');
      return;
    }

    setLoading(true);
    setMessage('💾 Guardando registro...');

    try {
      const normalizedRgbPoints = rgbPoints.map(p => ({
        x: p.x / rgbImage.width,
        y: p.y / rgbImage.height
      }));

      const normalizedThermalPoints = thermalPoints.map(p => ({
        x: p.x / thermalImage.width,
        y: p.y / thermalImage.height
      }));

      const { data, error } = await supabase
        .from('user_registrations')
        .insert({
          lung_pair_id: selectedPair.id,
          user_code: accessCode,
          rgb_points: normalizedRgbPoints,
          thermal_points: normalizedThermalPoints,
          status: 'pending'
        })
        .select();

      if (error) throw error;

      setMessage('✅ Registro guardado exitosamente! ID: ' + data[0].id);
    } catch (error) {
      console.error('Error guardando:', error);
      setMessage('❌ Error guardando registro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    drawImageWithPoints(rgbCanvasRef.current, rgbImage, rgbPoints, '#00ff00');
  }, [rgbImage, rgbPoints, showPoints]);

  useEffect(() => {
    drawImageWithPoints(thermalCanvasRef.current, thermalImage, thermalPoints, '#ff00ff');
  }, [thermalImage, thermalPoints, showPoints]);

  const handleReset = () => {
    setRgbPoints([]);
    setThermalPoints([]);
    setRegisteredImage(null);
    setMessage('Puntos eliminados. Comienza de nuevo.');
  };

  const handleDownload = () => {
    if (!resultCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${selectedPair?.name || 'registered'}_result.png`;
    link.href = resultCanvasRef.current.toDataURL();
    link.click();
    setMessage('✅ Imagen descargada!');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-purple-500 rounded-full flex items-center justify-center">
              <Lock className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white text-center mb-2">
            Acceso Restringido
          </h1>
          <p className="text-purple-200 text-center mb-6">
            Ingresa el código de acceso para continuar
          </p>
          <input
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAuthentication()}
            placeholder="Código de acceso"
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {authError && (
            <p className="text-red-400 text-sm mb-4">{authError}</p>
          )}
          <button
            onClick={handleAuthentication}
            className="w-full py-3 bg-gradient-to-r from-green-500 to-purple-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
          >
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-purple-500 rounded-xl flex items-center justify-center">
              🔬
            </div>
            Registro RGB-Térmica con TPS
          </h1>
          <p className="text-purple-200">Alineación no rígida usando Thin-Plate Splines</p>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cvReady ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`}></div>
            <span className="text-sm text-purple-300">
              {cvReady ? 'OpenCV.js: Listo' : 'OpenCV.js: Cargando...'}
            </span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <h3 className="text-white font-semibold mb-3">Selecciona un par de pulmón:</h3>
          <select
            value={selectedPair?.id || ''}
            onChange={(e) => loadSelectedPair(e.target.value)}
            disabled={loading || lungPairs.length === 0}
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
          >
            <option value="" disabled>Selecciona una opción...</option>
            {lungPairs.map(pair => (
              <option key={pair.id} value={pair.id} className="bg-slate-800">
                {pair.name} {pair.min_temp && `(${pair.min_temp.toFixed(1)}°C - ${pair.max_temp.toFixed(1)}°C)`}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className={`border rounded-xl p-4 mb-6 backdrop-blur ${deleteMode ? 'bg-orange-500/20 border-orange-400/30' : 'bg-blue-500/20 border-blue-400/30'}`}>
            <p className={`flex items-center gap-2 ${deleteMode ? 'text-orange-100' : 'text-blue-100'}`}>
              <Info className="w-5 h-5" />
              {message}
            </p>
          </div>
        )}

        {(rgbImage || thermalImage) && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {rgbImage && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                    Imagen RGB ({rgbPoints.length} puntos)
                  </h3>
                  <span className="text-xs text-purple-300">Original: {rgbImage.width}×{rgbImage.height}</span>
                </div>
                <canvas
                  ref={rgbCanvasRef}
                  onClick={(e) => handleCanvasClick(e, 'rgb')}
                  className={`w-full h-auto rounded-lg border-2 border-green-400/50 hover:border-green-400 transition-all ${deleteMode ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
                />
              </div>
            )}
            {thermalImage && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-400 rounded-full"></div>
                    Imagen Térmica ({thermalPoints.length} puntos)
                  </h3>
                  <span className="text-xs text-purple-300">Original: {thermalImage.width}×{thermalImage.height}</span>
                </div>
                <canvas
                  ref={thermalCanvasRef}
                  onClick={(e) => handleCanvasClick(e, 'thermal')}
                  className={`w-full h-auto rounded-lg border-2 border-purple-400/50 hover:border-purple-400 transition-all ${deleteMode ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
                />
              </div>
            )}
          </div>
        )}

        {rgbImage && thermalImage && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={applyTPSRegistration}
                disabled={isProcessing || !cvReady || rgbPoints.length < 4 || thermalPoints.length < 4}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-purple-500 text-white rounded-xl font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <Play className="w-5 h-5" />
                {isProcessing ? 'Procesando...' : 'Aplicar Registro TPS'}
              </button>
              <button onClick={handleReset} className="flex items-center gap-2 px-6 py-3 bg-red-500/20 text-red-300 rounded-xl font-semibold hover:bg-red-500/30 transition-all border border-red-400/30">
                <RotateCcw className="w-5 h-5" />
                Reset Puntos
              </button>
              <button
                onClick={() => {
                  setDeleteMode(!deleteMode);
                  if (!deleteMode) {
                    setMessage('🗑️ Modo Eliminar activado. Click en un punto para eliminarlo.');
                  } else {
                    setMessage('➕ Modo Agregar activado. Click para marcar puntos.');
                  }
                }}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all border ${deleteMode ? 'bg-orange-500 text-white border-orange-600' : 'bg-orange-500/20 text-orange-300 border-orange-400/30 hover:bg-orange-500/30'}`}
              >
                <AlertCircle className="w-5 h-5" />
                {deleteMode ? 'Modo: Eliminar ✓' : 'Modo: Eliminar'}
              </button>
              <button
                onClick={() => setShowPoints(!showPoints)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500/20 text-blue-300 rounded-xl font-semibold hover:bg-blue-500/30 transition-all border border-blue-400/30"
              >
                {showPoints ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                {showPoints ? 'Ocultar' : 'Mostrar'} Puntos
              </button>
              {registeredImage && (
                <>
                  <button
                    onClick={saveRegistration}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-green-500/20 text-green-300 rounded-xl font-semibold hover:bg-green-500/30 transition-all border border-green-400/30 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    {loading ? 'Guardando...' : 'Guardar Registro'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-500/20 text-blue-300 rounded-xl font-semibold hover:bg-blue-500/30 transition-all border border-blue-400/30"
                  >
                    <Download className="w-5 h-5" />
                    Descargar Resultado
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {registeredImage && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl px-6 pt-4 pb-0 border border-white/20 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-semibold text-lg">Resultado del Registro</h3>
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

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            Instrucciones de Uso
          </h3>
          <ol className="text-purple-200 space-y-2 list-decimal list-inside">
            <li>Espera a que OpenCV.js termine de cargar (indicador verde arriba)</li>
            <li>Selecciona un par de pulmón del menú desplegable</li>
            <li>Haz clic en puntos correspondientes en ambas imágenes (mínimo 4 cada una)</li>
            <li>Para eliminar un punto: activa "Modo: Eliminar" y haz clic cerca del punto</li>
            <li>Los puntos deben coincidir: punto 1 RGB = punto 1 Térmica, etc.</li>
            <li>Haz clic en "Aplicar Registro TPS" para deformar la imagen Térmica</li>
            <li>Usa el slider de opacidad para verificar la calidad del alineamiento</li>
            <li>Click en "Guardar Registro" para enviar tus puntos a la base de datos</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default TPSImageRegistration;