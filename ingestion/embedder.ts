/**
 * Batch embedding generator for ingestion.
 * Uses local MiniLM model.
 */

import { embedBatch } from '@/lib/embeddings/local';
import { ChunkRecord } from '@/lib/types';

export interface EmbeddedChunk extends ChunkRecord {
  embedding: number[];
}

/**
 * Generate embeddings for all chunks in batches.
 */
export async function embedChunks(
  chunks: ChunkRecord[],
  batchSize: number = 64
): Promise<EmbeddedChunk[]> {
  console.log(`[Embedder] Generating embeddings for ${chunks.length} chunks (batch size: ${batchSize})...`);

  const results: EmbeddedChunk[] = [];
  const start = performance.now();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    const embeddings = await embedBatch(texts, batchSize);

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: embeddings[j],
      });
    }

    const progress = Math.min(100, Math.round(((i + batch.length) / chunks.length) * 100));
    console.log(`[Embedder] Progress: ${progress}% (${i + batch.length}/${chunks.length})`);
  }

  const elapsed = Math.round((performance.now() - start) / 1000);
  console.log(`[Embedder] Completed ${results.length} embeddings in ${elapsed}s`);
  return results;
}
