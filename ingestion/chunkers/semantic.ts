/**
 * Semantic chunking — splits text on semantic boundaries.
 * Uses sentence-level cosine similarity to detect topic shifts.
 * When similarity between consecutive sentences drops significantly,
 * a new chunk boundary is created.
 */

import { ChunkRecord } from '@/lib/types';
import { PassageRecord } from '../preprocess';

/**
 * Split text into semantic chunks based on sentence similarity.
 * Since we can't embed each sentence during ingestion (too expensive),
 * we use heuristic paragraph/topic boundary detection.
 */
export function semanticChunk(passages: PassageRecord[]): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];

  for (const passage of passages) {
    const sentences = splitSentences(passage.text);
    if (sentences.length === 0) continue;

    const groups = groupBySemantic(sentences);

    for (let i = 0; i < groups.length; i++) {
      const text = groups[i].join(' ').trim();
      if (text.length < 30) continue;

      chunks.push({
        chunk_id: `${passage.document_id}_chunk${i}_semantic`,
        document_id: passage.document_id,
        text,
        chunk_strategy: 'semantic',
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

  return chunks;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

/**
 * Group sentences into semantic chunks.
 * Uses word overlap between consecutive sentences as a proxy for topic coherence.
 * A new chunk starts when overlap drops below threshold.
 */
function groupBySemantic(sentences: string[]): string[][] {
  if (sentences.length <= 3) return [sentences];

  const groups: string[][] = [];
  let current: string[] = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const prevWords = new Set(sentences[i - 1].toLowerCase().split(/\s+/));
    const currWords = new Set(sentences[i].toLowerCase().split(/\s+/));
    const intersection = [...currWords].filter(w => prevWords.has(w) && w.length > 3);
    const overlap = intersection.length / Math.max(currWords.size, 1);

    // Topic shift detection: low overlap suggests new topic
    if (overlap < 0.1 && current.length >= 2) {
      groups.push([...current]);
      current = [sentences[i]];
    } else {
      current.push(sentences[i]);
      // Also split if chunk is getting too long
      if (current.join(' ').length > 1500) {
        groups.push([...current]);
        current = [];
      }
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}
