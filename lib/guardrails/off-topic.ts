/**
 * Off-topic detection guardrail.
 * Checks if the query is outside the MSMARCO knowledge base domain.
 */

import { embed } from '@/lib/embeddings/local';

// Domain keywords from MSMARCO — general knowledge, science, history, health, tech, etc.
const DOMAIN_KEYWORDS = [
  'science', 'history', 'health', 'technology', 'geography', 'biology', 'chemistry',
  'physics', 'mathematics', 'medicine', 'engineering', 'computer', 'society', 'culture',
  'economy', 'politics', 'education', 'environment', 'literature', 'law', 'music',
  'art', 'sports', 'language', 'philosophy', 'psychology', 'astronomy', 'nutrition',
  'business', 'nature', 'animal', 'plant', 'ocean', 'space', 'earth', 'climate',
  'disease', 'treatment', 'definition', 'meaning', 'cause', 'effect', 'process',
  'difference', 'example', 'type', 'function', 'purpose', 'benefit', 'risk',
];

// MSMARCO covers broad general knowledge — a domain embedding for comparison
let domainEmbedding: number[] | null = null;

async function getDomainEmbedding(): Promise<number[]> {
  if (domainEmbedding) return domainEmbedding;
  const domainText = DOMAIN_KEYWORDS.join(' ');
  domainEmbedding = await embed(domainText);
  return domainEmbedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if a query is off-topic for the MSMARCO knowledge base.
 * Returns true if the query is off-topic.
 */
export async function isOffTopic(query: string, queryEmbedding?: number[]): Promise<boolean> {
  // First check pattern-based detection (fast)
  const offTopicPatterns = [
    /\b(weather|forecast)\s+(today|tomorrow|this\s+week|right\s+now)\b/i,
    /\bwhat\s+time\s+is\s+it\b/i,
    /\b(stock|share|crypto)\s+price\b/i,
    /\b(order|buy|purchase)\s+(food|pizza|grocery|uber)\b/i,
    /\bset\s+(a\s+)?(timer|alarm|reminder)\b/i,
    /\b(play|stream)\s+(music|song|video|movie|netflix)\b/i,
    /\b(call|text|message|email)\s+(my|a|the)\b/i,
    /\bwhat('s|s)?\s+my\s+(name|age|address|password)\b/i,
    /\btell\s+me\s+a\s+joke\b/i,
    /\b(horoscope|zodiac|astrology)\s+for\b/i,
    /\b(navigate|directions)\s+to\b/i,
    /\bbook\s+(a\s+)?(flight|hotel|restaurant|cab)\b/i,
  ];

  if (offTopicPatterns.some(p => p.test(query))) {
    return true;
  }

  // Embedding-based check (more nuanced)
  if (queryEmbedding) {
    try {
      const domainEmb = await getDomainEmbedding();
      const similarity = cosineSimilarity(queryEmbedding, domainEmb);
      // Very low similarity to general knowledge domain
      if (similarity < 0.15) {
        return true;
      }
    } catch {
      // Fall back to pattern-only if embedding check fails
    }
  }

  return false;
}
