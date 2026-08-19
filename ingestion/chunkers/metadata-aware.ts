/**
 * Metadata-aware chunking — preserves full metadata with each chunk.
 * Keeps passages as close to their original form as possible,
 * only splitting when they exceed the configured max size.
 */

import { ChunkRecord } from '@/lib/types';
import { PassageRecord } from '../preprocess';

export function metadataAwareChunk(passages: PassageRecord[]): ChunkRecord[] {
  const maxChars = parseInt(process.env.CHUNK_SIZE_MAX || '500', 10) * 4;
  const chunks: ChunkRecord[] = [];

  for (const passage of passages) {
    const text = passage.text;

    if (text.length <= maxChars) {
      // Keep as single chunk with full metadata
      chunks.push({
        chunk_id: `${passage.document_id}_chunk0_meta`,
        document_id: passage.document_id,
        text,
        chunk_strategy: 'metadata-aware',
        metadata: {
          language: 'en',
          query_type: passage.query_type,
          is_selected: passage.is_selected,
          source_query_id: passage.source_query_id,
          original_query: passage.original_query,
        },
      });
    } else {
      // Split at paragraph/sentence boundaries while preserving metadata
      const segments = text.split(/\n\n+/);
      let currentChunk = '';
      let chunkIdx = 0;

      for (const segment of segments) {
        if (currentChunk.length + segment.length > maxChars && currentChunk.length > 0) {
          chunks.push({
            chunk_id: `${passage.document_id}_chunk${chunkIdx}_meta`,
            document_id: passage.document_id,
            text: currentChunk.trim(),
            chunk_strategy: 'metadata-aware',
            metadata: {
              language: 'en',
              query_type: passage.query_type,
              is_selected: passage.is_selected,
              source_query_id: passage.source_query_id,
              original_query: passage.original_query,
            },
          });
          chunkIdx++;
          currentChunk = segment;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + segment;
        }
      }

      if (currentChunk.trim().length > 30) {
        chunks.push({
          chunk_id: `${passage.document_id}_chunk${chunkIdx}_meta`,
          document_id: passage.document_id,
          text: currentChunk.trim(),
          chunk_strategy: 'metadata-aware',
          metadata: {
            language: 'en',
            query_type: passage.query_type,
            is_selected: passage.is_selected,
            source_query_id: passage.source_query_id,
            original_query: passage.original_query,
          },
        });
      }
    }
  }

  return chunks;
}
