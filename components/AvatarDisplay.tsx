import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { AvatarConfig, ConnectionStatus } from '../types';
import { FaceTracker } from '../services/faceTracker';

interface AvatarDisplayProps {
  config: AvatarConfig;
  status: ConnectionStatus;
  isAiTalking: boolean;
  aiVolume: number;
  userVolume: number;
  isCameraEnabled: boolean;
  onTrackerReady?: (tracker: FaceTracker) => void; 
}

export const AvatarDisplay = forwardRef<{ calibrate: () => void }, AvatarDisplayProps>(({ config, status, isAiTalking, aiVolume, userVolume, isCameraEnabled }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null); 
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [calibrationMsg, setCalibrationMsg] = useState<string | null>(null);
  
  const vrmRef = useRef<any>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const faceTrackerRef = useRef<FaceTracker>(new FaceTracker());
  
  const isAiTalkingRef = useRef(isAiTalking);
  const aiVolumeRef = useRef(aiVolume);
  const isCameraEnabledRef = useRef(isCameraEnabled);
  
  const blinkTimeoutRef = useRef<any>(null);
  const isBlinkingRef = useRef(false);

  // Expose Calibrate method to parent
  useImperativeHandle(ref, () => ({
    calibrate: () => {
        if (faceTrackerRef.current) {
            faceTrackerRef.current.calibrate();
            setCalibrationMsg("CALIBRACIÓN COMPLETADA");
            setTimeout(() => setCalibrationMsg(null), 2000);
        }
    }
  }));

  useEffect(() => {
    isAiTalkingRef.current = isAiTalking;
    aiVolumeRef.current = aiVolume;
    isCameraEnabledRef.current = isCameraEnabled;
  }, [isAiTalking, aiVolume, isCameraEnabled]);

  // Handle Camera
  useEffect(() => {
    const tracker = faceTrackerRef.current;
    
    const initCamera = async () => {
        if (isCameraEnabled && videoRef.current) {
            try {
                await tracker.start(videoRef.current);
                const checkInterval = setInterval(() => {
                    const hasShapes = Object.keys(tracker.currentBlendshapes).length > 0;
                    setFaceDetected(prev => (prev !== hasShapes ? hasShapes : prev));
                }, 1000);
                return () => clearInterval(checkInterval);
            } catch(e) {
                console.error("Camera failed to start", e);
                alert("No se pudo acceder a la cámara.");
            }
        } else {
            tracker.stop();
            setFaceDetected(false);
        }
    };

    initCamera();
    return () => { 
        tracker.stop(); 
        setFaceDetected(false);
    };
  }, [isCameraEnabled]);

  // Three.js Setup
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x0f0f1a, 0.04);

    const gridHelper = new THREE.GridHelper(50, 50, 0xff007a, 0x1a1a2e);
    scene.add(gridHelper);
    
    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.2, 2.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true, 
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); 
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);
    
    const backLight = new THREE.DirectionalLight(0x00fff5, 1.0);
    backLight.position.set(-1.0, 1.0, -1.0).normalize();
    scene.add(backLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
    scene.add(ambientLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.screenSpacePanning = true;
    controls.target.set(0.0, 1.0, 0.0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();
    controlsRef.current = controls;

    (window as any).setCameraPreset = (type: 'FACE' | 'HALF' | 'FULL') => {
        const presets = {
          FACE: { pos: new THREE.Vector3(0, 1.35, 0.8), target: new THREE.Vector3(0, 1.30, 0) },
          HALF: { pos: new THREE.Vector3(0, 1.1, 1.8), target: new THREE.Vector3(0, 1.0, 0) },
          FULL: { pos: new THREE.Vector3(0, 0.9, 3.0), target: new THREE.Vector3(0, 0.8, 0) }
        };
        const p = presets[type];
        camera.position.copy(p.pos);
        controls.target.copy(p.target);
        controls.update();
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      const elapsedTime = clockRef.current.elapsedTime;

      if (controlsRef.current) controlsRef.current.update();

      const currentIsAiTalking = isAiTalkingRef.current;
      const currentAiVolume = aiVolumeRef.current;
      const cameraActive = isCameraEnabledRef.current;
      const tracker = faceTrackerRef.current;

      if (vrmRef.current) {
        vrmRef.current.update(delta);
        const humanoid = vrmRef.current.humanoid;
        const em = vrmRef.current.expressionManager;
        
        if (!cameraActive) {
            // --- AUTO MODE ---
            const neck = humanoid.getNormalizedBoneNode('neck');
            if (neck) {
                const lookX = Math.sin(elapsedTime * 0.5) * 0.1;
                const lookY = Math.cos(elapsedTime * 0.4) * 0.05;
                neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, lookX, 0.1);
                neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, lookY, 0.1);
            }
            handleAutoBlink(vrmRef.current);
            
            if (!currentIsAiTalking) {
               if (em.getValue('happy') > 0) em.setValue('happy', em.getValue('happy') * 0.9);
               if (em.getValue('angry') > 0) em.setValue('angry', em.getValue('angry') * 0.9);
            }

        } else {
            // --- TRACKING MODE ---
            
            // Get Calibrated Data (Neutral = 0)
            const pos = tracker.getCalibratedPosition();
            const rot = tracker.getCalibratedRotation();
            const s = tracker.getCalibratedBlendshapes();

            const hips = humanoid.getNormalizedBoneNode('hips');
            if (hips) {
                const posX = pos.x * 0.01; 
                hips.position.x = THREE.MathUtils.lerp(hips.position.x, hips.position.x + posX * 0.1, 0.1);
            }

            const neck = humanoid.getNormalizedBoneNode('neck');
            const spine = humanoid.getNormalizedBoneNode('spine');
            
            if (neck) {
                neck.rotation.y = rot.y * 0.8;
                neck.rotation.x = rot.x * 0.8;
                neck.rotation.z = rot.z * 0.6;
            }
            if (spine) {
                spine.rotation.y = rot.y * 0.4;
                spine.rotation.x = rot.x * 0.4;
            }

            if (Object.keys(s).length > 0) {
                const get = (name: string) => s[name] || 0;

                // --- EXPRESSION LOGIC ---
                
                // 1. BLINK SNAP LOGIC (Fix: "No se cierran completamente")
                // Using 0.4 threshold to force snap to 1.0 (Closed)
                let blinkL = get('eyeBlinkLeft');
                let blinkR = get('eyeBlinkRight');

                if (blinkL > 0.4) blinkL = 1.0; 
                if (blinkR > 0.4) blinkR = 1.0;
                
                em.setValue('blinkLeft', blinkL);
                em.setValue('blinkRight', blinkR);

                // 2. SMILE & JAW LOGIC (Fix: "sonrisa hazlo cerrando la boca")
                const smileRaw = (get('mouthSmileLeft') + get('mouthSmileRight')) / 2;
                const happy = Math.min(1, smileRaw * 1.5); 

                em.setValue('happy', happy);

                const angryRaw = (get('browDownLeft') + get('browDownRight')) / 2;
                const angry = Math.min(1, angryRaw * 1.5) * (1 - happy);
                em.setValue('angry', angry);
                em.setValue('sad', get('browInnerUp') * (1-happy));
                em.setValue('surprised', (get('browOuterUpLeft') + get('browOuterUpRight')));

                if (!currentIsAiTalking) {
                   let jawOpen = get('jawOpen');

                   // CLOSED MOUTH SMILE FIX:
                   // If smiling even slightly (> 0.2), FORCE JAW to 0.
                   if (happy > 0.2) {
                       jawOpen = 0;
                   } else {
                       // Only allow jaw open if NOT smiling
                       jawOpen = Math.min(1, jawOpen * 1.5);
                   }

                   em.setValue('aa', jawOpen);
                   
                   const pucker = get('mouthPucker');
                   // Only allow pucker if not smiling too much
                   if (pucker > 0.4 && happy < 0.3) {
                       em.setValue('ou', Math.min(1, pucker * 1.5));
                   } else {
                       em.setValue('ou', 0);
                   }
                }
            }
        }

        // --- LIP SYNC ---
        if (currentIsAiTalking) {
           em.setValue('ou', 0);
           em.setValue('oh', 0);
           const openAmount = Math.min(1.0, currentAiVolume * 4.0);
           const currentAa = em.getValue('aa');
           em.setValue('aa', THREE.MathUtils.lerp(currentAa, openAmount, 0.5));
        } else if (!cameraActive) {
           const currentAa = em.getValue('aa');
           if (currentAa > 0.01) em.setValue('aa', currentAa * 0.8);
        }

        // --- ARMS IDLE ---
        const leftArm = humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightArm = humanoid.getNormalizedBoneNode('rightUpperArm');
        const armBaseAngle = 1.25; 
        const armSway = Math.sin(elapsedTime * 1.5 - 1.0) * 0.03;
        if (leftArm) leftArm.rotation.z = armBaseAngle + armSway;
        if (rightArm) rightArm.rotation.z = -armBaseAngle - armSway;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // VRM Loader
  useEffect(() => {
    if (!config.modelUrl || !sceneRef.current) return;
    setIsLoading(true);
    setLoadingProgress(0);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      config.modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (vrmRef.current) {
          sceneRef.current?.remove(vrmRef.current.scene);
          VRMUtils.deepDispose(vrmRef.current.scene);
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        vrm.scene.position.x = -center.x; 
        vrm.scene.position.z = -center.z;
        vrm.scene.position.y = -box.min.y; 

        console.log(`Loaded Model: Height=${size.y.toFixed(2)}m`);

        vrmRef.current = vrm;
        sceneRef.current?.add(vrm.scene);
        
        if (cameraRef.current && controlsRef.current) {
            const h = size.y; 
            controlsRef.current.target.set(0, h * 0.5, 0); 
            cameraRef.current.position.set(0, h * 0.8, h * 1.5); 
            controlsRef.current.update();

            (window as any).setCameraPreset = (type: 'FACE' | 'HALF' | 'FULL') => {
                const presets = {
                  FACE: { pos: new THREE.Vector3(0, h * 0.85, h * 0.4), target: new THREE.Vector3(0, h * 0.8, 0) },
                  HALF: { pos: new THREE.Vector3(0, h * 0.6, h * 1.0), target: new THREE.Vector3(0, h * 0.5, 0) },
                  FULL: { pos: new THREE.Vector3(0, h * 0.5, h * 2.0), target: new THREE.Vector3(0, h * 0.5, 0) }
                };
                const p = presets[type];
                cameraRef.current?.position.copy(p.pos);
                controlsRef.current?.target.copy(p.target);
                controlsRef.current?.update();
            };
        }

        setIsLoading(false);
      },
      (progress) => {
        const percent = Math.round(100.0 * (progress.loaded / progress.total));
        setLoadingProgress(isNaN(percent) ? 0 : percent);
      },
      (error) => {
        console.error(error);
        setIsLoading(false);
        alert("Error al cargar VRM.");
      }
    );
  }, [config.modelUrl]);

  // Auto Blink
  const handleAutoBlink = (vrm: any) => {
    if (isBlinkingRef.current) {
       const blinkValue = Math.sin(Date.now() / 50) * 2; 
       if (blinkValue < 0) {
         isBlinkingRef.current = false;
         vrm.expressionManager.setValue('blink', 0);
         scheduleNextBlink();
       } else {
         vrm.expressionManager.setValue('blink', Math.min(1, blinkValue));
       }
    }
  };
  const scheduleNextBlink = () => {
    const nextBlink = Math.random() * 4000 + 1000;
    clearTimeout(blinkTimeoutRef.current);
    blinkTimeoutRef.current = setTimeout(() => { isBlinkingRef.current = true; }, nextBlink);
  };
  useEffect(() => {
    if (!isCameraEnabled) scheduleNextBlink();
    return () => clearTimeout(blinkTimeoutRef.current);
  }, [isCameraEnabled]);

  const isConnected = status === ConnectionStatus.CONNECTED;

  return (
    <div className="relative w-full h-full bg-vtuber-dark group">
      <video 
        ref={videoRef} 
        className="absolute bottom-0 right-0 opacity-0 pointer-events-none w-64 h-48 object-cover z-[-1]" 
        muted 
        playsInline 
        autoPlay
      ></video>
      
      {/* Background */}
      {config.bgUrl ? (
         <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url(${config.bgUrl})` }} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-vtuber-panel via-vtuber-dark to-black" />
      )}
      
      {/* 3D Scene */}
      <div ref={containerRef} className="absolute inset-0 z-10 cursor-move active:cursor-grabbing" />

      {/* Cam Buttons */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2 opacity-30 hover:opacity-100 transition-opacity duration-300">
        <button onClick={() => (window as any).setCameraPreset('FACE')} className="p-3 bg-black/60 rounded-full border border-white/20 hover:bg-vtuber-accent text-white" title="Primer Plano">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
        </button>
        <button onClick={() => (window as any).setCameraPreset('HALF')} className="p-3 bg-black/60 rounded-full border border-white/20 hover:bg-vtuber-secondary text-white" title="Medio Cuerpo">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z"/></svg>
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
             <div className="w-12 h-12 border-4 border-vtuber-accent border-t-transparent rounded-full animate-spin"></div>
             <p className="text-vtuber-accent font-bold tracking-widest">CARGANDO... {loadingProgress}%</p>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-md ${isConnected ? 'bg-black/50 border-vtuber-secondary text-vtuber-secondary' : 'bg-black/50 border-gray-500 text-gray-400'}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-vtuber-secondary animate-pulse' : 'bg-gray-500'}`}></div>
          <span className="text-xs font-bold tracking-wider uppercase">{status === ConnectionStatus.CONNECTED ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Camera Status */}
      {isCameraEnabled && (
        <div className="absolute top-4 right-4 z-20 flex gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500 rounded-full ${faceDetected ? 'opacity-100' : 'opacity-50'}`}>
                <div className={`w-2 h-2 rounded-full bg-red-500 ${faceDetected ? 'animate-pulse' : ''}`}></div>
                <span className="text-xs text-red-500 font-bold uppercase tracking-wider">{faceDetected ? "FACE TRACKING" : "SEARCHING FACE..."}</span>
            </div>
        </div>
      )}

      {/* Calibration Message Overlay */}
      {calibrationMsg && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 border border-vtuber-secondary px-6 py-4 rounded-xl shadow-[0_0_20px_rgba(0,255,245,0.3)] animate-bounce-talk">
            <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-vtuber-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-vtuber-secondary font-bold text-lg uppercase tracking-widest">{calibrationMsg}</span>
            </div>
        </div>
      )}

      {/* User Volume */}
      {isConnected && (
        <div className="absolute bottom-10 left-10 w-16 h-16 rounded-full border-2 border-vtuber-accent flex items-center justify-center opacity-80 pointer-events-none" style={{ transform: `scale(${1 + userVolume * 5})`, transition: 'transform 0.05s ease-out' }}>
          <svg className="h-6 w-6 text-vtuber-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        </div>
      )}
    </div>
  );
});

AvatarDisplay.displayName = 'AvatarDisplay';