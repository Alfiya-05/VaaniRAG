/**
 * Qdrant full-text search (lexical retrieval).
 * Uses Qdrant's built-in full-text index — NOT BM25.
 * Qdrant uses a tokenized inverted index with its own scoring.
 */

import { getQdrantClient, getCollectionName } from '@/lib/vectordb/qdrant';
import { ScoredChunk } from '@/lib/types';

export async function fulltextSearch(query: string, topK?: number): Promise<ScoredChunk[]> {
  const limit = topK || parseInt(process.env.RETRIEVAL_TOP_K || '10', 10);
  const qdrant = getQdrantClient();
  const collection = getCollectionName();

  try {
    const scrollResult = await qdrant.scroll(collection, {
      filter: {
        must: [{
          key: 'text',
          match: { text: query },
        }],
      },
      limit,
      with_payload: true,
      with_vector: false,
    });

    return (scrollResult.points || []).map((point, idx) => {
      const payload = point.payload as Record<string, unknown>;
      const metadata = (payload.metadata || {}) as Record<string, unknown>;

      return {
        chunk_id: payload.chunk_id as string || String(point.id),
        document_id: payload.document_id as string || '',
        text: payload.text as string || '',
        chunk_strategy: payload.chunk_strategy as ScoredChunk['chunk_strategy'] || 'fixed-window',
        metadata: {
          language: (metadata.language as string) || 'en',
          query_type: (metadata.query_type as string) || '',
          is_selected: (metadata.is_selected as boolean) || false,
          source_query_id: (metadata.source_query_id as number) || 0,
        },
        score: 1 - (idx * 0.05), // Qdrant scroll doesn't return similarity scores; rank-based proxy
        rank: idx + 1,
        retrieval_method: 'fulltext' as const,
      };
    });
  } catch (err) {
    console.warn('[FullText] Qdrant full-text search failed:', err);
    return [];
  }
}
