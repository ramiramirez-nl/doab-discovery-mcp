import type { CacheEntry, CacheSetOptions, CacheStore } from "./store.js";
import { isExpired } from "./store.js";

export interface MemoryCacheOptions {
  /** Hard cap on retained entries; the least recently used entry is evicted past this. */
  maxEntries?: number;
}

/**
 * Per-process LRU cache, safe to enable on read-only or ephemeral filesystems where the file
 * cache cannot run.
 *
 * This matters because query relaxation can issue several upstream requests for a single tool
 * call, because the ladder walks from a narrow AND down to a broad OR and every rung that returns
 * nothing is still a round trip. Repeated or overlapping queries would otherwise replay all of
 * them against DOAB.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(options: MemoryCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 200));
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used; Map preserves insertion order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, payload: T, options: CacheSetOptions): Promise<CacheEntry<T>> {
    const entry: CacheEntry<T> = {
      key,
      createdAt: new Date().toISOString(),
      ttlSeconds: options.ttlSeconds,
      source: options.source,
      payloadVersion: options.payloadVersion,
      payload
    };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return entry;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
