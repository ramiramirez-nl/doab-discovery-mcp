import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { FileCacheStore } from "../src/cache/file-cache-store.js";
import { createCacheKey } from "../src/cache/keys.js";

describe("FileCacheStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "doab-cache-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("stores cache metadata and payload", async () => {
    const store = new FileCacheStore(dir);
    const key = createCacheKey("doab", { q: "manuscripts" });

    await store.set(key, { total: 1 }, { ttlSeconds: 60, source: "doab-api", payloadVersion: 1 });
    const hit = await store.get<{ total: number }>(key);

    expect(hit?.key).toBe(key);
    expect(hit?.source).toBe("doab-api");
    expect(hit?.ttlSeconds).toBe(60);
    expect(hit?.payloadVersion).toBe(1);
    expect(hit?.payload.total).toBe(1);
  });

  test("misses expired entries and invalidates keys", async () => {
    const store = new FileCacheStore(dir);
    const key = createCacheKey("doab", "expired");

    await store.set(key, { ok: true }, { ttlSeconds: -1, source: "test", payloadVersion: 1 });
    expect(await store.get(key)).toBeUndefined();

    await store.set(key, { ok: true }, { ttlSeconds: 60, source: "test", payloadVersion: 1 });
    await store.delete(key);
    expect(await store.get(key)).toBeUndefined();
  });
});
