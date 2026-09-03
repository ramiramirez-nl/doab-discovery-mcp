import { describe, expect, test } from "vitest";

import { MemoryCacheStore } from "../src/cache/memory-cache-store.js";

describe("MemoryCacheStore", () => {
  test("stores and retrieves a payload", async () => {
    const store = new MemoryCacheStore();

    await store.set("k1", { total: 1 }, { ttlSeconds: 60, source: "doab-api", payloadVersion: 1 });
    const hit = await store.get<{ total: number }>("k1");

    expect(hit?.payload.total).toBe(1);
    expect(hit?.source).toBe("doab-api");
  });

  test("misses expired entries and invalidates keys", async () => {
    const store = new MemoryCacheStore();

    await store.set("k1", { ok: true }, { ttlSeconds: -1, source: "test", payloadVersion: 1 });
    expect(await store.get("k1")).toBeUndefined();

    await store.set("k2", { ok: true }, { ttlSeconds: 60, source: "test", payloadVersion: 1 });
    await store.delete("k2");
    expect(await store.get("k2")).toBeUndefined();
  });

  test("evicts the least recently used entry once maxEntries is exceeded", async () => {
    const store = new MemoryCacheStore({ maxEntries: 2 });
    const opts = { ttlSeconds: 60, source: "test", payloadVersion: 1 };

    await store.set("a", 1, opts);
    await store.set("b", 2, opts);
    await store.set("c", 3, opts); // should evict "a", the oldest untouched entry

    expect(await store.get("a")).toBeUndefined();
    expect((await store.get("b"))?.payload).toBe(2);
    expect((await store.get("c"))?.payload).toBe(3);
  });

  test("a get() refreshes recency, protecting the entry from the next eviction", async () => {
    const store = new MemoryCacheStore({ maxEntries: 2 });
    const opts = { ttlSeconds: 60, source: "test", payloadVersion: 1 };

    await store.set("a", 1, opts);
    await store.set("b", 2, opts);
    await store.get("a"); // "a" is now more recently used than "b"
    await store.set("c", 3, opts); // should evict "b", not "a"

    expect((await store.get("a"))?.payload).toBe(1);
    expect(await store.get("b")).toBeUndefined();
  });

  test("clear() empties the store", async () => {
    const store = new MemoryCacheStore();
    await store.set("a", 1, { ttlSeconds: 60, source: "test", payloadVersion: 1 });

    await store.clear();

    expect(await store.get("a")).toBeUndefined();
    expect(store.size()).toBe(0);
  });
});
