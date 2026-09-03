import { describe, expect, test } from "vitest";

import { createRateLimiter } from "../src/http/rate-limit.js";

describe("rate limiter", () => {
  test("allows a burst, then returns retry information", () => {
    let now = 1_000;
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 10_000, now: () => now });

    expect(limiter.allow("client")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.allow("client")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.allow("client")).toEqual({ allowed: false, retryAfterSeconds: 10 });

    now += 10_001;
    expect(limiter.allow("client")).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  test("bounds keys and removes stale entries", () => {
    let now = 0;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      maxKeys: 2,
      now: () => now
    });

    limiter.allow("a".repeat(10_000));
    limiter.allow("b");
    limiter.allow("c");
    now += 2_000;

    expect(limiter.size()).toBe(0);
  });
});
