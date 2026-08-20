/** Shared types for the VaaniRAG pipeline */

export interface ChunkRecord {
  chunk_id: string;
  document_id: string;
  text: string;
  chunk_strategy: 'semantic' | 'sentence' | 'fixed-window' | 'metadata-aware';
  metadata: {
    language: string;
    query_type: string;
    is_selected: boolean;
    source_query_id: number;
    original_query?: string;
  };
}

export interface ScoredChunk extends ChunkRecord {
  score: number;
  rank: number;
  retrieval_method: 'dense' | 'bm25' | 'fulltext' | 'fused' | 'reranked';
}

export interface QueryInput {
  type: 'text' | 'voice';
  query?: string;
  audio?: Buffer | ArrayBuffer;
  audioMimeType?: string;
}

export interface LatencyBreakdown {
  stt?: number;
  query_processing?: number;
  embedding?: number;
  dense_retrieval?: number;
  lexical_retrieval?: number;
  fusion?: number;
  reranking?: number;
  context_building?: number;
  generation?: number;
  generation_ttft?: number;
  grounding?: number;
  total: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface SourceReference {
  document_id: string;
  chunk_id: string;
  text: string;
  relevance: number;
  chunk_strategy: string;
  query_type?: string;
}

export interface GuardrailResult {
  passed: boolean;
  off_topic: boolean;
  unsafe: boolean;
  sufficient: boolean;
  grounded: boolean;
  reason?: string;
}

export interface StageResult<T = unknown> {
  success: boolean;
  stage: string;
  latency_ms: number;
  data: T;
  error?: string;
}

export interface RAGResponse {
  requestId: string;
  transcript?: string;
  query: string;
  answer: string;
  sources: SourceReference[];
  latency: LatencyBreakdown;
  tokens?: TokenUsage;
  grounded: boolean;
  guardrail: GuardrailResult;
  retrievalInfo: {
    chunks_retrieved: number;
    chunks_reranked: number;
    chunks_used: number;
    best_score: number;
  };
  error?: string;
  errorStatusCode?: number;
}

export interface MetricsSnapshot {
  queryCount: number;
  textQueries: number;
  voiceQueries: number;
  latency: {
    p50: number;
    p70: number;
    p100: number;
    avg: number;
    min: number;
    max: number;
  };
  pipelineBreakdown: {
    stt_avg: number;
    embedding_avg: number;
    retrieval_avg: number;
    reranking_avg: number;
    generation_avg: number;
    grounding_avg: number;
  };
  tokens: {
    avg_input: number;
    avg_output: number;
    avg_total: number;
  };
  guardrails: {
    grounded: number;
    rejected: number;
    insufficient: number;
    unsafe: number;
    off_topic: number;
  };
}
