/**
 * Query processor — normalization, intent detection, optional expansion.
 * Query expansion is OFF by default (ENABLE_QUERY_EXPANSION=false).
 */

export type QueryIntent = 'factual' | 'descriptive' | 'off-topic' | 'unsafe' | 'ambiguous';

export interface ProcessedQuery {
  original: string;
  normalized: string;
  intent: QueryIntent;
  isUnsafe: boolean;
  isOffTopic: boolean;
  expandedQueries: string[];
  latency_ms: number;
}

// Unsafe content patterns
const UNSAFE_PATTERNS = [
  /\b(kill|murder|suicide|bomb|attack|weapon|exploit|hack|crack)\b/i,
  /\b(porn|xxx|nude|naked|sex|rape|molest)\b/i,
  /\b(drug|cocaine|heroin|meth|illegal)\s+(deal|sell|buy|make)\b/i,
  /how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|weapon|explosive|drug)/i,
  /\b(terrorist|terrorism|extremist)\b/i,
];

// Off-topic patterns (things clearly outside a general knowledge QA dataset)
const OFF_TOPIC_PATTERNS = [
  /\b(weather|forecast)\s+(today|tomorrow|this\s+week)\b/i,
  /\bwhat\s+time\s+is\s+it\b/i,
  /\b(stock|share)\s+price\b/i,
  /\b(order|buy|purchase)\s+(food|pizza|grocery)\b/i,
  /\bset\s+(a\s+)?(timer|alarm|reminder)\b/i,
  /\b(play|stream)\s+(music|song|video|movie)\b/i,
  /\b(call|text|message)\s+(my|a)\b/i,
  /\bwhat('s|s)?\s+my\s+(name|age|address)\b/i,
  /\btell\s+me\s+a\s+joke\b/i,
  /\b(horoscope|zodiac|astrology)\b/i,
];

export function processQuery(query: string): ProcessedQuery {
  const start = performance.now();

  const normalized = normalizeQuery(query);
  const isUnsafe = checkUnsafe(normalized);
  const isOffTopic = checkOffTopic(normalized);

  let intent: QueryIntent;
  if (isUnsafe) {
    intent = 'unsafe';
  } else if (isOffTopic) {
    intent = 'off-topic';
  } else if (isDescriptive(normalized)) {
    intent = 'descriptive';
  } else {
    intent = 'factual';
  }

  const expandedQueries: string[] = [];
  // Query expansion is OFF by default. Only expand if enabled AND query is ambiguous.
  const enableExpansion = process.env.ENABLE_QUERY_EXPANSION === 'true';
  if (enableExpansion && intent === 'factual') {
    expandedQueries.push(...generateExpansions(normalized));
  }

  return {
    original: query,
    normalized,
    intent,
    isUnsafe,
    isOffTopic,
    expandedQueries,
    latency_ms: Math.round(performance.now() - start),
  };
}

function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s?.,!'-]/g, '')
    .slice(0, 500); // Hard cap on query length
}

function checkUnsafe(query: string): boolean {
  return UNSAFE_PATTERNS.some(pattern => pattern.test(query));
}

function checkOffTopic(query: string): boolean {
  return OFF_TOPIC_PATTERNS.some(pattern => pattern.test(query));
}

function isDescriptive(query: string): boolean {
  const descriptiveStarters = [
    /^(explain|describe|what\s+is|what\s+are|how\s+does|how\s+do|why\s+does|why\s+do|define)\b/i,
  ];
  return descriptiveStarters.some(p => p.test(query));
}

function generateExpansions(query: string): string[] {
  // Simple rule-based expansion (no LLM call — keeps latency low)
  const expansions: string[] = [];

  // "What is X?" → "X definition", "X meaning"
  const whatIsMatch = query.match(/what\s+(?:is|are)\s+(.+?)[\s?]*$/i);
  if (whatIsMatch) {
    const topic = whatIsMatch[1];
    expansions.push(`${topic} definition`);
    expansions.push(`${topic} explanation`);
  }

  // "Why does X?" → "cause of X", "reason for X"
  const whyMatch = query.match(/why\s+(?:does|do|is|are)\s+(.+?)[\s?]*$/i);
  if (whyMatch) {
    const topic = whyMatch[1];
    expansions.push(`cause of ${topic}`);
    expansions.push(`reason for ${topic}`);
  }

  // "How does X work?" → "X mechanism", "X process"
  const howMatch = query.match(/how\s+does\s+(.+?)\s+work[\s?]*$/i);
  if (howMatch) {
    const topic = howMatch[1];
    expansions.push(`${topic} mechanism`);
    expansions.push(`${topic} process`);
  }

  return expansions.slice(0, 3); // Max 3 expansions
}
