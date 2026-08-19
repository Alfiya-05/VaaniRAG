/**
 * Local cross-encoder reranker using ms-marco-MiniLM-L-6-v2.
 * Runs entirely locally — NO Groq API calls.
 * Configurable: ENABLE_RERANKER=true/false
 */

import { ScoredChunk } from '@/lib/types';

let rerankerPipeline: any = null;
let rerankerLoading: Promise<any> | null = null;

async function getRerankerPipeline() {
  if (rerankerPipeline) return rerankerPipeline;
  if (rerankerLoading) return rerankerLoading;

  rerankerLoading = (async () => {
    try {
      const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@xenova/transformers');
      // Use a small cross-encoder model
      const modelName = 'Xenova/ms-marco-MiniLM-L-6-v2';
      console.log(`[Reranker] Loading model: ${modelName}...`);
      
      const tokenizer = await AutoTokenizer.from_pretrained(modelName);
      const model = await AutoModelForSequenceClassification.from_pretrained(modelName, {
        quantized: true,
      });
      
      console.log(`[Reranker] Model loaded successfully.`);
      rerankerPipeline = { tokenizer, model };
      return rerankerPipeline;
    } catch (err) {
      console.error('[Reranker] Failed to load cross-encoder model:', err);
      rerankerPipeline = null;
      rerankerLoading = null;
      return null;
    }
  })();

  return rerankerLoading;
}

/**
 * Score a (query, passage) pair using the cross-encoder.
 * Returns a relevance score (higher = more relevant).
 */
async function scorePassage(query: string, passage: string): Promise<number> {
  const pipe = await getRerankerPipeline();
  if (!pipe) return 0;

  try {
    const { tokenizer, model } = pipe;
    const inputs = await tokenizer(`${query}`, {
      text_pair: passage,
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const output = await model(inputs);
    // The model outputs a relevance logit. Convert it to a probability so
    // downstream sufficiency thresholds (0–1) have the intended meaning.
    const logits = output.logits?.data || output.logits;
    const logit = Array.isArray(logits) ? logits[0] : (logits?.[0] || 0);
    return Number.isFinite(logit) ? 1 / (1 + Math.exp(-logit)) : 0;
  } catch {
    return 0;
  }
}

/**
 * Rerank candidates using the local cross-encoder.
 * Returns top-K reranked passages.
 */
export async function rerank(
  query: string,
  candidates: ScoredChunk[],
  topK?: number
): Promise<ScoredChunk[]> {
  const enabled = process.env.ENABLE_RERANKER !== 'false';
  if (!enabled) {
    // Reranking disabled — return candidates as-is
    return candidates.slice(0, topK || parseInt(process.env.RERANK_TOP_K || '5', 10));
  }

  const limit = topK || parseInt(process.env.RERANK_TOP_K || '5', 10);

  // Score each candidate
  const scored = await Promise.all(
    candidates.map(async (chunk) => {
      const rerankerScore = await scorePassage(query, chunk.text);
      return { chunk, rerankerScore };
    })
  );

  // Sort by reranker score
  scored.sort((a, b) => b.rerankerScore - a.rerankerScore);

  return scored.slice(0, limit).map((entry, idx) => ({
    ...entry.chunk,
    score: entry.rerankerScore,
    rank: idx + 1,
    retrieval_method: 'reranked' as const,
  }));
}

/**
 * Warm up the reranker model at startup.
 */
export async function warmupReranker(): Promise<void> {
  if (process.env.ENABLE_RERANKER !== 'false') {
    await getRerankerPipeline();
  }
}
