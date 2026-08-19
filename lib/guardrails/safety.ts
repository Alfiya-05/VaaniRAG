/**
 * Safety guardrail — detects unsafe/inappropriate content.
 * Returns true if content is unsafe.
 */

const UNSAFE_CATEGORIES = {
  violence: [
    /\b(how\s+to\s+)?(kill|murder|assassinate|harm|hurt|injure)\s+(a\s+)?(person|someone|people|human)/i,
    /\b(make|build|create|construct)\s+(a\s+)?(bomb|explosive|weapon|gun|poison)/i,
    /\b(plan|organize|commit)\s+(a\s+)?(attack|shooting|bombing|massacre)/i,
  ],
  sexual: [
    /\b(porn|pornograph|xxx|nude|naked)\b/i,
    /\b(sex|sexual)\s+(with|involving)\s+(minor|child|kid|underage)/i,
  ],
  illegal: [
    /\b(how\s+to\s+)?(hack|crack|breach|exploit)\s+(into|a)\b/i,
    /\b(steal|forge|counterfeit)\s+(identity|passport|money|credit\s+card)/i,
    /\b(make|cook|produce|synthesize)\s+(meth|cocaine|heroin|fentanyl|drug)/i,
    /\b(how\s+to\s+)?(launder|evade|avoid)\s+(money|tax|detection)/i,
  ],
  self_harm: [
    /\b(how\s+to\s+)?(commit\s+)?(suicide|self[- ]harm|kill\s+myself|end\s+my\s+life)/i,
    /\bways\s+to\s+(die|end\s+it|hurt\s+myself)/i,
  ],
  hate: [
    /\b(hate|inferior|subhuman)\s+(race|ethnic|religion|gender)/i,
    /\b(genocide|ethnic\s+cleansing|racial\s+superiority)/i,
  ],
};

export interface SafetyResult {
  isSafe: boolean;
  category?: string;
}

export function checkSafety(query: string): SafetyResult {
  for (const [category, patterns] of Object.entries(UNSAFE_CATEGORIES)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return { isSafe: false, category };
      }
    }
  }
  return { isSafe: true };
}
