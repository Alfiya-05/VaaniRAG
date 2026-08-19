/**
 * Local embedding model using @xenova/transformers.
 * Singleton — model is loaded once and reused for all requests.
 */

let pipeline: any = null;
let loadingPromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    const modelName = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    console.log(`[Embeddings] Loading model: ${modelName}...`);
    const p = await createPipeline('feature-extraction', modelName, {
      quantized: true,
    });
    console.log(`[Embeddings] Model loaded successfully.`);
    pipeline = p;
    return p;
  })();

  return loadingPromise;
}

/**
 * Generate embeddings for a single text.
 * Returns a Float32Array of 384 dimensions.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling embed() in a loop.
 */
export async function embedBatch(texts: string[], batchSize: number = 64): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const outputs = await Promise.all(
      batch.map(async (text) => {
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data as Float32Array);
      })
    );
    results.push(...outputs);
  }

  return results;
}

/**
 * Warm up the model at startup. Call this during initialization.
 */
export async function warmupEmbeddings(): Promise<void> {
  await embed('warmup');
}

export const EMBEDDING_DIM = 384;
