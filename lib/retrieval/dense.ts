/**
 * Dense retrieval via Qdrant ANN (Approximate Nearest Neighbor) search.
 * Uses the `query` API (Qdrant JS client v1.12+).
 */

import { getQdrantClient, getCollectionName } from '@/lib/vectordb/qdrant';
import { embed } from '@/lib/embeddings/local';
import { ScoredChunk } from '@/lib/types';
import { embeddingCache, normalizeForCache } from '@/lib/cache/query-cache';

export async function denseSearch(
  query: string,
  topK?: number,
  filter?: Record<string, unknown>
): Promise<{ results: ScoredChunk[]; embedding_ms: number; search_ms: number }> {
  const limit = topK || parseInt(process.env.RETRIEVAL_TOP_K || '10', 10);

  // Check embedding cache
  const cacheKey = normalizeForCache(query);
  let queryEmbedding: number[];
  const embStart = performance.now();

  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    queryEmbedding = cached;
  } else {
    queryEmbedding = await embed(query);
    embeddingCache.set(cacheKey, queryEmbedding);
  }
  const embedding_ms = Math.round(performance.now() - embStart);

  // Search Qdrant using the `query` API
  const searchStart = performance.now();
  const qdrant = getQdrantClient();
  const collection = getCollectionName();

  const searchResult = await qdrant.query(collection, {
    query: queryEmbedding,
    limit,
    with_payload: true,
    filter: filter ? { must: Object.entries(filter).map(([key, value]) => ({
      key,
      match: { value },
    })) } : undefined,
  });

  const search_ms = Math.round(performance.now() - searchStart);

  const results: ScoredChunk[] = (searchResult.points || []).map((hit: any, idx: number) => {
    const payload = (hit.payload || {}) as Record<string, unknown>;
    const metadata = (payload.metadata || {}) as Record<string, unknown>;

    return {
      chunk_id: payload.chunk_id as string || String(hit.id),
      document_id: payload.document_id as string || '',
      text: payload.text as string || '',
      chunk_strategy: payload.chunk_strategy as ScoredChunk['chunk_strategy'] || 'fixed-window',
      metadata: {
        language: (metadata.language as string) || 'en',
        query_type: (metadata.query_type as string) || '',
        is_selected: (metadata.is_selected as boolean) || false,
        source_query_id: (metadata.source_query_id as number) || 0,
      },
      score: hit.score ?? 0,
      rank: idx + 1,
      retrieval_method: 'dense',
    };
  });

  return { results, embedding_ms, search_ms };
}
