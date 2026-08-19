'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useRAGQuery, PipelineState } from '@/hooks/useRAGQuery';
import { RAGResponse, SourceReference } from '@/lib/types';

// ===== MIC ICON SVG =====
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// ===== WAVEFORM =====
function Waveform() {
  return (
    <div className="waveform">
      {[...Array(5)].map((_, i) => <div key={i} className="waveform-bar" />)}
    </div>
  );
}

// ===== STATUS LABELS =====
const STATE_LABELS: Record<PipelineState, string> = {
  idle: 'Ask a question',
  listening: 'Listening...',
  transcribing: 'Transcribing speech...',
  searching: 'Searching knowledge base...',
  generating: 'Generating grounded answer...',
  validating: 'Validating grounding...',
  complete: 'Answer ready',
  error: 'Something went wrong',
};

// ===== LATENCY BADGE =====
function LatencyBadge({ ms }: { ms: number }) {
  const cls = ms < 200 ? 'latency-fast' : ms < 500 ? 'latency-medium' : 'latency-slow';
  return <span className={`latency-badge ${cls}`}>⚡ {ms}ms</span>;
}

// ===== SOURCES PANEL =====
function SourcesPanel({ sources }: { sources: SourceReference[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (sources.length === 0) return null;

  return (
    <div className="sources-section">
      <button className="sources-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾' : '▸'} {sources.length} source{sources.length > 1 ? 's' : ''} retrieved
      </button>
      {expanded && sources.map((src, idx) => (
        <div key={src.chunk_id} className="source-item" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
          <div className="source-header">
            <span className="source-id">Source {idx + 1} — {src.document_id}</span>
            <span className="source-relevance">{(src.relevance * 100).toFixed(0)}%</span>
          </div>
          <div className="source-meta" style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Strategy: {src.chunk_strategy} {src.query_type ? `• Type: ${src.query_type}` : ''}
          </div>
          <div className={`source-text ${expandedIdx === idx ? 'expanded' : ''}`} style={{ cursor: 'pointer' }}>
            {src.text}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== CONVERSATION DISPLAY =====
function ConversationDisplay({ response, pipelineState }: { response: RAGResponse | null; pipelineState: PipelineState }) {
  if (!response && pipelineState === 'idle') return null;

  // Loading states
  if (['searching', 'generating', 'validating', 'transcribing'].includes(pipelineState) && !response) {
    return (
      <div className="conversation">
        <div className="answer-card glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          {pipelineState === 'transcribing' && <Waveform />}
          {pipelineState === 'searching' && <div className="loading-spinner" style={{ margin: '0 auto' }} />}
          {pipelineState === 'generating' && <div className="typing-dots"><span /><span /><span /></div>}
          {pipelineState === 'validating' && <div className="loading-spinner" style={{ margin: '0 auto' }} />}
          <p className="mic-label" style={{ marginTop: '16px' }}>{STATE_LABELS[pipelineState]}</p>
        </div>
      </div>
    );
  }

  if (!response) return null;

  const isRefusal = !response.grounded || !response.guardrail.passed;

  return (
    <div className="conversation">
      {/* Query display */}
      <div className="query-display">
        <div className="query-label">You asked</div>
        <div className="query-text">
          {response.transcript ? `🎙️ "${response.transcript}"` : `"${response.query}"`}
        </div>
      </div>

      {/* Answer */}
      <div className="answer-card glass-card">
        <div className="answer-label">
          {isRefusal ? (
            <><span style={{ color: 'var(--warning)' }}>⚠️</span> System Response</>
          ) : (
            <><span style={{ color: 'var(--success)' }}>✓</span> AI Answer</>
          )}
          <span className={`badge ${isRefusal ? 'badge-warning' : 'badge-success'}`} style={{ marginLeft: 'auto' }}>
            {isRefusal ? 'Guardrail Triggered' : 'Grounded'}
          </span>
        </div>

        <div className="answer-text">{response.answer}</div>

        <div className="answer-meta">
          <LatencyBadge ms={response.latency.total} />
          <span className="meta-item">📄 {response.retrievalInfo.chunks_used} chunks used</span>
          {response.tokens && (
            <span className="meta-item">🔤 {response.tokens.total_tokens} tokens</span>
          )}
          {response.retrievalInfo.best_score > 0 && (
            <span className="meta-item">🎯 {(response.retrievalInfo.best_score * 100).toFixed(0)}% relevance</span>
          )}
        </div>
      </div>

      {/* Latency breakdown */}
      {response.latency && (
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {response.latency.stt != null && response.latency.stt > 0 && (
            <span className="meta-item" style={{ fontSize: '11px' }}>STT: {response.latency.stt}ms</span>
          )}
          {response.latency.embedding != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>Embed: {response.latency.embedding}ms</span>
          )}
          {response.latency.dense_retrieval != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>Dense: {response.latency.dense_retrieval}ms</span>
          )}
          {response.latency.lexical_retrieval != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>Lexical: {response.latency.lexical_retrieval}ms</span>
          )}
          {response.latency.reranking != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>Rerank: {response.latency.reranking}ms</span>
          )}
          {response.latency.generation != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>LLM: {response.latency.generation}ms</span>
          )}
          {response.latency.grounding != null && (
            <span className="meta-item" style={{ fontSize: '11px' }}>Ground: {response.latency.grounding}ms</span>
          )}
        </div>
      )}

      {/* Sources */}
      <SourcesPanel sources={response.sources} />
    </div>
  );
}

// ===== MAIN PAGE =====
export default function HomePage() {
  const [textInput, setTextInput] = useState('');
  const [systemStatus, setSystemStatus] = useState<'online' | 'degraded' | 'offline'>('offline');
  const inputRef = useRef<HTMLInputElement>(null);

  const recorder = useVoiceRecorder();
  const rag = useRAGQuery();

  // Health check on mount
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => setSystemStatus(data.status === 'online' ? 'online' : 'degraded'))
      .catch(() => setSystemStatus('offline'));
  }, []);

  // Handle voice recording complete
  useEffect(() => {
    if (recorder.state === 'stopped' && recorder.audioBlob) {
      rag.queryVoice(recorder.audioBlob);
      recorder.reset();
    }
  // The hook objects are intentionally excluded: this effect is driven only by recording completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state, recorder.audioBlob]);

  const handleMicClick = () => {
    if (recorder.state === 'recording') {
      recorder.stopRecording();
    } else {
      rag.reset();
      rag.setPipelineState('listening');
      recorder.startRecording();
    }
  };

  const handleTextSubmit = () => {
    const query = textInput.trim();
    if (!query) return;
    rag.reset();
    setTextInput('');
    rag.queryText(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const isProcessing = !['idle', 'complete', 'error'].includes(rag.pipelineState);
  const micState = recorder.state === 'recording' ? 'listening' : isProcessing ? 'processing' : '';

  return (
    <>
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <h1>VAANI RAG</h1>
          <span className="badge badge-accent">HH GOA 2026</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span className={`status-dot ${systemStatus}`} />
            {systemStatus === 'online' ? 'System Online' : systemStatus === 'degraded' ? 'Degraded' : 'Offline'}
          </div>
          <Link href="/dashboard" className="nav-link">📊 Dashboard</Link>
        </div>
      </header>

      <main className="main-container">
        {/* Hero */}
        <div className="hero-section">
          <h2 className="hero-title">Ask your <strong>knowledge base</strong></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Voice-enabled RAG powered by MSMARCO • Sarvam STT • Groq
          </p>
        </div>

        {/* Microphone */}
        <div className="mic-container">
          <button
            id="mic-button"
            className={`mic-button ${micState}`}
            onClick={handleMicClick}
            disabled={isProcessing && recorder.state !== 'recording'}
          >
            {recorder.state === 'recording' ? (
              <Waveform />
            ) : isProcessing ? (
              <div className="loading-spinner" />
            ) : (
              <MicIcon />
            )}
          </button>
          <span className="mic-label">
            {recorder.state === 'recording'
              ? 'Tap to stop'
              : STATE_LABELS[rag.pipelineState]}
          </span>
          {recorder.error && (
            <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '8px' }}>
              {recorder.error}
            </p>
          )}
        </div>

        {/* Text Input */}
        <div className="input-bar" id="text-input-bar">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask anything about the knowledge base..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />
          <button
            onClick={() => { setTextInput(''); inputRef.current?.focus(); }}
            title="Clear"
            style={{ visibility: textInput ? 'visible' : 'hidden' }}
          >
            ✕
          </button>
          <button
            onClick={handleMicClick}
            title="Voice input"
            disabled={isProcessing}
            style={{ color: recorder.state === 'recording' ? 'var(--danger)' : undefined }}
          >
            <MicIcon />
          </button>
          <button
            className="send-btn"
            onClick={handleTextSubmit}
            disabled={!textInput.trim() || isProcessing}
            title="Send"
          >
            <SendIcon />
          </button>
        </div>

        {/* Conversation */}
        <ConversationDisplay response={rag.response} pipelineState={rag.pipelineState} />

        {/* Error display */}
        {rag.error && rag.pipelineState === 'error' && (
          <div className="conversation">
            <div className="answer-card glass-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div className="answer-label" style={{ color: 'var(--danger)' }}>
                ⚠️ Error
              </div>
              <div className="answer-text" style={{ color: 'var(--text-secondary)' }}>
                {rag.error}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
