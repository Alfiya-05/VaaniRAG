/**
 * Sentence-based chunking — groups 3–5 sentences with configurable overlap.
 */

import { ChunkRecord } from '@/lib/types';
import { PassageRecord } from '../preprocess';

export function sentenceChunk(
  passages: PassageRecord[],
  sentencesPerChunk: number = 4,
  overlapSentences: number = 1
): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];

  for (const passage of passages) {
    const sentences = passage.text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    if (sentences.length === 0) continue;

    // If passage has fewer sentences than chunk size, keep as one chunk
    if (sentences.length <= sentencesPerChunk) {
      chunks.push({
        chunk_id: `${passage.document_id}_chunk0_sentence`,
        document_id: passage.document_id,
        text: sentences.join(' '),
        chunk_strategy: 'sentence',
        metadata: {
          language: 'en',
          query_type: passage.query_type,
          is_selected: passage.is_selected,
          source_query_id: passage.source_query_id,
          original_query: passage.original_query,
        },
      });
      continue;
    }

    let chunkIdx = 0;
    for (let i = 0; i < sentences.length; i += sentencesPerChunk - overlapSentences) {
      const group = sentences.slice(i, i + sentencesPerChunk);
      if (group.length === 0) break;

      const text = group.join(' ').trim();
      if (text.length < 30) continue;

      chunks.push({
        chunk_id: `${passage.document_id}_chunk${chunkIdx}_sentence`,
        document_id: passage.document_id,
        text,
        chunk_strategy: 'sentence',
        metadata: {
          language: 'en',
          query_type: passage.query_type,
          is_selected: passage.is_selected,
          source_query_id: passage.source_query_id,
          original_query: passage.original_query,
        },
      });

      chunkIdx++;
      if (i + sentencesPerChunk >= sentences.length) break;
    }
  }

  return chunks;
}
