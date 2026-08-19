/**
 * Context builder — assembles final evidence package for LLM.
 * Enforces token budget: ≤ MAX_CONTEXT_TOKENS (default 1500).
 * Targets 3-5 chunks.
 */

import { ScoredChunk, SourceReference } from '@/lib/types';
import { estimateTokens, truncateToTokenBudget, getTokenBudgets } from '@/lib/utils/tokens';

interface ContextBuildResult {
  contextText: string;
  sources: SourceReference[];
  chunksUsed: number;
  tokenCount: number;
  latency_ms: number;
}

/**
 * Build the final context from reranked chunks.
 * 1. Remove exact duplicates (by chunk_id)
 * 2. Remove near-duplicates (Jaccard > 0.85)
 * 3. Sort by relevance
 * 4. Enforce token budget
 * 5. Format as numbered source blocks
 */
export function buildContext(chunks: ScoredChunk[]): ContextBuildResult {
  const start = performance.now();
  const { maxContextTokens } = getTokenBudgets();

  // 1. Deduplicate by chunk_id
  const seen = new Set<string>();
  let deduped = chunks.filter(c => {
    if (seen.has(c.chunk_id)) return false;
    seen.add(c.chunk_id);
    return true;
  });

  // 2. Remove near-duplicates (Jaccard similarity > 0.85)
  deduped = removeNearDuplicates(deduped, 0.85);

  // 3. Already sorted by relevance from reranker, but ensure sort
  deduped.sort((a, b) => b.score - a.score);

  // 4. Enforce token budget — greedily add chunks until budget exhausted
  const selectedChunks: ScoredChunk[] = [];
  let totalTokens = 0;
  const maxChunks = 5;

  for (const chunk of deduped) {
    if (selectedChunks.length >= maxChunks) break;

    const chunkTokens = estimateTokens(chunk.text);
    if (totalTokens + chunkTokens > maxContextTokens) {
      // Try to truncate this chunk to fit remaining budget
      const remaining = maxContextTokens - totalTokens;
      if (remaining > 50) {
        const truncatedText = truncateToTokenBudget(chunk.text, remaining);
        selectedChunks.push({ ...chunk, text: truncatedText });
        totalTokens += estimateTokens(truncatedText);
      }
      break;
    }

    selectedChunks.push(chunk);
    totalTokens += chunkTokens;
  }

  // 5. Format context
  const contextText = selectedChunks.map((chunk, idx) => {
    return `SOURCE ${idx + 1}\nDocument: ${chunk.document_id}\nRelevance: ${(chunk.score * 100).toFixed(0)}%\nStrategy: ${chunk.chunk_strategy}\n\n${chunk.text}`;
  }).join('\n\n---\n\n');

  // Build source references
  const sources: SourceReference[] = selectedChunks.map(chunk => ({
    document_id: chunk.document_id,
    chunk_id: chunk.chunk_id,
    text: chunk.text,
    relevance: chunk.score,
    chunk_strategy: chunk.chunk_strategy,
    query_type: chunk.metadata.query_type,
  }));

  return {
    contextText,
    sources,
    chunksUsed: selectedChunks.length,
    tokenCount: totalTokens,
    latency_ms: Math.round(performance.now() - start),
  };
}

/**
 * Remove near-duplicate chunks using Jaccard similarity on word sets.
 */
function removeNearDuplicates(chunks: ScoredChunk[], threshold: number): ScoredChunk[] {
  const result: ScoredChunk[] = [];

  for (const chunk of chunks) {
    const chunkWords = new Set(chunk.text.toLowerCase().split(/\s+/));
    let isDuplicate = false;

    for (const existing of result) {
      const existingWords = new Set(existing.text.toLowerCase().split(/\s+/));
      const intersection = new Set([...chunkWords].filter(w => existingWords.has(w)));
      const union = new Set([...chunkWords, ...existingWords]);
      const jaccard = intersection.size / union.size;

      if (jaccard > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(chunk);
    }
  }

  return result;
}
