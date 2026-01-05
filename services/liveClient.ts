import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { createPcmBlob, decodeAudioData } from "../utils/audioUtils";

export class LiveClient {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private sessionPromise: Promise<any> | null = null;
  private currentSession: any = null;
  private analyser: AnalyserNode | null = null;
  private volumeInterval: any = null;
  
  // Callbacks
  public onAiSpeakingStart: () => void = () => {};
  public onAiSpeakingStop: () => void = () => {};
  public onError: (error: string) => void = () => {};
  public onUserVolumeChange: (volume: number) => void = () => {};
  public onAiVolumeChange: (volume: number) => void = () => {};

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async connect(systemInstruction: string) {
    try {
      // Input: 16kHz required by Gemini
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      // Output: Use system default sample rate to prevent "chipmunk" speed issues
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Setup Analyser for accurate Lip Sync
      this.analyser = this.outputAudioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.1; // Smooth response
      this.analyser.connect(this.outputAudioContext.destination);
      this.startMonitoringAiVolume();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: () => { console.log('Session closed'); },
          onerror: (e: any) => { 
            console.error(e);
            this.onError("Error de conexión con Gemini.");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Options: Puck, Charon, Kore, Fenrir, Zephyr
          },
          systemInstruction: systemInstruction,
        },
      };

      this.sessionPromise = this.ai.live.connect(config);
      this.currentSession = await this.sessionPromise;
      
    } catch (error: any) {
      console.error("Connection failed", error);
      this.onError(error.message || "No se pudo conectar.");
      throw error;
    }
  }

  private handleOpen() {
    console.log("Connection opened");
    this.startAudioInput();
  }

  private async handleMessage(message: LiveServerMessage) {
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio && this.outputAudioContext && this.analyser) {
      this.onAiSpeakingStart();
      
      // Ensure time sync
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

      // Decode at 24000Hz (Gemini native), then play at system rate
      const audioBuffer = await decodeAudioData(base64Audio, this.outputAudioContext, 24000);
      
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      // Connect through analyser for lip sync
      source.connect(this.analyser);
      
      source.addEventListener('ended', () => {
        if (this.outputAudioContext && this.outputAudioContext.currentTime >= this.nextStartTime - 0.1) {
             this.onAiSpeakingStop();
        }
      });

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    if (message.serverContent?.interrupted) {
      this.nextStartTime = 0;
      this.onAiSpeakingStop();
    }
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.mediaStream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    
    // Reduced buffer size from 4096 to 2048 to lower input latency
    this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for UI visualization
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onUserVolumeChange(rms);

      // Send to Gemini
      const pcmBlob = createPcmBlob(inputData);
      
      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private startMonitoringAiVolume() {
    if (this.volumeInterval) clearInterval(this.volumeInterval);
    
    const dataArray = new Uint8Array(32); // Small FFT for performance
    
    this.volumeInterval = setInterval(() => {
        if (this.analyser) {
            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            // Normalize roughly 0-1
            const average = sum / dataArray.length;
            this.onAiVolumeChange(average / 128.0);
        }
    }, 50); // 20fps update for lip sync
  }

  public async disconnect() {
    if (this.volumeInterval) {
        clearInterval(this.volumeInterval);
        this.volumeInterval = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      await this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    this.currentSession = null;
    this.sessionPromise = null;
  }
}