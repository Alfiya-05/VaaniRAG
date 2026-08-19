/**
 * LRU cache for query embeddings and retrieval results.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 200, ttlSeconds?: number) {
    this.maxSize = maxSize;
    this.ttlMs = (ttlSeconds ?? parseInt(process.env.CACHE_TTL_SECONDS || '300', 10)) * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Normalize query string for cache key generation.
 * Ensures "What is X?" and "what is x" hit the same cache.
 */
export function normalizeForCache(query: string): string {
  return query.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

// Shared cache instances
export const embeddingCache = new LRUCache<number[]>(500);
export const retrievalCache = new LRUCache<unknown>(200);
export const answerCache = new LRUCache<unknown>(100);
