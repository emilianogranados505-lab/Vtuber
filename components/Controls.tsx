import React, { useState, useEffect } from 'react';
import { AvatarConfig, ConnectionStatus } from '../types';

interface ControlsProps {
  status: ConnectionStatus;
  config: AvatarConfig;
  onConfigChange: (newConfig: AvatarConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadSample: () => void;
  isCameraEnabled: boolean;
  onToggleCamera: () => void;
  onCalibrate: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ status, config, onConfigChange, onConnect, onDisconnect, onLoadSample, isCameraEnabled, onToggleCamera, onCalibrate }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isStandalone, setIsStandalone] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Detect if running in browser or app mode
  useEffect(() => {
    const isApp = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!isApp);

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setIsStandalone(false); // Enable install button
    });
  }, []);

  const handleInstallClick = async () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
              setDeferredPrompt(null);
          }
      } else {
          alert("Para instalar: Toca el menú del navegador (⋮) y elige 'Agregar a pantalla principal' o 'Instalar'.");
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'modelUrl' | 'bgUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      if (field === 'modelUrl' && file.size > 50 * 1024 * 1024) {
         const confirmUpload = window.confirm(`Este archivo es grande (${(file.size / (1024*1024)).toFixed(1)}MB). ¿Continuar?`);
         if (!confirmUpload) {
           e.target.value = ''; 
           return;
         }
      }

      const url = URL.createObjectURL(file);
      onConfigChange({
        ...config,
        [field]: url
      });
    }
  };

  const handleLoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      onConfigChange({
        ...config,
        lore: text
      });
    }
  };

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="absolute top-6 left-4 z-50 p-4 bg-vtuber-panel/90 backdrop-blur-md rounded-full border border-white/10 shadow-xl text-vtuber-secondary active:scale-95 transition-all"
        title="Configuración"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md overflow-y-auto animate-in fade-in flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-white/10 bg-vtuber-dark sticky top-0 z-10">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-vtuber-secondary to-vtuber-accent">
          VTUBER STUDIO
        </h1>
        <button 
          onClick={() => setIsOpen(false)}
          className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 active:scale-90 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-8 pb-20">

        {/* INSTALL BUTTON: Only visible if not in app mode */}
        {!isStandalone && (
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-4 rounded-xl border border-purple-500 shadow-lg flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg">
                        <svg className="w-6 h-6 text-purple-900" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 11V5a1 1 0 112 0v6h2a1 1 0 010 2h-4a1 1 0 010-2h2z" /></svg>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-white">Instalar App</span>
                        <span className="text-xs text-purple-200">Para una mejor experiencia a pantalla completa</span>
                    </div>
                </div>
                <button 
                    onClick={handleInstallClick}
                    className="w-full py-2 bg-white text-purple-900 font-bold rounded-lg text-sm mt-2 hover:bg-gray-100"
                >
                    AGREGAR A INICIO
                </button>
            </div>
        )}
        
        {/* Name Input */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">Nombre del Avatar</label>
          <input 
            type="text" 
            value={config.name}
            onChange={(e) => onConfigChange({...config, name: e.target.value})}
            className="w-full bg-vtuber-panel border-2 border-white/10 rounded-xl px-4 py-3 text-lg text-white focus:border-vtuber-secondary outline-none transition-colors"
            placeholder="Ej: Sakura"
            disabled={isConnected}
          />
        </div>

        {/* Camera Toggle */}
        <div className="bg-vtuber-panel p-5 rounded-xl border border-white/10 flex flex-col gap-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-base font-bold text-white">Face Tracking</span>
                <span className="text-xs text-gray-400">Usar cámara frontal</span>
            </div>
            <button 
               onClick={onToggleCamera}
               className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative ${isCameraEnabled ? 'bg-vtuber-secondary' : 'bg-gray-700'}`}
            >
              <div className={`w-6 h-6 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${isCameraEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
            </button>
          </div>
          
          {isCameraEnabled && (
            <button 
              onClick={onCalibrate}
              className="w-full py-3 bg-vtuber-secondary/20 active:bg-vtuber-secondary/40 text-vtuber-secondary font-bold uppercase tracking-wider rounded-lg border border-vtuber-secondary/50 transition-colors"
            >
              Calibrar Rostro (Neutral)
            </button>
          )}
        </div>

        {/* Model Upload */}
        <div className="space-y-2">
            <label className="text-sm font-bold text-vtuber-accent uppercase tracking-widest">Modelo 3D (.vrm)</label>
            <label className={`block w-full aspect-[3/1] rounded-xl border-2 border-dashed border-vtuber-accent/50 bg-vtuber-accent/5 active:bg-vtuber-accent/10 transition-colors cursor-pointer relative overflow-hidden ${isConnected ? 'opacity-50' : ''}`}>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <svg className="w-8 h-8 text-vtuber-accent mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                 <span className="text-sm font-bold text-vtuber-accent">
                    {config.modelUrl ? "Cambiar Archivo" : "Subir VRM"}
                 </span>
              </div>
              <input 
                type="file" 
                accept=".vrm,.glb,.gltf" 
                className="hidden" 
                onChange={(e) => handleFileUpload(e, 'modelUrl')}
                disabled={isConnected}
              />
            </label>
            {!config.modelUrl && (
                 <button 
                   onClick={onLoadSample}
                   disabled={isConnected}
                   className="w-full py-3 text-sm font-semibold text-gray-400 bg-white/5 rounded-xl hover:bg-white/10"
                 >
                   ¿No tienes modelo? Usar Demo
                 </button>
            )}
        </div>

        {/* Other Uploads Row */}
        <div className="grid grid-cols-2 gap-4">
             {/* Lore */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Historia (.txt)</label>
                <label className="flex items-center justify-center w-full h-12 bg-vtuber-panel border border-white/10 rounded-lg active:bg-white/5">
                   <span className="text-xs text-gray-300 truncate px-2">{config.lore ? "✓ Cargado" : "Subir"}</span>
                   <input type="file" accept=".txt" className="hidden" onChange={handleLoreUpload} disabled={isConnected}/>
                </label>
             </div>
             {/* BG */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">Fondo</label>
                <label className="flex items-center justify-center w-full h-12 bg-vtuber-panel border border-white/10 rounded-lg active:bg-white/5">
                   <span className="text-xs text-gray-300 truncate px-2">{config.bgUrl ? "✓ Imagen" : "Subir"}</span>
                   <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'bgUrl')}/>
                </label>
             </div>
        </div>

        {/* Main Action Button */}
        <div className="pt-4">
            <button
            onClick={() => {
                if(isConnected) onDisconnect();
                else {
                    setIsOpen(false);
                    onConnect();
                }
            }}
            disabled={isConnecting || !config.modelUrl}
            className={`w-full py-4 rounded-xl font-black text-lg tracking-widest uppercase shadow-lg transform active:scale-95 transition-all
                ${isConnected 
                ? 'bg-red-500 text-white shadow-red-500/30' 
                : 'bg-gradient-to-r from-vtuber-secondary to-vtuber-accent text-vtuber-dark shadow-vtuber-accent/30 disabled:opacity-50 disabled:cursor-not-allowed'}
            `}
            >
            {isConnecting ? 'Conectando...' : isConnected ? 'Detener Live' : 'INICIAR LIVE'}
            </button>
        </div>
      </div>
    </div>
  );
};