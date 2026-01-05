export interface AvatarConfig {
  modelUrl: string | null; // URL for the .vrm file
  bgUrl: string | null; // Optional background image
  name: string;
  lore: string; // Text content for system instruction
}

export interface AudioVisualizerState {
  isUserTalking: boolean;
  isAiTalking: boolean;
  volume: number;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}