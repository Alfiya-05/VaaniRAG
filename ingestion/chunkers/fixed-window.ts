/**
 * Fixed-window chunking with configurable token/character windows and overlap.
 * Config from env: CHUNK_SIZE_MIN, CHUNK_SIZE_MAX, CHUNK_OVERLAP (in characters).
 */

import { ChunkRecord } from '@/lib/types';
import { PassageRecord } from '../preprocess';

export function fixedWindowChunk(passages: PassageRecord[]): ChunkRecord[] {
  const chunkSizeMin = parseInt(process.env.CHUNK_SIZE_MIN || '300', 10);
  const chunkSizeMax = parseInt(process.env.CHUNK_SIZE_MAX || '500', 10);
  const overlap = parseInt(process.env.CHUNK_OVERLAP || '75', 10);

  // Use character count as proxy (≈ 4 chars per token)
  const windowSize = chunkSizeMax * 4; // Convert token estimate to chars
  const overlapChars = overlap * 4;
  const minChars = chunkSizeMin * 4;

  const chunks: ChunkRecord[] = [];

  for (const passage of passages) {
    const text = passage.text;

    if (text.length <= windowSize) {
      // Passage fits in one chunk
      if (text.length >= minChars / 2) {
        chunks.push({
          chunk_id: `${passage.document_id}_chunk0_fixed`,
          document_id: passage.document_id,
          text,
          chunk_strategy: 'fixed-window',
          metadata: {
            language: 'en',
            query_type: passage.query_type,
            is_selected: passage.is_selected,
            source_query_id: passage.source_query_id,
            original_query: passage.original_query,
          },
        });
      }
      continue;
    }

    let chunkIdx = 0;
    let pos = 0;

    while (pos < text.length) {
      let end = pos + windowSize;

      // Try to break at a word/sentence boundary
      if (end < text.length) {
        const searchEnd = Math.min(end + 100, text.length);
        const segment = text.slice(end - 50, searchEnd);
        const periodIdx = segment.indexOf('. ');
        const spaceIdx = segment.lastIndexOf(' ');

        if (periodIdx >= 0) {
          end = end - 50 + periodIdx + 2;
        } else if (spaceIdx >= 0) {
          end = end - 50 + spaceIdx + 1;
        }
      } else {
        end = text.length;
      }

      const chunkText = text.slice(pos, end).trim();
      if (chunkText.length >= minChars / 2) {
        chunks.push({
          chunk_id: `${passage.document_id}_chunk${chunkIdx}_fixed`,
          document_id: passage.document_id,
          text: chunkText,
          chunk_strategy: 'fixed-window',
          metadata: {
            language: 'en',
            query_type: passage.query_type,
            is_selected: passage.is_selected,
            source_query_id: passage.source_query_id,
            original_query: passage.original_query,
          },
        });
      }

      chunkIdx++;
      pos = end - overlapChars;
      if (pos >= text.length - minChars / 2) break;
    }
  }

  return chunks;
}
