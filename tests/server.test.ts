import { afterEach, describe, expect, test } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { loadConfig } from "../src/config.js";
import { createHttpServer } from "../src/server.js";

const servers: Server[] = [];

const startTestServer = async (env: NodeJS.ProcessEnv = {}): Promise<string> => {
  const server = createHttpServer(loadConfig({ ENABLE_CACHE: "false", ...env }));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("public HTTP routes", () => {
  test("renders setup page with public MCP URL and independence notice", async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("DOAB Discovery MCP");
    expect(body).toContain(`${baseUrl}/mcp`);
    expect(body).toContain("Public beta");
    expect(body).toContain("No account, API key, or payment");
    expect(body).toContain("Paste this URL");
    expect(body).toContain("Do not send confidential manuscript text");
    expect(body).toContain("Verify results on the DOAB record and the publisher");
    expect(body).toContain(
      "not affiliated with, endorsed by, sponsored by, or operated by DOAB or OAPEN"
    );
  });

  test("serves the brand icon as cacheable SVG and links it as the favicon", async () => {
    const baseUrl = await startTestServer();

    const page = await (await fetch(`${baseUrl}/`)).text();
    expect(page).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg">');

    const response = await fetch(`${baseUrl}/icon.svg`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    // The global no-store must be overridden for this static asset.
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(body).toContain("<svg");
    expect(body).toContain("#0F7B8A");
  });

  test("allows images in the content security policy so the favicon is not blocked", async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/`);
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain("default-src 'none'");
  });

  test("renders privacy statement without external assets", async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/privacy`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Privacy");
    expect(body).toContain("not intentionally persisted in application logs");
    expect(body).toContain("The hosting provider and DOAB process");
    expect(body).toContain("https://github.com/ramiramirez-nl/doab-discovery-mcp/issues");
    expect(body).not.toContain("<script src=");
  });

  test("returns health status and rejects unknown routes", async () => {
    const baseUrl = await startTestServer({ BUILD_SHA: "test-revision" });

    const health = await fetch(`${baseUrl}/health`);
    const missing = await fetch(`${baseUrl}/missing`);

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      name: "doab-discovery-mcp",
      revision: "test-revision"
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });

  test("adds compact security headers to every public response", async () => {
    const response = await fetch(`${await startTestServer()}/`);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});

describe("stateless MCP transport", () => {
  test("initializes without issuing a session ID", async () => {
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    const dataLine = (await response.text()).split("\n").find((line) => line.startsWith("data: "));
    expect(dataLine).toBeDefined();
    expect(JSON.parse(dataLine!.slice("data: ".length)).result.serverInfo.name).toBe(
      "doab-discovery-mcp"
    );
  });

  test("limits public MCP bursts and returns retry information", async () => {
    const server = createHttpServer(
      loadConfig({
        ENABLE_CACHE: "false",
        RATE_LIMIT_MAX_REQUESTS: "1",
        RATE_LIMIT_WINDOW_SECONDS: "60"
      })
    );
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const request = {
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    };

    const send = () =>
      fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...request })
      });

    expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 60 });
  });

  test("rejects unsupported MCP content types before SDK handling", async () => {
    const response = await fetch(`${await startTestServer()}/mcp`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}"
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
  });

  test("rejects MCP bodies beyond the configured limit", async () => {
    const baseUrl = await startTestServer({ MAX_REQUEST_BODY_BYTES: "1024" });
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({ value: "x".repeat(2_000) })
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
  });

  test("rejects unsupported MCP methods", async () => {
    const response = await fetch(`${await startTestServer()}/mcp`, { method: "PUT" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, DELETE");
  });

  test("survives malformed MCP JSON", async () => {
    const baseUrl = await startTestServer();
    const malformed = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    const health = await fetch(`${baseUrl}/health`);

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "invalid_json" });
    expect(health.status).toBe(200);
  });
});
