/**
 * Sarvam AI Speech-to-Text implementation.
 * Uses the saaras:v3 model.
 * POST https://api.sarvam.ai/speech-to-text
 */

import { STTService, STTResult } from './index';

export class SarvamSTT implements STTService {
  private apiKey: string;
  private maxRetries = 1;
  private timeoutMs = 5000;

  constructor() {
    this.apiKey = process.env.SARVAM_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[SarvamSTT] SARVAM_API_KEY not set — voice input will fail');
    }
  }

  getName(): string {
    return 'sarvam-saaras-v3';
  }

  async transcribe(audio: Buffer | ArrayBuffer, mimeType: string = 'audio/webm'): Promise<STTResult> {
    const start = performance.now();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.callAPI(audio, mimeType);
        const latency_ms = Math.round(performance.now() - start);
        return {
          transcript: result.transcript,
          confidence: result.confidence,
          language: result.language_code || 'en',
          latency_ms,
        };
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          console.warn(`[SarvamSTT] Attempt ${attempt + 1} failed, retrying...`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    throw new Error(`Sarvam STT failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  private async callAPI(audio: Buffer | ArrayBuffer, mimeType: string): Promise<{
    transcript: string;
    confidence?: number;
    language_code?: string;
  }> {
    const uint8 = audio instanceof Uint8Array ? audio : new Uint8Array(audio as ArrayBuffer);

    // Determine file extension from MIME type
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
    
    const formData = new FormData();
    const audioBytes = new Uint8Array(uint8.byteLength);
    audioBytes.set(uint8);
    const blob = new Blob([audioBytes.buffer], { type: mimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'saaras:v3');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return {
        transcript: data.transcript || '',
        confidence: data.confidence,
        language_code: data.language_code,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
