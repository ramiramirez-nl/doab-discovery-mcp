import type { AppConfig } from "./types.js";

const readNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const maxResultsLimit = Math.max(1, readNumber(env.MAX_RESULTS_LIMIT, 25));
  const requestedDefault = Math.max(1, readNumber(env.MAX_RESULTS_DEFAULT, 10));
  const deploymentBaseUrl = env.DEPLOYMENT_BASE_URL?.trim() || undefined;

  return {
    port: readNumber(env.PORT, 3000),
    doabApiBaseUrl: env.DOAB_API_BASE_URL || "https://directory.doabooks.org/rest",
    doabRequestTimeoutMs: Math.max(1_000, readNumber(env.DOAB_REQUEST_TIMEOUT_MS, 15_000)),
    rateLimitMaxRequests: Math.max(1, readNumber(env.RATE_LIMIT_MAX_REQUESTS, 120)),
    rateLimitWindowSeconds: Math.max(1, readNumber(env.RATE_LIMIT_WINDOW_SECONDS, 60)),
    maxRequestBodyBytes: Math.max(1_024, readNumber(env.MAX_REQUEST_BODY_BYTES, 100_000)),
    enableCache: readBoolean(env.ENABLE_CACHE, true),
    cacheDir: env.CACHE_DIR || ".cache/doab",
    cacheTtlSeconds: Math.max(0, readNumber(env.CACHE_TTL_SECONDS, 86_400)),
    enableMemoryCache: readBoolean(env.ENABLE_MEMORY_CACHE, true),
    memoryCacheMaxEntries: Math.max(1, readNumber(env.MEMORY_CACHE_MAX_ENTRIES, 200)),
    memoryCacheTtlSeconds: Math.max(1, readNumber(env.MEMORY_CACHE_TTL_SECONDS, 900)),
    maxResultsDefault: Math.min(requestedDefault, maxResultsLimit),
    maxResultsLimit,
    trustProxy: readBoolean(env.TRUST_PROXY, false),
    buildSha: env.BUILD_SHA?.trim().slice(0, 64) || "development",
    ...(deploymentBaseUrl ? { deploymentBaseUrl } : {})
  };
};
