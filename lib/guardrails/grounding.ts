/**
 * Grounding validation guardrail.
 * Post-generation: verifies that key claims in the answer appear in source context.
 * Uses word-overlap NLI-style check — no additional LLM call.
 */

import { SourceReference } from '@/lib/types';

export interface GroundingResult {
  grounded: boolean;
  coverage: number;    // 0–1: fraction of answer sentences supported by context
  unsupportedClaims: string[];
}

/**
 * Check if the generated answer is grounded in the provided sources.
 */
export function validateGrounding(
  answer: string,
  sources: SourceReference[]
): GroundingResult {
  if (!answer || sources.length === 0) {
    return { grounded: false, coverage: 0, unsupportedClaims: [answer] };
  }

  // If the answer is a refusal/insufficient-context response, it's considered grounded
  const refusalPatterns = [
    /does not contain sufficient information/i,
    /don't have enough information/i,
    /cannot.*answer/i,
    /no.*relevant.*information/i,
    /insufficient.*information/i,
    /unable to.*answer/i,
    /outside.*knowledge base/i,
  ];
  if (refusalPatterns.some(p => p.test(answer))) {
    return { grounded: true, coverage: 1, unsupportedClaims: [] };
  }

  // Normalize both source and answer text before overlap scoring. Generated
  // answers may use LaTeX (e.g. \\, separators), punctuation, or source
  // citations that should not count as unsupported factual claims.
  const normalizeTerms = (text: string): string[] => {
    const normalized = text
      .replace(/\\,/g, '')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/(\d)[, ](?=\d)/g, '$1')
      .replace(/source\s*\d+/gi, '')
      .toLowerCase();
    return normalized.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  };

  const allSourceText = sources.map(s => s.text).join(' ');
  const sourceWords = new Set(normalizeTerms(allSourceText));

  // Citation-only fragments are attribution metadata, not independent claims.
  const answerForSentenceAnalysis = answer.replace(/\(?\s*(?:according to\s*)?source\s*\d+\s*\)?/gi, '');

  // Split answer into sentences
  const sentences = answerForSentenceAnalysis
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) {
    return { grounded: true, coverage: 1, unsupportedClaims: [] };
  }

  const unsupportedClaims: string[] = [];
  let supportedCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = normalizeTerms(sentence);
    if (sentenceWords.length === 0) {
      supportedCount++;
      continue;
    }

    // Check what fraction of content words appear in source text
    const matchCount = sentenceWords.filter(w => sourceWords.has(w)).length;
    const overlap = matchCount / sentenceWords.length;

    // A sentence is considered supported if >40% of its content words appear in sources
    if (overlap >= 0.4) {
      supportedCount++;
    } else {
      unsupportedClaims.push(sentence);
    }
  }

  const coverage = supportedCount / sentences.length;

  return {
    grounded: coverage >= 0.6, // At least 60% of sentences must be supported
    coverage,
    unsupportedClaims,
  };
}
