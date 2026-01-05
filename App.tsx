import React, { useState, useEffect, useRef } from 'react';
import { LiveClient } from './services/liveClient';
import { AvatarDisplay } from './components/AvatarDisplay';
import { Controls } from './components/Controls';
import { AvatarConfig, ConnectionStatus } from './types';

// Standard sample model from VRM Consortium
const SAMPLE_VRM_URL = "https://raw.githubusercontent.com/pixiv/three-vrm/master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm";

// Splash Screen Component
const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Show splash for 2.5 seconds total
    const timer1 = setTimeout(() => setFading(true), 2000);
    const timer2 = setTimeout(onComplete, 2500); 
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[100] bg-vtuber-dark flex flex-col items-center justify-center transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      <div className="relative">
        <div className="absolute inset-0 bg-vtuber-secondary blur-3xl opacity-20 animate-pulse"></div>
        <img 
          src="https://cdn-icons-png.flaticon.com/512/3408/3408569.png" 
          alt="Logo" 
          className="w-32 h-32 relative z-10 animate-bounce-talk"
        />
      </div>
      <h1 className="mt-6 text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-vtuber-secondary to-vtuber-accent tracking-widest">
        VTUBER STUDIO
      </h1>
      <div className="mt-4 flex gap-2">
        <div className="w-2 h-2 rounded-full bg-vtuber-secondary animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="w-2 h-2 rounded-full bg-vtuber-secondary animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-2 h-2 rounded-full bg-vtuber-secondary animate-bounce" style={{ animationDelay: '0.4s' }}></div>
      </div>
      <p className="absolute bottom-10 text-xs text-gray-500 uppercase tracking-widest">Powered by Gemini AI</p>
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [config, setConfig] = useState<AvatarConfig>({
    modelUrl: null, 
    bgUrl: null,
    name: "AI VTuber",
    lore: ""
  });
  const [isAiTalking, setIsAiTalking] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0); 
  const [isCameraEnabled, setIsCameraEnabled] = useState(false); // Camera State
  
  const liveClientRef = useRef<LiveClient | null>(null);
  const avatarDisplayRef = useRef<{ calibrate: () => void }>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
      }
    };
  }, []);

  const handleLoadSample = () => {
    setConfig(prev => ({ ...prev, modelUrl: SAMPLE_VRM_URL, name: "Avatar Demo" }));
  };

  const handleConnect = async () => {
    if (!process.env.API_KEY) {
      alert("API Key missing! Ensure process.env.API_KEY is set.");
      return;
    }

    if (!config.modelUrl) {
      alert("Por favor sube un modelo 3D (.vrm) primero o usa el de prueba.");
      return;
    }

    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      const client = new LiveClient(process.env.API_KEY);
      
      // Setup callbacks
      client.onAiSpeakingStart = () => setIsAiTalking(true);
      client.onAiSpeakingStop = () => setIsAiTalking(false);
      client.onUserVolumeChange = (vol) => setUserVolume(vol); // User Mic Volume
      client.onAiVolumeChange = (vol) => setAiVolume(vol); // AI Output Volume
      
      client.onError = (err) => {
        alert(err);
        setStatus(ConnectionStatus.ERROR);
        handleDisconnect();
      };

      // Define persona based on user config and uploaded Lore
      const baseInstruction = `
        You are acting as a Virtual YouTuber (VTuber) named ${config.name}.
        Your personality is energetic, fun, and engaging.
        You are talking to your chat or a collaborator.
        Keep responses concise and spoken-style.
        Language: Spanish (or adapt to user).
      `;

      const loreInstruction = config.lore ? `
        \n\nCHARACTER BACKSTORY / LORE:
        ${config.lore}
        \n\nUse this lore to inform your personality and responses, but don't just recite it.
      ` : "";

      await client.connect(baseInstruction + loreInstruction);
      
      liveClientRef.current = client;
      setStatus(ConnectionStatus.CONNECTED);

    } catch (e) {
      console.error(e);
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleDisconnect = () => {
    if (liveClientRef.current) {
      liveClientRef.current.disconnect();
      liveClientRef.current = null;
    }
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsAiTalking(false);
    setUserVolume(0);
    setAiVolume(0);
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans text-white">
      {/* Native Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Main Avatar Stage */}
      <AvatarDisplay 
        ref={avatarDisplayRef}
        config={config} 
        status={status} 
        isAiTalking={isAiTalking}
        userVolume={userVolume}
        aiVolume={aiVolume}
        isCameraEnabled={isCameraEnabled}
      />

      {/* UI Controls - Only show after splash */}
      {!showSplash && (
        <Controls 
            status={status}
            config={config}
            onConfigChange={setConfig}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onLoadSample={handleLoadSample}
            isCameraEnabled={isCameraEnabled}
            onToggleCamera={() => setIsCameraEnabled(!isCameraEnabled)}
            onCalibrate={() => avatarDisplayRef.current?.calibrate()}
        />
      )}

      {/* Connection Overlay (if error) */}
      {status === ConnectionStatus.ERROR && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-vtuber-panel p-6 rounded-xl border border-red-500 text-center">
            <h2 className="text-xl font-bold text-red-500 mb-2">Error de Conexión</h2>
            <p className="text-gray-400 mb-4">Verifica tu API Key y conexión a internet.</p>
            <button 
              onClick={() => setStatus(ConnectionStatus.DISCONNECTED)}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-sm transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;