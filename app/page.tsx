'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BackgroundNetwork from '@/components/BackgroundNetwork';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { PipelineState, useRAGQuery } from '@/hooks/useRAGQuery';
import { RAGResponse, SourceReference } from '@/lib/types';
import { recordSessionResponse } from '@/lib/analytics/tracker';
import type { KeyboardEvent } from 'react';

function Icon({ name, size = 18 }: { name: 'mic' | 'send' | 'arrow' | 'chart' | 'chevron' | 'check' | 'alert' | 'x' | 'pulse'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'mic') return <svg {...common}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" /></svg>;
  if (name === 'send') return <svg {...common}><path d="m21.5 3-7.1 18-3.5-7.4L3.5 10 21.5 3Z" /><path d="M10.9 13.6 21.5 3" /></svg>;
  if (name === 'arrow') return <svg {...common}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 19.5V4.5M4 19.5h16" /><path d="m7 15 3-4 3 2 5-6" /></svg>;
  if (name === 'chevron') return <svg {...common}><path d="m8 10 4 4 4-4" /></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === 'alert') return <svg {...common}><path d="M12 3 2.7 20h18.6L12 3Z" /><path d="M12 9v4M12 16.5h.01" /></svg>;
  if (name === 'x') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></svg>;
}

function Waveform() {
  return <div className="vaani-waveform" aria-label="Recording waveform">{[0, 1, 2, 3, 4, 5, 6].map((bar) => <span key={bar} />)}</div>;
}

const STATE_LABELS: Record<PipelineState, string> = {
  idle: 'Ready for a question',
  listening: 'Listening…',
  transcribing: 'Transcribing speech…',
  searching: 'Searching your knowledge base…',
  generating: 'Generating grounded answer…',
  validating: 'Validating grounding…',
  complete: 'Answer ready',
  error: 'Something went wrong',
};

function StatusBadge({ response }: { response: RAGResponse }) {
  const { guardrail } = response;
  if (response.grounded && guardrail.passed) return <span className="vaani-status-badge success"><Icon name="check" size={13} /> Grounded</span>;
  if (guardrail.unsafe) return <span className="vaani-status-badge danger"><Icon name="alert" size={13} /> Unsafe</span>;
  if (guardrail.off_topic) return <span className="vaani-status-badge warning"><Icon name="alert" size={13} /> Off-topic</span>;
  if (!guardrail.sufficient) return <span className="vaani-status-badge warning"><Icon name="alert" size={13} /> Insufficient context</span>;
  return <span className="vaani-status-badge warning"><Icon name="alert" size={13} /> Grounding review</span>;
}

function SourcesPanel({ sources }: { sources: SourceReference[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  if (!sources.length) return null;
  return (
    <section className="vaani-disclosure">
      <button className="vaani-disclosure-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span><span className="vaani-section-kicker">Evidence</span><strong>Sources</strong><small>{sources.length} retrieved</small></span>
        <Icon name="chevron" size={17} />
      </button>
      {expanded && <div className="vaani-source-list">
        {sources.map((source, index) => {
          const isOpen = expandedIdx === index;
          return <button key={source.chunk_id} className="vaani-source-item" onClick={() => setExpandedIdx(isOpen ? null : index)} aria-expanded={isOpen}>
            <span className="vaani-source-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="vaani-source-content">
              <span className="vaani-source-title">{source.document_id}</span>
              <span className="vaani-source-meta">{source.chunk_strategy}{source.query_type ? ` · ${source.query_type}` : ''} · {(source.relevance * 100).toFixed(0)}% relevance</span>
              <span className={`vaani-source-text ${isOpen ? 'open' : ''}`}>{source.text}</span>
            </span>
            <Icon name="chevron" size={15} />
          </button>;
        })}
      </div>}
    </section>
  );
}

function RetrievalTrace({ response }: { response: RAGResponse }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="vaani-disclosure vaani-trace">
    <button className="vaani-disclosure-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span><span className="vaani-section-kicker">System</span><strong>Retrieval trace</strong><small>{response.retrievalInfo.chunks_retrieved} candidates · {response.retrievalInfo.chunks_used} used</small></span>
      <Icon name="chevron" size={17} />
    </button>
    {expanded && <div className="vaani-trace-grid">
      <div><span>Retrieved</span><strong>{response.retrievalInfo.chunks_retrieved} chunks</strong></div>
      <div><span>Reranked</span><strong>{response.retrievalInfo.chunks_reranked} candidates</strong></div>
      <div><span>Context</span><strong>{response.retrievalInfo.chunks_used} chunks used</strong></div>
      <div><span>Best relevance</span><strong>{response.retrievalInfo.best_score > 0 ? `${(response.retrievalInfo.best_score * 100).toFixed(0)}%` : '—'}</strong></div>
    </div>}
  </section>;
}

function PipelineMetadata({ response }: { response: RAGResponse }) {
  const parts: string[] = [];
  if (response.latency.stt != null && response.latency.stt > 0) parts.push(`STT ${response.latency.stt}ms`);
  if (response.latency.embedding != null) parts.push(`Embed ${response.latency.embedding}ms`);
  if (response.latency.dense_retrieval != null) parts.push(`Dense ${response.latency.dense_retrieval}ms`);
  if (response.latency.lexical_retrieval != null) parts.push(`BM25 ${response.latency.lexical_retrieval}ms`);
  if (response.latency.reranking != null) parts.push(`Rerank ${response.latency.reranking}ms`);
  if (response.latency.generation != null) parts.push(`LLM ${response.latency.generation}ms`);
  if (response.latency.grounding != null) parts.push(`Grounding ${response.latency.grounding}ms`);
  if (!parts.length) return null;
  return <div className="vaani-pipeline-meta"><Icon name="pulse" size={14} /> {parts.join(' · ')}</div>;
}

const PROCESS_STAGES = ['Retrieve', 'Rank', 'Ground', 'Generate'];

function ProcessingIndicator() {
  return <div className="vaani-processing-indicator" aria-hidden="true"><span /><i /><span /><i /><span /><i /><span /></div>;
}

function PipelineProgress({ state }: { state: PipelineState }) {
  const activeIndex = state === 'validating' ? 2 : state === 'generating' ? 3 : 0;
  return <div className="vaani-pipeline-progress" aria-label={`Current pipeline stage: ${PROCESS_STAGES[activeIndex]}`}>
    {PROCESS_STAGES.map((stage, index) => <div key={stage} className={`vaani-pipeline-stage ${index < activeIndex ? 'complete' : ''} ${index === activeIndex ? 'active' : ''}`}>
      <span className="vaani-pipeline-dot">{index < activeIndex ? <Icon name="check" size={11} /> : index === activeIndex ? <span /> : null}</span>
      <span>{stage}</span>
      {index < PROCESS_STAGES.length - 1 && <i />}
    </div>)}
  </div>;
}

function LoadingPanel({ state }: { state: PipelineState }) {
  const label = state === 'transcribing' ? 'Transcribing your voice query…' : STATE_LABELS[state];
  return <div className="vaani-loading-panel">
    <ProcessingIndicator />
    <div className="vaani-processing-copy"><span className="vaani-section-kicker">Processing</span><strong>{label}</strong><p>Retrieving evidence before responding.</p></div>
    <PipelineProgress state={state} />
  </div>;
}

function ConversationDisplay({ response, pipelineState }: { response: RAGResponse | null; pipelineState: PipelineState }) {
  if (!response && pipelineState === 'idle') return null;
  if (['searching', 'generating', 'validating', 'transcribing'].includes(pipelineState) && !response) return <LoadingPanel state={pipelineState} />;
  if (!response) return null;
  return <div className="vaani-result-stack">
    <section className="vaani-query-echo">
      <span className="vaani-section-kicker">{response.transcript ? <span className="vaani-query-source"><Icon name="mic" size={12} /> Voice query</span> : 'You asked'}</span>
      <p>{response.transcript ? response.transcript : response.query}</p>
    </section>
    <article className="vaani-answer-panel">
      <header className="vaani-answer-header">
        <div><span className="vaani-section-kicker">Response</span><h2>AI answer</h2></div>
        <StatusBadge response={response} />
      </header>
      {!response.guardrail.sufficient && <div className="vaani-evidence-note"><span className="vaani-evidence-note-icon"><Icon name="alert" size={14} /></span><div><strong>Not enough evidence</strong><p>VaaniRAG couldn&apos;t find enough supporting information in the knowledge base to answer this confidently.</p></div></div>}
      <div className="vaani-answer-text">{response.answer}</div>
      <div className="vaani-answer-meta">
        <span>{response.sources.length} source{response.sources.length === 1 ? '' : 's'}</span>
        {response.tokens && <span>{response.tokens.total_tokens} tokens</span>}
        <span>{(response.latency.total / 1000).toFixed(2)}s</span>
      </div>
    </article>
    <PipelineMetadata response={response} />
    <SourcesPanel sources={response.sources} />
    <RetrievalTrace response={response} />
  </div>;
}

const SUGGESTIONS = ['What is photosynthesis?', 'Explain DNA', 'How does electricity work?', 'What is gravity?'];
const CURRENT_RESULT_STORAGE_KEY = 'vaani-rag-current-result-v1';

type PersistedCurrentResult = { version: 1; response: RAGResponse };

function isPersistedCurrentResult(value: unknown): value is PersistedCurrentResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedCurrentResult>;
  const response = candidate.response as Partial<RAGResponse> | undefined;
  return candidate.version === 1
    && !!response
    && typeof response.requestId === 'string'
    && typeof response.query === 'string'
    && typeof response.answer === 'string'
    && Array.isArray(response.sources)
    && !!response.latency
    && typeof response.latency.total === 'number'
    && !!response.guardrail
    && typeof response.guardrail.passed === 'boolean'
    && typeof response.guardrail.sufficient === 'boolean'
    && typeof response.guardrail.grounded === 'boolean'
    && !!response.retrievalInfo
    && typeof response.retrievalInfo.chunks_retrieved === 'number';
}

function readPersistedCurrentResult(): RAGResponse | null {
  try {
    const raw = window.sessionStorage.getItem(CURRENT_RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPersistedCurrentResult(parsed)) return parsed.response;
    window.sessionStorage.removeItem(CURRENT_RESULT_STORAGE_KEY);
  } catch {
    try { window.sessionStorage.removeItem(CURRENT_RESULT_STORAGE_KEY); } catch { /* storage may be unavailable */ }
  }
  return null;
}

function persistCurrentResult(response: RAGResponse) {
  try {
    const payload: PersistedCurrentResult = { version: 1, response };
    window.sessionStorage.setItem(CURRENT_RESULT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable or full; the in-memory result remains usable.
  }
}

export default function HomePage() {
  const [textInput, setTextInput] = useState('');
  const [systemStatus, setSystemStatus] = useState<'online' | 'degraded' | 'offline'>('offline');
  const inputRef = useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder();
  const rag = useRAGQuery();

  useEffect(() => {
    const savedResponse = readPersistedCurrentResult();
    if (savedResponse) rag.restore(savedResponse);
    // Restore once when the main page mounts; the hook method is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rag.response) {
      persistCurrentResult(rag.response);
      recordSessionResponse(rag.response, rag.response.transcript ? 'voice' : 'text');
    }
  }, [rag.response]);

  useEffect(() => {
    fetch('/api/health').then((result) => result.json()).then((data) => setSystemStatus(data.status === 'online' ? 'online' : 'degraded')).catch(() => setSystemStatus('offline'));
  }, []);

  useEffect(() => {
    if (recorder.state === 'stopped' && recorder.audioBlob) {
      rag.queryVoice(recorder.audioBlob);
      recorder.reset();
    }
    // The hook objects are intentionally excluded: this effect is driven only by recording completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state, recorder.audioBlob]);

  const isProcessing = !['idle', 'complete', 'error'].includes(rag.pipelineState);
  const isRecording = recorder.state === 'recording';
  const submitText = () => {
    const query = textInput.trim();
    if (!query) return;
    rag.reset();
    setTextInput('');
    rag.queryText(query);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitText();
    }
  };
  const handleMicClick = () => {
    if (isRecording) recorder.stopRecording();
    else {
      rag.reset();
      rag.setPipelineState('listening');
      recorder.startRecording();
    }
  };
  const chooseSuggestion = (suggestion: string) => {
    setTextInput(suggestion);
    inputRef.current?.focus();
  };
  const statusLabel = systemStatus === 'online' ? 'System online' : systemStatus === 'degraded' ? 'System degraded' : 'System offline';

  return <div className="vaani-home">
    <BackgroundNetwork />
    <header className="vaani-header">
      <div className="vaani-brand-group">
        <Link href="/" className="vaani-brand">VAANI <span>RAG</span></Link>
        <span className="vaani-event-badge">HH GOA 2026</span>
      </div>
      <nav className="vaani-nav" aria-label="Primary navigation">
        <span className={`vaani-system-status ${systemStatus}`}><span /> {statusLabel}</span>
        <Link href="/dashboard" className="vaani-dashboard-link"><Icon name="chart" size={16} /> Analytics <Icon name="arrow" size={14} /></Link>
      </nav>
    </header>

    <main className="vaani-main">
      <section className="vaani-hero" aria-labelledby="hero-title">
        <div className="vaani-eyebrow"><span className="vaani-eyebrow-line" /> AI knowledge engine</div>
        <h1 id="hero-title">Ask your knowledge base</h1>
        <p>Retrieve evidence. Generate answers grounded in your knowledge base.</p>
      </section>

      <section className={`vaani-composer ${isRecording ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`} aria-label="Knowledge base query">
        {isRecording ? <div className="vaani-listening-state">
          <div className="vaani-listening-copy"><span className="vaani-recording-dot" /> <strong>Listening…</strong><span>Speak your question, then stop recording.</span></div>
          <Waveform />
          <button className="vaani-stop-button" onClick={handleMicClick} aria-label="Stop recording"><span /> Stop</button>
        </div> : <>
          <input ref={inputRef} value={textInput} onChange={(event) => setTextInput(event.target.value)} onKeyDown={handleKeyDown} disabled={isProcessing} placeholder="Ask your knowledge base…" aria-label="Ask your knowledge base" />
          {textInput && <button className="vaani-icon-button" onClick={() => { setTextInput(''); inputRef.current?.focus(); }} aria-label="Clear question"><Icon name="x" size={17} /></button>}
          <button className={`vaani-icon-button ${recorder.error ? 'has-error' : ''}`} onClick={handleMicClick} disabled={isProcessing} aria-label="Use voice input"><Icon name="mic" size={19} /></button>
          <button className={`vaani-submit-button ${isProcessing ? 'is-processing' : ''}`} onClick={submitText} disabled={!textInput.trim() || isProcessing} aria-label={isProcessing ? 'Processing question' : 'Submit question'}>{isProcessing ? <ProcessingIndicator /> : <Icon name="send" size={18} />}</button>
        </>}
      </section>
      {recorder.error && <p className="vaani-recorder-error">{recorder.error}</p>}
      {!isRecording && <p className="vaani-composer-hint">Press Enter to search <span>·</span> or use voice input</p>}

      {!rag.response && rag.pipelineState === 'idle' && <section className="vaani-suggestions" aria-label="Suggested questions">
        <span>Try asking</span>
        <div>{SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>)}</div>
      </section>}

      <ConversationDisplay response={rag.response} pipelineState={rag.pipelineState} />
      {rag.error && rag.pipelineState === 'error' && <section className="vaani-error-panel"><Icon name="alert" size={17} /><div><strong>Unable to complete that query</strong><p>{rag.error}</p></div></section>}
    </main>
    <footer className="vaani-footer"><span>VaaniRAG</span><span>Voice-enabled retrieval with grounded answers</span></footer>
  </div>;
}
