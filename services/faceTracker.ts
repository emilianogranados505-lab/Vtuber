import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import * as THREE from 'three';

// Optimized FPS for performance vs smoothness balance
const TRACKING_FPS = 24; 
const FRAME_INTERVAL = 1000 / TRACKING_FPS;
// Increased smoothing factor (0.5 -> 0.7) for snappier/less laggy movement
const SMOOTHING_FACTOR = 0.7;

export class FaceTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private lastTrackingTime = 0; 
  private isRunning = false;
  
  // Storage for smoothing
  private targetBlendshapes: Record<string, number> = {};
  public currentBlendshapes: Record<string, number> = {};
  
  // Calibration Storage
  private _neutralBlendshapes: Record<string, number> = {};
  private _neutralRotation = { x: 0, y: 0, z: 0 };
  private _neutralPosition = { x: 0, y: 0, z: 0 };
  private _isCalibrated = false;

  // Reusable Math Objects (Object Pooling)
  private _matrix = new THREE.Matrix4();
  private _euler = new THREE.Euler();
  private _targetRotation = { x: 0, y: 0, z: 0 };
  private _targetPosition = { x: 0, y: 0, z: 0 };
  
  public rotation: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
  public position: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
  
  constructor() {
    this.currentBlendshapes = {};
    this.targetBlendshapes = {};
  }

  async initialize() {
    if (this.faceLandmarker) return;

    try {
      console.log("Initializing Mediapipe FaceLandmarker...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU" 
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrix: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      
      console.log("FaceLandmarker initialized successfully");
    } catch (e) {
      console.error("Failed to init FaceLandmarker", e);
      throw e;
    }
  }

  async start(videoElement: HTMLVideoElement) {
    if (!this.faceLandmarker) await this.initialize();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              // AGGRESSIVE OPTIMIZATION: Very low resolution is enough for AI coordinates
              width: { ideal: 320 }, 
              height: { ideal: 240 }, 
              facingMode: "user",
              frameRate: { ideal: 24, max: 30 } 
            } 
        });
        
        this.video = videoElement;
        this.video.srcObject = stream;
        
        this.video.addEventListener("loadeddata", () => {
            this.video?.play().catch(e => console.error("Video play failed", e));
            this.isRunning = true;
            this.predict();
        });
    } catch (e) {
        console.error("Camera access denied or failed", e);
        throw e;
    }
  }

  stop() {
    this.isRunning = false;
    if (this.video && this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    // Reset calibration
    this._isCalibrated = false;
    this._neutralBlendshapes = {};
  }

  /**
   * Captures the current face state as "Neutral/Zero".
   * This handles differences in eye size, resting mouth shape, and camera distance.
   */
  calibrate() {
    if (!this.isRunning) return;
    
    // Deep copy current states
    this._neutralBlendshapes = { ...this.currentBlendshapes };
    this._neutralRotation = { ...this.rotation };
    this._neutralPosition = { ...this.position };
    this._isCalibrated = true;
    console.log("Face Calibrated:", this._neutralPosition);
  }

  /**
   * Returns rotation relative to the calibrated "center".
   */
  getCalibratedRotation() {
      if (!this._isCalibrated) return this.rotation;
      return {
          x: this.rotation.x - this._neutralRotation.x,
          y: this.rotation.y - this._neutralRotation.y,
          z: this.rotation.z - this._neutralRotation.z
      };
  }

  /**
   * Returns position relative to the calibrated "center".
   */
  getCalibratedPosition() {
      if (!this._isCalibrated) return { x:0, y:0, z:0 }; // Default to center if calibrated
      return {
          x: this.position.x - this._neutralPosition.x,
          y: this.position.y - this._neutralPosition.y,
          z: this.position.z - this._neutralPosition.z
      };
  }

  /**
   * Returns blendshapes relative to neutral. 
   * Handles "resting bitch face" or naturally narrow eyes.
   */
  getCalibratedBlendshapes() {
      if (!this._isCalibrated) return this.currentBlendshapes;

      const calibrated: Record<string, number> = {};
      
      for (const key in this.currentBlendshapes) {
          const current = this.currentBlendshapes[key] || 0;
          const neutral = this._neutralBlendshapes[key] || 0;
          
          let val = current - neutral;
          
          // Clamp negative values
          if (val < 0) val = 0;
          
          // Boosted sensitivity: 1.5x multiplier to make it easier to reach max values
          calibrated[key] = val * 1.5; 
      }
      return calibrated;
  }

  predict() {
    if (!this.isRunning || !this.faceLandmarker || !this.video) return;

    const now = performance.now();
    const timeSinceLastTrack = now - this.lastTrackingTime;

    // 1. TRACKING LOOP (Throttled)
    if (timeSinceLastTrack >= FRAME_INTERVAL) {
        if (this.video.currentTime !== this.lastVideoTime && !this.video.paused && !this.video.ended) {
          this.lastVideoTime = this.video.currentTime;
          this.lastTrackingTime = now;
          
          try {
              const results = this.faceLandmarker.detectForVideo(this.video, now);
              
              if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                const shapes = results.faceBlendshapes[0].categories;
                for (let i = 0; i < shapes.length; i++) {
                    this.targetBlendshapes[shapes[i].categoryName] = shapes[i].score;
                }

                if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
                     const matrixData = results.facialTransformationMatrixes[0].data;
                     this._matrix.fromArray(matrixData);
                     this._euler.setFromRotationMatrix(this._matrix);
                     
                     this._targetRotation.x = this._euler.x;
                     this._targetRotation.y = -this._euler.y;
                     this._targetRotation.z = -this._euler.z;

                     this._targetPosition.x = -matrixData[12];
                     this._targetPosition.y = -matrixData[13];
                     this._targetPosition.z = -matrixData[14];
                }
              }
          } catch (err) {
              console.warn("Tracking error:", err);
          }
        }
    }

    // 2. SMOOTHING LOOP 
    this.updateSmoothing();

    if (this.isRunning) {
        requestAnimationFrame(() => this.predict());
    }
  }

  private lerp(start: number, end: number, amt: number) {
    return (1 - amt) * start + amt * end;
  }

  private updateSmoothing() {
    // Interpolate Rotation
    this.rotation.x = this.lerp(this.rotation.x, this._targetRotation.x, SMOOTHING_FACTOR);
    this.rotation.y = this.lerp(this.rotation.y, this._targetRotation.y, SMOOTHING_FACTOR);
    this.rotation.z = this.lerp(this.rotation.z, this._targetRotation.z, SMOOTHING_FACTOR);

    // Interpolate Position
    this.position.x = this.lerp(this.position.x, this._targetPosition.x, SMOOTHING_FACTOR);
    this.position.y = this.lerp(this.position.y, this._targetPosition.y, SMOOTHING_FACTOR);
    this.position.z = this.lerp(this.position.z, this._targetPosition.z, SMOOTHING_FACTOR);

    // Interpolate Blendshapes
    for (const key in this.targetBlendshapes) {
        const target = this.targetBlendshapes[key] || 0;
        const current = this.currentBlendshapes[key] || 0;
        const cleanTarget = target < 0.05 ? 0 : target;
        this.currentBlendshapes[key] = this.lerp(current, cleanTarget, SMOOTHING_FACTOR);
    }
  }
}