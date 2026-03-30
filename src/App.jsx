import React, { useState } from 'react';
import { Lock } from 'lucide-react';

import UserView from './UserView';
import AdminDashboard from './AdminDashboard';
import UploadView from './UploadView';

function App() {
  const [view, setView] = useState('login'); 
  const [accessCode, setAccessCode] = useState('');
  const [authError, setAuthError] = useState('');

  const handleAuthentication = () => {
    const userCode = import.meta.env.VITE_ACCESS_CODE;
    const adminCode = import.meta.env.VITE_ADMIN_CODE;
    const uploadCode = import.meta.env.VITE_UPLOAD_CODE;

    if (accessCode === userCode) {
      setView('user'); 
      setAuthError('');
    } else if (accessCode === adminCode) {
      setView('admin'); 
      setAuthError('');
    } else if (accessCode === uploadCode) {
      setView('upload'); 
      setAuthError('');
    } else {
      setAuthError('❌ Código de acceso incorrecto');
    }
  };

  if (view === 'login') {
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

  if (view === 'user') {
    return <UserView accessCode={accessCode} />;
  }

  if (view === 'admin') {
    return <AdminDashboard accessCode={accessCode} />;
  }
  
  if (view === 'upload') {
    return <UploadView accessCode={accessCode} />;
  }
}

export default App;