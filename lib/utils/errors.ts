export class RAGError extends Error {
  public readonly stage: string;
  public readonly statusCode: number;
  public readonly userMessage: string;

  constructor(stage: string, message: string, userMessage?: string, statusCode: number = 500) {
    super(message);
    this.name = 'RAGError';
    this.stage = stage;
    this.statusCode = statusCode;
    this.userMessage = userMessage || 'An internal error occurred. Please try again.';
  }
}

export class STTError extends RAGError {
  constructor(message: string) {
    super('stt', message, 'Speech recognition failed. Please try again or use text input.', 502);
  }
}

export class RetrievalError extends RAGError {
  constructor(message: string) {
    super('retrieval', message, 'Unable to search the knowledge base. Please try again.', 503);
  }
}

export class GenerationError extends RAGError {
  constructor(message: string) {
    super('generation', message, 'Unable to generate an answer. Please try again.', 502);
  }
}

export class GuardrailError extends RAGError {
  public readonly guardrailType: 'off-topic' | 'safety' | 'sufficiency' | 'grounding';

  constructor(guardrailType: 'off-topic' | 'safety' | 'sufficiency' | 'grounding', userMessage: string) {
    super('guardrail', `Guardrail triggered: ${guardrailType}`, userMessage, 200);
    this.guardrailType = guardrailType;
  }
}

export class InsufficientContextError extends GuardrailError {
  constructor() {
    super(
      'sufficiency',
      "I don't have enough information in the available knowledge base to answer that reliably."
    );
  }
}

export class OffTopicError extends GuardrailError {
  constructor() {
    super(
      'off-topic',
      "I can't answer that because the question is outside the available knowledge base."
    );
  }
}

export class UnsafeContentError extends GuardrailError {
  constructor() {
    super(
      'safety',
      "I'm unable to process that request as it contains content outside my guidelines."
    );
  }
}

export class GroundingFailureError extends GuardrailError {
  constructor() {
    super(
      'grounding',
      "I wasn't able to generate a sufficiently grounded answer from the available evidence. The knowledge base may not contain enough relevant information for this question."
    );
  }
}

export function toSafeError(error: unknown): { message: string; stage: string; statusCode: number } {
  if (error instanceof RAGError) {
    return {
      message: error.userMessage,
      stage: error.stage,
      statusCode: error.statusCode,
    };
  }
  return {
    message: 'An unexpected error occurred. Please try again.',
    stage: 'unknown',
    statusCode: 500,
  };
}
