import { createCacheKey } from "../cache/keys.js";
import type { CacheStore } from "../cache/store.js";
import type { AppConfig, DoabSearchResult, NormalizedBook } from "../types.js";
import { extractResults, normalizeBook } from "./normalize.js";

/** DSpace accepts larger values, but a bigger page multiplies `expand=metadata` payload size. */
const MAX_PAGE_SIZE = 100;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 300;

export interface SearchOptions {
  offset?: number;
  pageSize?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : undefined;
};

/**
 * DSpace reports the hit count in the `X-Total-Count` response header, not in the JSON body,
 * which is an array of items with no envelope.
 */
const parseTotal = (response: Response): number | undefined => {
  const raw = response.headers.get("x-total-count");
  if (!raw) return undefined;
  const total = Number.parseInt(raw, 10);
  return Number.isFinite(total) ? total : undefined;
};

interface FetchOutcome {
  records?: unknown[];
  total?: number;
  warnings: string[];
}

export class DoabClient {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly config: AppConfig,
    private readonly cache?: CacheStore,
    cacheTtlSecondsOverride?: number
  ) {
    this.cacheTtlSeconds = cacheTtlSecondsOverride ?? config.cacheTtlSeconds;
  }

  private get baseUrl(): string {
    return this.config.doabApiBaseUrl.replace(/\/$/, "");
  }

  search(query: string, options: SearchOptions = {}): Promise<DoabSearchResult<NormalizedBook>> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("expand", "metadata");
    url.searchParams.set(
      "limit",
      String(Math.min(options.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE))
    );
    if (options.offset) url.searchParams.set("offset", String(options.offset));
    return this.request(url);
  }

  /** Direct lookup by DSpace handle, e.g. "20.500.12854/32785". */
  getByHandle(handle: string): Promise<DoabSearchResult<NormalizedBook>> {
    const clean = handle.trim().replace(/^https?:\/\/[^/]+\/handle\//i, "");
    const url = new URL(`${this.baseUrl}/handle/${clean}`);
    url.searchParams.set("expand", "metadata");
    return this.request(url, true);
  }

  /** Direct lookup by DSpace item UUID. */
  getByUuid(uuid: string): Promise<DoabSearchResult<NormalizedBook>> {
    const url = new URL(`${this.baseUrl}/items/${encodeURIComponent(uuid.trim())}`);
    url.searchParams.set("expand", "metadata");
    return this.request(url, true);
  }

  private async request(url: URL, isLookup = false): Promise<DoabSearchResult<NormalizedBook>> {
    const key = createCacheKey("doab-api", url.toString());
    if (this.cache) {
      try {
        const cached = await this.cache.get<DoabSearchResult<NormalizedBook>>(key);
        if (cached) return cached.payload;
      } catch {
        // Cache availability must not affect discovery.
      }
    }

    const outcome = await this.fetchWithRetry(url, isLookup);
    if (outcome.records === undefined) return { records: [], warnings: outcome.warnings };

    const result: DoabSearchResult<NormalizedBook> = {
      records: outcome.records.map(normalizeBook),
      warnings: outcome.warnings
    };
    if (outcome.total !== undefined) result.total = outcome.total;

    if (this.cache) {
      try {
        await this.cache.set(key, result, {
          ttlSeconds: this.cacheTtlSeconds,
          source: "doab-api",
          payloadVersion: 1
        });
      } catch {
        // Cache availability must not affect discovery.
      }
    }
    return result;
  }

  private async fetchWithRetry(url: URL, isLookup = false): Promise<FetchOutcome> {
    let lastWarnings: string[] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.config.doabRequestTimeoutMs)
        });
      } catch (error) {
        lastWarnings = [
          error instanceof Error && error.name === "TimeoutError"
            ? "DOAB request timed out. Try again later."
            : "DOAB request failed. Try again later."
        ];
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 100);
          continue;
        }
        return { warnings: lastWarnings };
      }

      // A handle or UUID that does not exist is a normal negative answer, not an outage.
      if (response.status === 404) return { records: [], warnings: [] };

      // DSpace answers an unknown handle with a 500 rather than a 404, so on a direct lookup an
      // upstream error is reported as "no such record" instead of being retried as an outage.
      if (isLookup && response.status >= 500) {
        return {
          records: [],
          warnings: ["No DOAB record matched that identifier, or DOAB rejected its format."]
        };
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");
        lastWarnings = [
          response.status === 429
            ? `DOAB rate limit reached.${retryAfter ? ` Retry after ${retryAfter} seconds.` : ""}`
            : `DOAB API returned HTTP ${response.status}.`
        ];
        if (attempt < MAX_RETRIES) {
          await sleep(
            parseRetryAfterMs(retryAfter) ?? BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 100
          );
          continue;
        }
        return { warnings: lastWarnings };
      }

      if (!response.ok) return { warnings: [`DOAB API returned HTTP ${response.status}.`] };

      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.toLowerCase().includes("application/json")) {
        return { warnings: ["DOAB returned an invalid response. Try again later."] };
      }

      let payload: unknown;
      try {
        payload = (await response.json()) as unknown;
      } catch {
        return { warnings: ["DOAB returned an invalid response. Try again later."] };
      }

      const total = parseTotal(response);
      return {
        records: extractResults(payload),
        ...(total !== undefined ? { total } : {}),
        warnings: []
      };
    }

    return { warnings: lastWarnings };
  }
}
