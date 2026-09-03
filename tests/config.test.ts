import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  test("uses costless defaults and no credential configuration", () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.doabApiBaseUrl).toBe("https://directory.doabooks.org/rest");
    expect(config.doabRequestTimeoutMs).toBe(15_000);
    expect(config.rateLimitMaxRequests).toBe(120);
    expect(config.rateLimitWindowSeconds).toBe(60);
    expect(config.maxRequestBodyBytes).toBe(100_000);
    expect(config.trustProxy).toBe(false);
    expect(config.buildSha).toBe("development");
    expect(Object.keys(config).some((key) => /key|token|secret|openai/i.test(key))).toBe(false);
  });

  test("clamps default max results to configured limit", () => {
    const config = loadConfig({ MAX_RESULTS_DEFAULT: "50", MAX_RESULTS_LIMIT: "25" });

    expect(config.maxResultsDefault).toBe(25);
    expect(config.maxResultsLimit).toBe(25);
  });

  test("enables the in-memory cache by default with sane bounds", () => {
    const config = loadConfig({});

    expect(config.enableMemoryCache).toBe(true);
    expect(config.memoryCacheMaxEntries).toBe(200);
    expect(config.memoryCacheTtlSeconds).toBe(900);
  });

  test("can disable the in-memory cache and override its bounds", () => {
    const config = loadConfig({
      ENABLE_MEMORY_CACHE: "false",
      MEMORY_CACHE_MAX_ENTRIES: "50",
      MEMORY_CACHE_TTL_SECONDS: "60"
    });

    expect(config.enableMemoryCache).toBe(false);
    expect(config.memoryCacheMaxEntries).toBe(50);
    expect(config.memoryCacheTtlSeconds).toBe(60);
  });

  test("clamps an unreasonably short request timeout", () => {
    const config = loadConfig({ BUILD_SHA: "abc123", DOAB_REQUEST_TIMEOUT_MS: "500" });

    expect(config.doabRequestTimeoutMs).toBe(1_000);
    expect(config.buildSha).toBe("abc123");
  });
});
