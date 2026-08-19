/**
 * Retrieval sufficiency guardrail.
 * If the best retrieval score is below SUFFICIENCY_THRESHOLD, refuse to generate.
 */

import { ScoredChunk } from '@/lib/types';

export function checkSufficiency(chunks: ScoredChunk[]): {
  sufficient: boolean;
  bestScore: number;
  threshold: number;
} {
  const threshold = parseFloat(process.env.SUFFICIENCY_THRESHOLD || '0.35');

  if (chunks.length === 0) {
    return { sufficient: false, bestScore: 0, threshold };
  }

  const bestScore = Math.max(...chunks.map(c => c.score));

  return {
    sufficient: bestScore >= threshold,
    bestScore,
    threshold,
  };
}
