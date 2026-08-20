/**
 * Analytics tracker — stores per-request metrics and computes aggregates.
 * All values are from actual measurements, never fabricated.
 */

import { LatencyBreakdown, TokenUsage, GuardrailResult, MetricsSnapshot, RAGResponse } from '@/lib/types';

export const SESSION_ANALYTICS_STORAGE_KEY = 'vaani-rag-session-analytics-v1';

export interface RequestMetric {
  requestId: string;
  timestamp: string;
  query: string;
  type: 'text' | 'voice';
  latency: LatencyBreakdown;
  tokens?: TokenUsage;
  retrieval: {
    chunks_retrieved: number;
    chunks_reranked: number;
    chunks_used: number;
    best_score: number;
  };
  guardrail: GuardrailResult;
  success: boolean;
}

export class MetricsTracker {
  private metrics: RequestMetric[] = [];

  record(metric: RequestMetric): void {
    this.metrics.push(metric);
  }

  getRecentMetrics(limit: number = 50): RequestMetric[] {
    return this.metrics.slice(-limit);
  }

  getSnapshot(): MetricsSnapshot {
    if (this.metrics.length === 0) {
      return this.emptySnapshot();
    }

    const latencies = this.metrics.map(m => m.latency.total).sort((a, b) => a - b);
    const textMetrics = this.metrics.filter(m => m.type === 'text');
    const voiceMetrics = this.metrics.filter(m => m.type === 'voice');

    const tokensMetrics = this.metrics.filter(m => m.tokens);

    return {
      queryCount: this.metrics.length,
      textQueries: textMetrics.length,
      voiceQueries: voiceMetrics.length,
      latency: {
        p50: this.percentile(latencies, 0.5),
        p70: this.percentile(latencies, 0.7),
        p100: this.percentile(latencies, 1.0),
        avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        min: latencies[0],
        max: latencies[latencies.length - 1],
      },
      pipelineBreakdown: {
        stt_avg: this.avgField(voiceMetrics, m => m.latency.stt || 0),
        embedding_avg: this.avgField(this.metrics, m => m.latency.embedding || 0),
        retrieval_avg: this.avgField(this.metrics, m =>
          (m.latency.dense_retrieval || 0) + (m.latency.lexical_retrieval || 0) + (m.latency.fusion || 0)
        ),
        reranking_avg: this.avgField(this.metrics, m => m.latency.reranking || 0),
        generation_avg: this.avgField(this.metrics, m => m.latency.generation || 0),
        grounding_avg: this.avgField(this.metrics, m => m.latency.grounding || 0),
      },
      tokens: {
        avg_input: tokensMetrics.length > 0
          ? Math.round(tokensMetrics.reduce((a, m) => a + (m.tokens?.input_tokens || 0), 0) / tokensMetrics.length)
          : 0,
        avg_output: tokensMetrics.length > 0
          ? Math.round(tokensMetrics.reduce((a, m) => a + (m.tokens?.output_tokens || 0), 0) / tokensMetrics.length)
          : 0,
        avg_total: tokensMetrics.length > 0
          ? Math.round(tokensMetrics.reduce((a, m) => a + (m.tokens?.total_tokens || 0), 0) / tokensMetrics.length)
          : 0,
      },
      guardrails: {
        grounded: this.metrics.filter(m => m.guardrail.grounded).length,
        rejected: this.metrics.filter(m => !m.guardrail.passed).length,
        insufficient: this.metrics.filter(m => !m.guardrail.sufficient).length,
        unsafe: this.metrics.filter(m => m.guardrail.unsafe).length,
        off_topic: this.metrics.filter(m => m.guardrail.off_topic).length,
      },
    };
  }

  getTextLatencySnapshot() {
    const textMetrics = this.metrics.filter(m => m.type === 'text');
    if (textMetrics.length === 0) return null;
    const latencies = textMetrics.map(m => m.latency.total).sort((a, b) => a - b);
    return {
      count: textMetrics.length,
      p50: this.percentile(latencies, 0.5),
      p70: this.percentile(latencies, 0.7),
      p100: this.percentile(latencies, 1.0),
      avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      min: latencies[0],
      max: latencies[latencies.length - 1],
    };
  }

  getVoiceLatencySnapshot() {
    const voiceMetrics = this.metrics.filter(m => m.type === 'voice');
    if (voiceMetrics.length === 0) return null;
    const latencies = voiceMetrics.map(m => m.latency.total).sort((a, b) => a - b);
    return {
      count: voiceMetrics.length,
      p50: this.percentile(latencies, 0.5),
      p70: this.percentile(latencies, 0.7),
      p100: this.percentile(latencies, 1.0),
      avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      min: latencies[0],
      max: latencies[latencies.length - 1],
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  private avgField(metrics: RequestMetric[], extract: (m: RequestMetric) => number): number {
    if (metrics.length === 0) return 0;
    return Math.round(metrics.reduce((a, m) => a + extract(m), 0) / metrics.length);
  }

  private emptySnapshot(): MetricsSnapshot {
    return {
      queryCount: 0, textQueries: 0, voiceQueries: 0,
      latency: { p50: 0, p70: 0, p100: 0, avg: 0, min: 0, max: 0 },
      pipelineBreakdown: { stt_avg: 0, embedding_avg: 0, retrieval_avg: 0, reranking_avg: 0, generation_avg: 0, grounding_avg: 0 },
      tokens: { avg_input: 0, avg_output: 0, avg_total: 0 },
      guardrails: { grounded: 0, rejected: 0, insufficient: 0, unsafe: 0, off_topic: 0 },
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

export const metricsTracker = new MetricsTracker();

function isRequestMetric(value: unknown): value is RequestMetric {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Partial<RequestMetric>;
  return typeof metric.requestId === 'string'
    && typeof metric.timestamp === 'string'
    && typeof metric.query === 'string'
    && (metric.type === 'text' || metric.type === 'voice')
    && !!metric.latency
    && typeof metric.latency.total === 'number'
    && !!metric.guardrail
    && typeof metric.guardrail.passed === 'boolean'
    && !!metric.retrieval
    && typeof metric.retrieval.chunks_retrieved === 'number'
    && typeof metric.success === 'boolean';
}

export function readSessionMetrics(): RequestMetric[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_ANALYTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isRequestMetric)) {
      window.sessionStorage.removeItem(SESSION_ANALYTICS_STORAGE_KEY);
      return [];
    }
    return parsed;
  } catch {
    try { window.sessionStorage.removeItem(SESSION_ANALYTICS_STORAGE_KEY); } catch { /* storage unavailable */ }
    return [];
  }
}

export function recordSessionMetric(metric: RequestMetric): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readSessionMetrics();
    if (existing.some(item => item.requestId === metric.requestId)) return;
    window.sessionStorage.setItem(SESSION_ANALYTICS_STORAGE_KEY, JSON.stringify([...existing, metric]));
  } catch {
    // Session analytics are additive; an unavailable store must not affect queries.
  }
}

export function recordSessionResponse(response: RAGResponse, type: 'text' | 'voice'): void {
  recordSessionMetric({
    requestId: response.requestId,
    timestamp: new Date().toISOString(),
    query: response.query,
    type,
    latency: response.latency,
    tokens: response.tokens,
    retrieval: response.retrievalInfo,
    guardrail: response.guardrail,
    success: response.guardrail.passed,
  });
}
