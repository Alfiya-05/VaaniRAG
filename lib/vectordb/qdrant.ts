/**
 * Qdrant vector database client wrapper.
 * Singleton â€” client is created once and reused.
 * Compatible with @qdrant/js-client-rest v1.12+
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { EMBEDDING_DIM } from '@/lib/embeddings/local';

let client: QdrantClient | null = null;

let ingestionClient: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (client) return client;

  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!url) {
    throw new Error('QDRANT_URL environment variable is required');
  }

  client = new QdrantClient({
    url,
    apiKey: apiKey || undefined,
    checkCompatibility: false,
    timeout: 15000,
  });

  return client;
}

export function getQdrantIngestionClient(): QdrantClient {
  if (ingestionClient) return ingestionClient;
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url) throw new Error('QDRANT_URL environment variable is required');
  const timeoutMs = Number(process.env.QDRANT_TIMEOUT_MS || 120000);
  ingestionClient = new QdrantClient({ url, apiKey: apiKey || undefined, checkCompatibility: false, timeout: timeoutMs });
  return ingestionClient;
}

export function getCollectionName(): string {
  return process.env.QDRANT_COLLECTION || 'vaani_rag';
}

/**
 * Ensure collection exists with correct config.
 * Creates it if missing, leaves it alone if present.
 */
export async function resetCollectionIfEnabled(): Promise<boolean> {
  if ((process.env.RESET_QDRANT_COLLECTION || 'false').toLowerCase() !== 'true') return false;
  const qdrant = getQdrantIngestionClient();
  const name = getCollectionName();
  const exists = await qdrant.collectionExists(name);
  if (exists.exists) {
    console.warn(`[Qdrant] RESET_QDRANT_COLLECTION=true: deleting collection '${name}' before development ingestion.`);
    await qdrant.deleteCollection(name);
  }
  console.warn(`[Qdrant] Development reset complete for collection '${name}'. The normal schema creation path will recreate it.`);
  return true;
}

function isNotFoundError(error: unknown): boolean {
  const message = String(error);
  return message.includes('404') || message.includes('Not Found');
}

function isConflictError(error: unknown): boolean {
  const message = String(error);
  return message.includes('409') || message.includes('Conflict') || message.includes('already exists');
}

export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();
  const name = getCollectionName();

  let exists = false;
  try {
    const existsResult = await qdrant.collectionExists(name);
    // collectionExists returns { exists: boolean }
    exists = existsResult.exists;
  } catch (error) {
    // Only a real 404 means the collection is absent. Authentication,
    // timeout, network, and server errors must not fall through to create.
    if (!isNotFoundError(error)) {
      throw new Error(`[Qdrant] Collection existence check failed for '${name}': ${String(error)}`);
    }
  }

  if (exists) {
    console.log(`[Qdrant] Collection '${name}' already exists; reusing it.`);
    return;
  }

  console.log(`[Qdrant] Creating collection '${name}'...`);
  try {
    await qdrant.createCollection(name, {
      vectors: {
        size: EMBEDDING_DIM,
        distance: 'Cosine',
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      hnsw_config: {
        m: 16,
        ef_construct: 100,
      },
    });
  } catch (error) {
    // Make creation safe against a concurrent creator without hiding other
    // failures. Reuse only after a conflict is confirmed to be present.
    if (!isConflictError(error)) throw error;
    const afterConflict = await qdrant.collectionExists(name);
    if (!afterConflict.exists) throw error;
    console.warn(`[Qdrant] Collection '${name}' was created concurrently; reusing it.`);
    return;
  }

  // Create payload indexes for fast filtering
  await qdrant.createPayloadIndex(name, {
    field_name: 'language',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(name, {
    field_name: 'chunk_strategy',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(name, {
    field_name: 'query_type',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(name, {
    field_name: 'document_id',
    field_schema: 'keyword',
  });

  // Create full-text index on text field for lexical retrieval
  await qdrant.createPayloadIndex(name, {
    field_name: 'text',
    field_schema: {
      type: 'text',
      tokenizer: 'word',
      min_token_len: 2,
      max_token_len: 20,
      lowercase: true,
    },
  });

  console.log(`[Qdrant] Collection '${name}' created with indexes.`);
}

/**
 * Get collection info for health checks.
 */
/**
 * Get collection info for health checks.
 */
export async function getCollectionInfo() {
  const collection = getCollectionName();
  try {
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    if (!url) throw new Error('QDRANT_URL environment variable is required');

    // Next.js may cache GET requests made through a client library. Use an
    // explicit authenticated no-store request for truthful health reporting.
    const endpoint = `${url.replace(/\/+$/, '')}/collections/${encodeURIComponent(collection)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: apiKey ? { 'api-key': apiKey } : undefined,
      cache: 'no-store',
    });

    if (response.status === 404) {
      return { status: 'connected' as const, collection, collection_exists: false, points_count: 0, vectors_count: 0 };
    }
    if (!response.ok) {
      throw new Error(`Qdrant collection-info request failed with HTTP ${response.status}`);
    }

    const body = await response.json() as { result?: { points_count?: number; indexed_vectors_count?: number } };
    const result = body.result;
    const indexedVectors = result?.indexed_vectors_count ?? 0;
    return {
      status: 'connected' as const,
      collection,
      collection_exists: true,
      points_count: result?.points_count ?? 0,
      vectors_count: indexedVectors > 0 ? indexedVectors : (result?.points_count ?? 0),
    };
  } catch (e) {
    return { status: 'disconnected' as const, error: String(e) };
  }
}

