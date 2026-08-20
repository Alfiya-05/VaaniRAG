/**
 * RAGOrchestrator — structured orchestration for the entire pipeline.
 * Each stage returns structured data with latency measurements.
 * No raw LLM calls — everything flows through the pipeline stages.
 */

import { generateRequestId, logger } from '@/lib/utils/logger';
import { RAGResponse, LatencyBreakdown, QueryInput, GuardrailResult, StageResult } from '@/lib/types';
import { SarvamSTT } from '@/lib/stt/sarvam';
import { processQuery } from '@/lib/query/processor';
import { hybridRetrieve } from '@/lib/retrieval/router';
import { rerank } from '@/lib/reranker/cross-encoder';
import { buildContext } from '@/lib/context/builder';
import { generateAnswer } from '@/lib/generation/groq';
import { checkSafety } from '@/lib/guardrails/safety';
import { isOffTopic } from '@/lib/guardrails/off-topic';
import { checkSufficiency } from '@/lib/guardrails/sufficiency';
import { validateGrounding } from '@/lib/guardrails/grounding';
import { metricsTracker } from '@/lib/analytics/tracker';
import {
  OffTopicError,
  UnsafeContentError,
  InsufficientContextError,
  GroundingFailureError,
  STTError,
  RetrievalError,
  GenerationError,
  toSafeError,
} from '@/lib/utils/errors';

const stt = new SarvamSTT();

export class RAGOrchestrator {
  async processQuery(input: QueryInput): Promise<RAGResponse> {
    const requestId = generateRequestId();
    const totalStart = performance.now();
    const latency: LatencyBreakdown = { total: 0 };

    const guardrail: GuardrailResult = {
      passed: true,
      off_topic: false,
      unsafe: false,
      sufficient: true,
      grounded: true,
    };

    try {
      // --- Stage 1: Transcribe audio (voice only) ---
      let query = input.query || '';

      if (input.type === 'voice' && input.audio) {
        const sttStart = performance.now();
        try {
          const sttResult = await stt.transcribe(
            input.audio instanceof ArrayBuffer ? Buffer.from(input.audio) : input.audio,
            input.audioMimeType
          );
          query = sttResult.transcript;
          latency.stt = Math.round(performance.now() - sttStart);
          logger.log(requestId, 'stt', `Transcribed: "${query}"`, { latency_ms: latency.stt });
        } catch (err) {
          latency.stt = Math.round(performance.now() - sttStart);
          throw new STTError((err as Error).message);
        }
      }

      if (!query.trim()) {
        throw new STTError('No query provided or transcription was empty.');
      }

      // --- Stage 2: Process query ---
      const qpStart = performance.now();
      const processed = processQuery(query);
      latency.query_processing = Math.round(performance.now() - qpStart);
      logger.log(requestId, 'query', `Intent: ${processed.intent}`, { normalized: processed.normalized });

      // --- Stage 3: Pre-retrieval guardrails ---
      if (processed.isUnsafe) {
        guardrail.unsafe = true;
        guardrail.passed = false;
        throw new UnsafeContentError();
      }

      if (processed.isOffTopic) {
        guardrail.off_topic = true;
        guardrail.passed = false;
        throw new OffTopicError();
      }

      // --- Stage 4: Hybrid retrieval (dense + lexical in parallel) ---
      const retrievalStart = performance.now();
      let retrievalResult;
      try {
        retrievalResult = await hybridRetrieve(processed.normalized);
      } catch (err) {
        throw new RetrievalError((err as Error).message);
      }
      latency.embedding = retrievalResult.embedding_ms;
      latency.dense_retrieval = retrievalResult.dense_ms;
      latency.lexical_retrieval = retrievalResult.lexical_ms;
      latency.fusion = retrievalResult.fusion_ms;

      logger.log(requestId, 'retrieval', `Retrieved ${retrievalResult.candidates.length} fused candidates`, {
        dense: retrievalResult.dense_results.length,
        lexical: retrievalResult.lexical_results.length,
      });

      // --- Stage 5: Rerank ---
      const rerankStart = performance.now();
      const reranked = await rerank(processed.normalized, retrievalResult.candidates);
      latency.reranking = Math.round(performance.now() - rerankStart);
      logger.log(requestId, 'reranking', `Reranked to ${reranked.length} candidates`);

      // --- Stage 6: Sufficiency check ---
      const sufficiency = checkSufficiency(reranked);
      if (!sufficiency.sufficient) {
        guardrail.sufficient = false;
        guardrail.passed = false;
        logger.log(requestId, 'guardrail', `Insufficient context: best=${sufficiency.bestScore.toFixed(3)}, threshold=${sufficiency.threshold}`);
        throw new InsufficientContextError();
      }

      // --- Stage 7: Build context (≤1500 tokens) ---
      const ctxStart = performance.now();
      const contextResult = buildContext(reranked);
      latency.context_building = Math.round(performance.now() - ctxStart);
      logger.log(requestId, 'context', `Built context: ${contextResult.chunksUsed} chunks, ${contextResult.tokenCount} tokens`);

      // --- Stage 8: Generate answer ---
      let genResult;
      try {
        genResult = await generateAnswer(processed.normalized, contextResult.contextText);
      } catch (err) {
        throw new GenerationError((err as Error).message);
      }
      latency.generation = genResult.latency_ms;
      latency.generation_ttft = genResult.ttft_ms;
      logger.log(requestId, 'generation', `Generated answer (${genResult.tokens.output_tokens} output tokens)`, {
        model: genResult.model,
        ttft_ms: genResult.ttft_ms,
      });

      // --- Stage 9: Grounding validation ---
      const groundStart = performance.now();
      const groundingResult = validateGrounding(genResult.answer, contextResult.sources);
      latency.grounding = Math.round(performance.now() - groundStart);

      if (!groundingResult.grounded) {
        guardrail.grounded = false;
        guardrail.passed = false;
        logger.warn(requestId, 'guardrail', `Grounding failed: coverage=${groundingResult.coverage.toFixed(2)}`);
        throw new GroundingFailureError();
      }

      // --- Success ---
      latency.total = Math.round(performance.now() - totalStart);

      const response: RAGResponse = {
        requestId,
        transcript: input.type === 'voice' ? query : undefined,
        query: processed.normalized,
        answer: genResult.answer,
        sources: contextResult.sources,
        latency,
        tokens: genResult.tokens,
        grounded: true,
        guardrail,
        retrievalInfo: {
          chunks_retrieved: retrievalResult.candidates.length,
          chunks_reranked: reranked.length,
          chunks_used: contextResult.chunksUsed,
          best_score: reranked.length > 0 ? reranked[0].score : 0,
        },
      };

      // Record metrics
      metricsTracker.record({
        requestId,
        timestamp: new Date().toISOString(),
        query: processed.normalized,
        type: input.type,
        latency,
        tokens: genResult.tokens,
        retrieval: response.retrievalInfo,
        guardrail,
        success: true,
      });

      logger.log(requestId, 'complete', `Pipeline completed in ${latency.total}ms`);
      return response;

    } catch (err) {
      latency.total = Math.round(performance.now() - totalStart);
      const safeErr = toSafeError(err);

      const response: RAGResponse = {
        requestId,
        transcript: input.type === 'voice' ? input.query : undefined,
        query: input.query || '',
        answer: safeErr.message,
        sources: [],
        latency,
        grounded: false,
        guardrail,
        retrievalInfo: {
          chunks_retrieved: 0,
          chunks_reranked: 0,
          chunks_used: 0,
          best_score: 0,
        },
        error: safeErr.message,
        errorStatusCode: safeErr.statusCode,
      };

      // Record failed metric
      metricsTracker.record({
        requestId,
        timestamp: new Date().toISOString(),
        query: input.query || '',
        type: input.type,
        latency,
        retrieval: response.retrievalInfo,
        guardrail,
        success: false,
      });

      logger.log(requestId, 'error', `Pipeline failed: ${safeErr.message}`, { stage: safeErr.stage });
      return response;
    }
  }
}

export const orchestrator = new RAGOrchestrator();
