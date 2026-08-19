/**
 * Genuine BM25 (Okapi BM25) implementation.
 * In-memory index built over all chunks at startup.
 *
 * Formula: score(D,Q) = Σ IDF(qi) · (f(qi,D) · (k1+1)) / (f(qi,D) + k1 · (1 - b + b · |D|/avgdl))
 *
 * Parameters: k1=1.5, b=0.75 (standard defaults)
 *
 * For 10K–50K chunks, the index fits comfortably in memory.
 */

import { ScoredChunk, ChunkRecord } from '@/lib/types';

// English stopwords
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'it', 'as', 'be', 'was', 'were', 'been', 'are', 'am', 'this',
  'that', 'these', 'those', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'so', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'up', 'out', 'also', 'into', 'its', 'my',
  'your', 'his', 'her', 'our', 'their', 'what', 'which', 'who', 'whom', 'when', 'where',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
]);

interface DocEntry {
  chunk: ChunkRecord;
  terms: Map<string, number>;  // term → frequency
  length: number;               // total token count
}

export class BM25Index {
  private docs: DocEntry[] = [];
  private df: Map<string, number> = new Map();  // document frequency per term
  private avgdl: number = 0;                     // average document length
  private k1: number = 1.5;
  private b: number = 0.75;
  private built: boolean = false;

  /**
   * Build the BM25 index from a set of chunks.
   */
  build(chunks: ChunkRecord[]): void {
    const start = performance.now();
    this.docs = [];
    this.df = new Map();

    for (const chunk of chunks) {
      const tokens = this.tokenize(chunk.text);
      const termFreqs = new Map<string, number>();
      for (const token of tokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
      }

      this.docs.push({
        chunk,
        terms: termFreqs,
        length: tokens.length,
      });

      // Update document frequency
      for (const term of termFreqs.keys()) {
        this.df.set(term, (this.df.get(term) || 0) + 1);
      }
    }

    // Compute average document length
    const totalLength = this.docs.reduce((sum, d) => sum + d.length, 0);
    this.avgdl = this.docs.length > 0 ? totalLength / this.docs.length : 1;
    this.built = true;

    console.log(`[BM25] Index built: ${this.docs.length} documents, ${this.df.size} unique terms, avgdl=${this.avgdl.toFixed(1)} (${Math.round(performance.now() - start)}ms)`);
  }

  /**
   * Search the index with a query.
   */
  search(query: string, topK: number = 10): ScoredChunk[] {
    if (!this.built || this.docs.length === 0) {
      return [];
    }

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const N = this.docs.length;
    const scores: { doc: DocEntry; score: number }[] = [];

    for (const doc of this.docs) {
      let score = 0;

      for (const qi of queryTerms) {
        const df = this.df.get(qi) || 0;
        if (df === 0) continue;

        // IDF(qi) = ln((N - df + 0.5) / (df + 0.5) + 1)
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // Term frequency in this document
        const f = doc.terms.get(qi) || 0;
        if (f === 0) continue;

        // BM25 score contribution
        const numerator = f * (this.k1 + 1);
        const denominator = f + this.k1 * (1 - this.b + this.b * (doc.length / this.avgdl));
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ doc, score });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).map((entry, idx) => ({
      ...entry.doc.chunk,
      score: entry.score,
      rank: idx + 1,
      retrieval_method: 'bm25' as const,
    }));
  }

  /**
   * Tokenize text: lowercase, split on non-alphanumeric, remove stopwords and short tokens.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
  }

  get isBuilt(): boolean {
    return this.built;
  }

  get documentCount(): number {
    return this.docs.length;
  }
}

// Singleton instance
let bm25Instance: BM25Index | null = null;

export function getBM25Index(): BM25Index {
  if (!bm25Instance) {
    bm25Instance = new BM25Index();
  }
  return bm25Instance;
}

export async function bm25Search(query: string, topK?: number): Promise<ScoredChunk[]> {
  const index = getBM25Index();
  if (!index.isBuilt) {
    console.warn('[BM25] Index not built yet — returning empty results');
    return [];
  }
  const limit = topK || parseInt(process.env.RETRIEVAL_TOP_K || '10', 10);
  return index.search(query, limit);
}
