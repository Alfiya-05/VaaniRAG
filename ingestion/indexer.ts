/** Qdrant indexer: deterministic sequential batched upserts. */
import { createHash } from 'node:crypto';
import { getQdrantIngestionClient, getCollectionName, ensureCollection, resetCollectionIfEnabled } from '@/lib/vectordb/qdrant';
import { EmbeddedChunk } from './embedder';

export function deterministicPointId(chunk: EmbeddedChunk): string {
  const seed = [chunk.document_id, chunk.chunk_strategy, chunk.chunk_id, chunk.text].join('\0');
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20)}`;
}

export async function indexChunks(chunks: EmbeddedChunk[], batchSize = Number(process.env.QDRANT_BATCH_SIZE || 64)): Promise<void> {
  const qdrant = getQdrantIngestionClient();
  const collection = getCollectionName();
  await resetCollectionIfEnabled();
  await ensureCollection();
  const size = Math.max(1, Math.min(256, Math.floor(batchSize)));
  const total = Math.ceil(chunks.length / size);
  console.log(`[Indexer] Uploading ${chunks.length} chunks in ${total} sequential batches (batch_size=${size})...`);
  const start = performance.now();
  for (let i = 0; i < chunks.length; i += size) {
    const batch = chunks.slice(i, i + size);
    const number = Math.floor(i / size) + 1;
    console.log(`[Qdrant] Uploading batch ${number}/${total} (${batch.length} points)`);
    const points = batch.map(chunk => ({ id: deterministicPointId(chunk), vector: chunk.embedding, payload: { chunk_id: chunk.chunk_id, document_id: chunk.document_id, text: chunk.text, chunk_strategy: chunk.chunk_strategy, language: chunk.metadata.language, query_type: chunk.metadata.query_type, is_selected: chunk.metadata.is_selected, source_query_id: chunk.metadata.source_query_id, metadata: chunk.metadata } }));
    const requestBytes = Buffer.byteLength(JSON.stringify(points), 'utf8');
    const payloadBytes = Buffer.byteLength(JSON.stringify(points.map(point => point.payload)), 'utf8');
    const vectorBytes = Buffer.byteLength(JSON.stringify(points.map(point => point.vector)), 'utf8');
    const batchStart = performance.now();
    try {
      await qdrant.upsert(collection, { wait: true, points });
    } catch (error) {
      console.error(`[Qdrant] Batch ${number}/${total} failed after ${Math.round(performance.now() - batchStart)}ms; retries=0; request_bytes=${requestBytes}; payload_bytes=${payloadBytes}; vector_bytes=${vectorBytes}; error=${String(error)}`);
      throw error;
    }
    const batchMs = Math.round(performance.now() - batchStart);
    console.log(`[Qdrant] Batch ${number}/${total}: ${batch.length} points - ${batchMs}ms; request_bytes=${requestBytes}; payload_bytes=${payloadBytes}; vector_bytes=${vectorBytes}; retries=0`);
    console.log(`[Indexer] Progress: ${Math.min(100, Math.round(((i + batch.length) / chunks.length) * 100))}% (${i + batch.length}/${chunks.length})`);
  }
  console.log(`[Indexer] Uploaded/upserted ${chunks.length} chunks in ${Math.round((performance.now() - start) / 1000)}s`);
}




