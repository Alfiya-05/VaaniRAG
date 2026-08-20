'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = { isFinal: boolean; length: number; [index: number]: SpeechRecognitionAlternativeLike };
type SpeechRecognitionResultListLike = { length: number; [index: number]: SpeechRecognitionResultLike };
type SpeechRecognitionEventLike = Event & { resultIndex: number; results: SpeechRecognitionResultListLike };
type SpeechRecognitionErrorEventLike = Event & { error?: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function useLiveSpeechRecognition() {
  const [preview, setPreview] = useState('');
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef('');
  const stoppedIntentionallyRef = useRef(false);

  useEffect(() => {
    const browserWindow = window as WindowWithSpeechRecognition;
    setSupported(Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition));
    return () => {
      stoppedIntentionallyRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    stoppedIntentionallyRef.current = true;
    const recognition = recognitionRef.current;
    if (recognition) {
      try { recognition.stop(); } catch { /* recognition may already be stopped */ }
    }
  }, []);

  const start = useCallback(() => {
    const browserWindow = window as WindowWithSpeechRecognition;
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) return false;

    stoppedIntentionallyRef.current = false;
    finalTranscriptRef.current = '';
    setPreview('');

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalTranscriptRef.current += transcript;
        else interimTranscript += transcript;
      }
      setPreview(`${finalTranscriptRef.current} ${interimTranscript}`.trim());
    };
    recognition.onerror = () => {
      // Live preview is optional; Sarvam remains responsible for transcription.
    };
    recognition.onend = () => {
      if (!stoppedIntentionallyRef.current) {
        recognitionRef.current = null;
      }
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    finalTranscriptRef.current = '';
    setPreview('');
  }, [stop]);

  return { preview, supported, start, stop, reset };
}
