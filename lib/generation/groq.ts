/**
 * Groq LLM generation — grounded RAG answer generation.
 * Model is configurable via LLM_MODEL env var.
 * temperature=0.1, max_tokens from MAX_OUTPUT_TOKENS.
 * Tracks token usage from Groq response.
 */

import Groq from 'groq-sdk';
import { TokenUsage } from '@/lib/types';
import { getTokenBudgets } from '@/lib/utils/tokens';

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (groqClient) return groqClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is required');
  groqClient = new Groq({ apiKey });
  return groqClient;
}

const SYSTEM_PROMPT = `You are a grounded RAG assistant for the VaaniRAG knowledge base.

RULES:
1. Answer the user's question using ONLY the provided retrieved context below.
2. Do NOT invent, assume, or hallucinate any facts not present in the context.
3. If the context does not contain sufficient information, explicitly state: "The available knowledge base does not contain sufficient information to answer this question."
4. Keep answers concise, factual, and directly relevant.
5. When possible, reference which source(s) support your answer (e.g., "According to Source 1...").
6. Do not repeat the question back.`;

export interface GenerationResult {
  answer: string;
  tokens: TokenUsage;
  model: string;
  latency_ms: number;
  ttft_ms: number; // time to first token
}

/**
 * Generate a grounded answer using Groq LLM.
 * Retries once on failure with 5s timeout.
 */
export async function generateAnswer(
  query: string,
  contextText: string
): Promise<GenerationResult> {
  const client = getGroqClient();
  const model = process.env.LLM_MODEL || 'llama-3.1-70b-versatile';
  const { maxOutputTokens } = getTokenBudgets();

  const userMessage = `RETRIEVED CONTEXT:\n${contextText}\n\nQUESTION: ${query}`;

  const start = performance.now();
  let ttft_ms = 0;
  let answer = '';
  let tokens: TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Use streaming to measure TTFT, then collect full response
      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: maxOutputTokens,
        stream: true,
      });

      let firstToken = true;
      const chunks: string[] = [];

      for await (const chunk of stream) {
        if (firstToken) {
          ttft_ms = Math.round(performance.now() - start);
          firstToken = true;
        }
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          chunks.push(content);
          if (firstToken) {
            ttft_ms = Math.round(performance.now() - start);
            firstToken = false;
          }
        }

        // Extract token usage from final chunk
        const chunkAny = chunk as any;
        if (chunkAny.x_groq?.usage || chunkAny.usage) {
          const usage = chunkAny.x_groq?.usage || chunkAny.usage;
          tokens = {
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
          };
        }
      }

      answer = chunks.join('');
      break;
    } catch (err) {
      lastError = err as Error;
      if (attempt === 0) {
        console.warn('[Groq] First attempt failed, retrying...', (err as Error).message);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  if (!answer && lastError) {
    throw lastError;
  }

  // If streaming didn't give us token counts, estimate them
  if (tokens.total_tokens === 0) {
    tokens = {
      input_tokens: Math.ceil((SYSTEM_PROMPT.length + userMessage.length) / 4),
      output_tokens: Math.ceil(answer.length / 4),
      total_tokens: Math.ceil((SYSTEM_PROMPT.length + userMessage.length + answer.length) / 4),
    };
  }

  return {
    answer,
    tokens,
    model,
    latency_ms: Math.round(performance.now() - start),
    ttft_ms,
  };
}
