import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import { getClientKey, readJsonBody } from "../src/http/request.js";

describe("HTTP request helpers", () => {
  test("uses the Cloud Run verified client address when proxy trust is enabled", () => {
    const request = {
      headers: { "x-forwarded-for": "198.51.100.8, 203.0.113.7, 10.0.0.1" },
      socket: { remoteAddress: "127.0.0.1" }
    } as unknown as IncomingMessage;

    expect(getClientKey(request, true)).toBe("203.0.113.7");
    expect(getClientKey(request, false)).toBe("127.0.0.1");
  });

  test("ignores an incomplete forwarded chain", () => {
    const request = {
      headers: { "x-forwarded-for": "198.51.100.8" },
      socket: { remoteAddress: "127.0.0.1" }
    } as unknown as IncomingMessage;

    expect(getClientKey(request, true)).toBe("127.0.0.1");
  });

  test("parses a bounded JSON body", async () => {
    const request = Readable.from(['{"ok":', "true}"]) as unknown as IncomingMessage;

    await expect(readJsonBody(request, 100)).resolves.toEqual({ ok: true });
  });

  test("maps malformed JSON to a public request error", async () => {
    const request = Readable.from(["{"]) as unknown as IncomingMessage;

    await expect(readJsonBody(request, 100)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json"
    });
  });

  test("rejects streamed bodies beyond the byte limit", async () => {
    const request = Readable.from([
      Buffer.from('{"value":"'),
      Buffer.from("x".repeat(100)),
      Buffer.from('"}')
    ]) as unknown as IncomingMessage;

    await expect(readJsonBody(request, 32)).rejects.toMatchObject({
      status: 413,
      code: "request_too_large"
    });
  });
});
