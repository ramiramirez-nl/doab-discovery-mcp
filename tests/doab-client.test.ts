import { afterEach, describe, expect, test, vi } from "vitest";

import { MemoryCacheStore } from "../src/cache/memory-cache-store.js";
import { loadConfig } from "../src/config.js";
import { DoabClient } from "../src/doab/client.js";

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers }
  });

const client = () =>
  new DoabClient(loadConfig({ ENABLE_CACHE: "false", ENABLE_MEMORY_CACHE: "false" }));

describe("DoabClient public requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("issues public JSON requests without an authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await client().search("syriac", { pageSize: 1 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/rest/search");
    expect(url.searchParams.get("expand")).toBe("metadata");
    expect(options.headers).toEqual({ accept: "application/json" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test("clamps the page size so expand=metadata payloads stay bounded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await client().search("history", { pageSize: 500 });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.searchParams.get("limit")).toBe("100");
  });

  test("reads the hit count from the X-Total-Count header, not the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse([{ uuid: "a", name: "A" }], { "x-total-count": "32833" }))
    );

    const result = await client().search("syriac");

    expect(result.total).toBe(32833);
    expect(result.records).toHaveLength(1);
  });

  test("wraps a single-item lookup response into a record list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ uuid: "a", name: "A" })));

    const result = await client().getByHandle("20.500.12854/32785");

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.title).toBe("A");
  });

  test("strips a pasted DOAB URL down to the bare handle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await client().getByHandle("https://directory.doabooks.org/handle/20.500.12854/32785");

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/rest/handle/20.500.12854/32785");
  });

  test("retries a 429 and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client().search("history");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual([]);
  });

  test("reports a persistent 429 once, after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client().search("history");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.warnings).toEqual(["DOAB rate limit reached."]);
    expect(result.records).toEqual([]);
  });

  /**
   * DSpace answers an unknown handle with a 500, so a lookup must report "not found" instead of
   * spending three attempts treating a typo as an outage.
   */
  test("treats a 500 on a direct lookup as not-found without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client().getByHandle("20.500.12854/999999999");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.records).toEqual([]);
    expect(result.warnings[0]).toContain("No DOAB record matched that identifier");
  });

  test("still retries a 500 on a search, where it means an upstream fault", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client().search("history");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.warnings).toEqual(["DOAB API returned HTTP 500."]);
  });

  test("rejects a non-JSON response instead of parsing an error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>error</html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        })
      )
    );

    const result = await client().search("history");

    expect(result.records).toEqual([]);
    expect(result.warnings).toEqual(["DOAB returned an invalid response. Try again later."]);
  });

  test("serves a repeated identical query from the cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ uuid: "a", name: "A" }]));
    vi.stubGlobal("fetch", fetchMock);

    const withCache = new DoabClient(
      loadConfig({ ENABLE_CACHE: "false" }),
      new MemoryCacheStore({ maxEntries: 10 }),
      60
    );

    await withCache.search("syriac");
    await withCache.search("syriac");

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
