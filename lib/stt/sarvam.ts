/**
 * Sarvam AI Speech-to-Text implementation.
 * Uses the documented synchronous /speech-to-text REST contract.
 */

import { STTService, STTResult } from './index';

class SarvamApiError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SarvamApiError';
  }
}

export class SarvamSTT implements STTService {
  private apiKey: string;
  private model = process.env.SARVAM_STT_MODEL || 'saaras:v3';
  private languageCode = process.env.SARVAM_LANGUAGE_CODE || 'unknown';
  private maxRetries = 1;
  private timeoutMs = 30000;

  constructor() {
    this.apiKey = process.env.SARVAM_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[SarvamSTT] SARVAM_API_KEY not set — voice input will fail');
    }
  }

  getName(): string {
    return `sarvam-${this.model}`;
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
        const retryable = err instanceof SarvamApiError ? err.retryable : true;
        if (!retryable || attempt >= this.maxRetries) break;
        const delayMs = 500 * (attempt + 1);
        console.warn(`[SarvamSTT] Attempt ${attempt + 1} failed with a retryable error; retrying in ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(`Sarvam STT failed: ${lastError?.message || 'unknown upstream error'}`);
  }

  private async callAPI(audio: Buffer | ArrayBuffer, mimeType: string): Promise<{
    transcript: string;
    confidence?: number;
    language_code?: string;
  }> {
    const uint8 = audio instanceof Uint8Array ? audio : new Uint8Array(audio as ArrayBuffer);
    const byteSize = uint8.byteLength;
    if (byteSize === 0) {
      throw new SarvamApiError(400, 'Audio payload is empty', false);
    }

    const normalizedMimeType = (mimeType || 'application/octet-stream').split(';', 1)[0].trim();
    const ext = normalizedMimeType.includes('wav') ? 'wav' : normalizedMimeType.includes('mp3') ? 'mp3' : normalizedMimeType.includes('ogg') ? 'ogg' : 'webm';
    const filename = `recording.${ext}`;
    const formData = new FormData();
    const audioBytes = new Uint8Array(uint8);
    const blob = new Blob([audioBytes], { type: normalizedMimeType });
    console.debug('[SarvamSTT] Sending audio', {
      mimeType: normalizedMimeType,
      filename,
      byteSize,
    });
    formData.append('file', blob, filename);
    formData.append('model', this.model);
    formData.append('mode', 'transcribe');
    formData.append('language_code', this.languageCode);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': this.apiKey },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        const safeBody = rawBody.replace(/\s+/g, ' ').slice(0, 1000);
        const retryable = response.status === 429 || response.status >= 500;
        console.error('[SarvamSTT] Upstream request failed', {
          status: response.status,
          body: safeBody,
          mimeType: normalizedMimeType,
          filename,
          byteSize,
          languageCode: this.languageCode,
        });
        throw new SarvamApiError(response.status, `Sarvam API error ${response.status}: ${safeBody || 'empty response'}`, retryable);
      }

      const data = await response.json() as { transcript?: string; confidence?: number; language_code?: string };
      return {
        transcript: data.transcript || '',
        confidence: data.confidence,
        language_code: data.language_code,
      };
    } catch (error) {
      if (error instanceof SarvamApiError) throw error;
      const message = error instanceof Error ? error.message : 'network request failed';
      console.error('[SarvamSTT] Transport failure', { message, mimeType: normalizedMimeType, filename, byteSize });
      throw new SarvamApiError(null, `Sarvam transport error: ${message}`, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
