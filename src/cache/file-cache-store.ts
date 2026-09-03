import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

import type { CacheEntry, CacheSetOptions, CacheStore } from "./store.js";
import { isExpired } from "./store.js";

export class FileCacheStore implements CacheStore {
  constructor(private readonly directory: string) {}

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const raw = await readFile(this.pathFor(key), "utf8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (isExpired(entry)) {
        await this.delete(key);
        return undefined;
      }
      return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      return undefined;
    }
  }

  async set<T>(key: string, payload: T, options: CacheSetOptions): Promise<CacheEntry<T>> {
    await mkdir(this.directory, { recursive: true });
    const entry: CacheEntry<T> = {
      key,
      createdAt: new Date().toISOString(),
      ttlSeconds: options.ttlSeconds,
      source: options.source,
      payloadVersion: options.payloadVersion,
      payload
    };
    await writeFile(this.pathFor(key), JSON.stringify(entry, null, 2), "utf8");
    return entry;
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async clear(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }

  private pathFor(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return join(this.directory, `${digest}.json`);
  }
}
