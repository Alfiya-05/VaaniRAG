/**
 * STT Service Interface — designed for provider swapping.
 */

export interface STTResult {
  transcript: string;
  confidence?: number;
  language?: string;
  latency_ms: number;
}

export interface STTService {
  transcribe(audio: Buffer | ArrayBuffer, mimeType?: string): Promise<STTResult>;
  getName(): string;
}
