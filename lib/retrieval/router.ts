/**
 * Retrieval router — runs dense + lexical search in parallel, then fuses results.
 * The lexical method is configurable: 'bm25' (genuine BM25) or 'fulltext' (Qdrant full-text).
 */

import { ScoredChunk } from '@/lib/types';
import { denseSearch } from './dense';
import { bm25Search } from './bm25';
import { fulltextSearch } from './fulltext';
import { reciprocalRankFusion } from './fusion';

export interface RetrievalResult {
  candidates: ScoredChunk[];
  dense_results: ScoredChunk[];
  lexical_results: ScoredChunk[];
  embedding_ms: number;
  dense_ms: number;
  lexical_ms: number;
  fusion_ms: number;
}

export async function hybridRetrieve(query: string): Promise<RetrievalResult> {
  const lexicalMethod = process.env.LEXICAL_METHOD || 'bm25';

  // Run dense and lexical in parallel
  const [denseResult, lexicalResult] = await Promise.all([
    (async () => {
      return denseSearch(query);
    })(),
    (async () => {
      const start = performance.now();
      let results: ScoredChunk[];
      if (lexicalMethod === 'fulltext') {
        results = await fulltextSearch(query);
      } else {
        results = await bm25Search(query);
      }
      return { results, latency_ms: Math.round(performance.now() - start) };
    })(),
  ]);

  // Fuse results
  const fusionStart = performance.now();
  const candidates = reciprocalRankFusion(denseResult.results, lexicalResult.results);
  const fusion_ms = Math.round(performance.now() - fusionStart);

  return {
    candidates,
    dense_results: denseResult.results,
    lexical_results: lexicalResult.results,
    embedding_ms: denseResult.embedding_ms,
    dense_ms: denseResult.search_ms,
    lexical_ms: lexicalResult.latency_ms,
    fusion_ms,
  };
}
