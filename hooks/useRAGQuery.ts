'use client';

import { useState, useCallback } from 'react';
import { RAGResponse } from '@/lib/types';

export type PipelineState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'searching'
  | 'generating'
  | 'validating'
  | 'complete'
  | 'error';

export function useRAGQuery() {
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [response, setResponse] = useState<RAGResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryText = useCallback(async (query: string) => {
    setError(null);
    setPipelineState('searching');

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      setPipelineState('generating');
      const data: RAGResponse = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setPipelineState('complete');
      setResponse(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Query failed';
      setError(msg);
      setPipelineState('error');
      return null;
    }
  }, []);

  const queryVoice = useCallback(async (audioBlob: Blob) => {
    setError(null);
    setPipelineState('transcribing');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      setPipelineState('searching');
      const res = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      setPipelineState('generating');
      const data: RAGResponse = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setPipelineState('validating');
      // Brief delay to show validating state
      await new Promise(r => setTimeout(r, 200));

      setPipelineState('complete');
      setResponse(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voice query failed';
      setError(msg);
      setPipelineState('error');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setPipelineState('idle');
    setResponse(null);
    setError(null);
  }, []);

  const restore = useCallback((savedResponse: RAGResponse) => {
    setError(null);
    setResponse(savedResponse);
    setPipelineState('complete');
  }, []);

  return {
    pipelineState,
    response,
    error,
    queryText,
    queryVoice,
    reset,
    restore,
    setPipelineState,
  };
}
