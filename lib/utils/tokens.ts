/**
 * Token counting utilities.
 * Uses a simple word-based approximation (1 token ≈ 0.75 words for English).
 * This is intentionally approximate — the goal is budget enforcement, not exact billing.
 */

const AVG_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  const maxChars = maxTokens * AVG_CHARS_PER_TOKEN;
  const truncated = text.slice(0, maxChars);

  // Cut at last sentence boundary if possible
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxChars * 0.5) {
    return truncated.slice(0, cutPoint + 1);
  }

  // Fall back to last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace);
  }

  return truncated;
}

export function getTokenBudgets() {
  return {
    maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS || '1500', 10),
    maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '256', 10),
    systemPromptBudget: 250,
    queryBudget: 50,
  };
}
