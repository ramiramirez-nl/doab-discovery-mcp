export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowState {
  startedAt: number;
  count: number;
}

export interface RateLimiter {
  allow(key: string): RateLimitResult;
  size(): number;
}

export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxKeys = Math.max(1, Math.floor(options.maxKeys ?? 10_000));
  const now = options.now ?? Date.now;
  const windows = new Map<string, WindowState>();

  const prune = (timestamp: number): void => {
    for (const [key, state] of windows) {
      if (timestamp - state.startedAt >= windowMs) windows.delete(key);
    }
  };

  return {
    allow(key) {
      const timestamp = now();
      prune(timestamp);
      const boundedKey = key.slice(0, 256) || "unknown";
      let state = windows.get(boundedKey);

      if (!state && windows.size >= maxKeys) {
        // Evict the least-recently-started window rather than the first-inserted key, so a
        // burst of new keys cannot push out clients that are actively being rate limited.
        let lruKey: string | undefined;
        let lruStartedAt = Number.POSITIVE_INFINITY;
        for (const [candidateKey, candidateState] of windows) {
          if (candidateState.startedAt < lruStartedAt) {
            lruStartedAt = candidateState.startedAt;
            lruKey = candidateKey;
          }
        }
        if (lruKey) windows.delete(lruKey);
      }

      if (!state || timestamp - state.startedAt >= windowMs) {
        state = { startedAt: timestamp, count: 0 };
        windows.set(boundedKey, state);
      }

      if (state.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((windowMs - (timestamp - state.startedAt)) / 1_000)
          )
        };
      }

      state.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size: () => {
      prune(now());
      return windows.size;
    }
  };
};
