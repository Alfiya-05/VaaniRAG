/**
 * Reciprocal Rank Fusion (RRF) — merges results from multiple retrieval methods.
 * score = Σ 1/(k + rank_i) where k=60
 */

import { ScoredChunk } from '@/lib/types';

const RRF_K = 60;

export function reciprocalRankFusion(
  ...resultSets: ScoredChunk[][]
): ScoredChunk[] {
  const fusedScores = new Map<string, { chunk: ScoredChunk; rrfScore: number; methods: string[] }>();

  for (const results of resultSets) {
    for (const chunk of results) {
      const existing = fusedScores.get(chunk.chunk_id);
      const rrfContribution = 1 / (RRF_K + chunk.rank);

      if (existing) {
        existing.rrfScore += rrfContribution;
        if (!existing.methods.includes(chunk.retrieval_method)) {
          existing.methods.push(chunk.retrieval_method);
        }
        // Keep the higher individual score
        if (chunk.score > existing.chunk.score) {
          existing.chunk = { ...chunk };
        }
      } else {
        fusedScores.set(chunk.chunk_id, {
          chunk: { ...chunk },
          rrfScore: rrfContribution,
          methods: [chunk.retrieval_method],
        });
      }
    }
  }

  // Sort by fused RRF score
  const fused = Array.from(fusedScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);

  return fused.map((entry, idx) => ({
    ...entry.chunk,
    score: entry.rrfScore,
    rank: idx + 1,
    retrieval_method: 'fused' as const,
  }));
}
