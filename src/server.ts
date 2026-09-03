import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { ICON_PATH, ICON_SVG } from "./branding.js";
import { FileCacheStore } from "./cache/file-cache-store.js";
import { MemoryCacheStore } from "./cache/memory-cache-store.js";
import type { CacheStore } from "./cache/store.js";
import { loadConfig } from "./config.js";
import { DoabClient } from "./doab/client.js";
import { renderHomePage, renderPrivacyPage } from "./http/pages.js";
import { createRateLimiter } from "./http/rate-limit.js";
import { getClientKey, HttpRequestError, readJsonBody } from "./http/request.js";
import { applySecurityHeaders, writeJson } from "./http/responses.js";
import { PUBLIC_BASE_URL, SERVICE_DISPLAY_NAME, SERVICE_NAME, SERVICE_VERSION } from "./meta.js";
import { registerDiscoveryTools } from "./tools/register.js";

const SERVICE_SUMMARY =
  "Search DOAB-indexed open-access books and book chapters. Read-only discovery; no editorial review.";

// Injected into the model's context as guidance on how and when to use this server, distinct
// from `description` (a client-facing label shown in connector UIs).
const SERVICE_INSTRUCTIONS = [
  "Use these tools to discover DOAB-indexed open-access books and book chapters. DOAB metadata " +
    "is supplied by publishers, so these tools cannot verify peer review, licence terms, or " +
    "publisher legitimacy. Every result is a discovery candidate; tell the user to confirm it on " +
    "the DOAB record and the publisher's own page before relying on it.",
  "For topic matching, pass the full abstract or description as free text rather than a few " +
    "keywords — the tools tokenise, rank and progressively relax the query internally. Books and " +
    "chapters are separate record types: search_doab_books covers whole books, " +
    "search_doab_chapters the individual chapters. DOAB books have no ISSN, so identity lookups " +
    "go through get_doab_record_by_handle or get_doab_record_by_doi.",
  "Pass `language` and `publisher` as names " +
    '(e.g. "Turkish", "Brill"); ISO language codes are accepted and converted. Publisher country ' +
    "is not searchable in DOAB and only affects ranking, and `peerReviewedOnly` narrows to " +
    "records that declare a review process rather than to books that were actually reviewed."
].join("\n\n");

export const createMcpServer = (
  client: DoabClient,
  config: ReturnType<typeof loadConfig>
): McpServer => {
  // Clients render these next to the server in their connector list. The icon must be an
  // absolute URL because the client fetches it itself, not through this server's page.
  const iconSrc = new URL(ICON_PATH, config.deploymentBaseUrl ?? PUBLIC_BASE_URL).toString();
  const server = new McpServer(
    {
      name: SERVICE_NAME,
      title: SERVICE_DISPLAY_NAME,
      version: SERVICE_VERSION,
      description: SERVICE_SUMMARY,
      websiteUrl: config.deploymentBaseUrl ?? PUBLIC_BASE_URL,
      icons: [{ src: iconSrc, mimeType: "image/svg+xml", sizes: ["any"] }]
    },
    { instructions: SERVICE_INSTRUCTIONS }
  );
  registerDiscoveryTools(server, client, config);
  return server;
};

/**
 * A single tool call can walk several query-relaxation rungs before one returns results, each a
 * separate DOAB round trip. The file cache is disabled in production (a read-only container
 * filesystem), so an in-memory LRU is the fallback that still de-duplicates those rungs and any
 * repeated queries within a process's lifetime, without touching disk.
 */
const selectCache = (
  config: ReturnType<typeof loadConfig>
): { cache?: CacheStore; ttl: number } => {
  if (config.enableCache)
    return { cache: new FileCacheStore(config.cacheDir), ttl: config.cacheTtlSeconds };
  if (config.enableMemoryCache) {
    return {
      cache: new MemoryCacheStore({ maxEntries: config.memoryCacheMaxEntries }),
      ttl: config.memoryCacheTtlSeconds
    };
  }
  return { ttl: config.cacheTtlSeconds };
};

export const createHttpServer = (
  config = loadConfig(),
  suppliedClient?: DoabClient
): ReturnType<typeof createServer> => {
  const { cache, ttl } = selectCache(config);
  const client = suppliedClient ?? new DoabClient(config, cache, ttl);
  const rateLimiter = createRateLimiter({
    maxRequests: config.rateLimitMaxRequests,
    windowMs: config.rateLimitWindowSeconds * 1_000
  });

  return createServer(async (req, res) => {
    applySecurityHeaders(res);
    res.setHeader("cache-control", "no-store");

    try {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const forwardedProto = config.trustProxy
        ? String(req.headers["x-forwarded-proto"] ?? "")
            .split(",", 1)[0]
            ?.trim()
        : undefined;
      const protocol = forwardedProto === "https" ? "https" : "http";
      const baseUrl =
        config.deploymentBaseUrl ?? `${protocol}://${req.headers.host ?? "localhost"}`;

      if (req.method === "GET" && requestUrl.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderHomePage(baseUrl));
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === ICON_PATH) {
        // Static, versionless brand asset: override the global no-store so clients and the
        // connector UI can cache it instead of refetching on every page load.
        res.writeHead(200, {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=86400"
        });
        res.end(ICON_SVG);
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/privacy") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderPrivacyPage());
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/health") {
        writeJson(res, 200, {
          ok: true,
          name: SERVICE_NAME,
          version: SERVICE_VERSION,
          revision: config.buildSha,
          ranking: "lexical"
        });
        return;
      }

      if (requestUrl.pathname === "/mcp") {
        const allowedMethods = ["GET", "POST", "DELETE"];
        if (!req.method || !allowedMethods.includes(req.method)) {
          writeJson(
            res,
            405,
            { error: "method_not_allowed" },
            { allow: allowedMethods.join(", ") }
          );
          return;
        }

        const rate = rateLimiter.allow(getClientKey(req, config.trustProxy));
        if (!rate.allowed) {
          writeJson(
            res,
            429,
            { error: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds },
            { "retry-after": String(rate.retryAfterSeconds) }
          );
          return;
        }

        let parsedBody: unknown;
        if (req.method === "POST") {
          const contentType = String(req.headers["content-type"] ?? "")
            .split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          if (contentType !== "application/json") {
            writeJson(res, 415, { error: "unsupported_media_type" });
            return;
          }

          const contentLength = Number.parseInt(req.headers["content-length"] ?? "0", 10);
          if (Number.isFinite(contentLength) && contentLength > config.maxRequestBodyBytes) {
            writeJson(res, 413, { error: "request_too_large" });
            return;
          }
          parsedBody = await readJsonBody(req, config.maxRequestBodyBytes);
        }

        // SDK runtime uses an explicit undefined generator for stateless mode, but its optional
        // property type conflicts with this project's exactOptionalPropertyTypes setting.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
        const mcpServer = createMcpServer(client, config);
        try {
          await mcpServer.connect(transport as unknown as Transport);
          await transport.handleRequest(req, res, parsedBody);
        } finally {
          await mcpServer.close();
        }
        return;
      }

      writeJson(res, 404, { error: "not_found" });
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }

      if (error instanceof HttpRequestError) {
        writeJson(res, error.status, { error: error.code });
        return;
      }

      console.error("request_failed", {
        method: req.method ?? "UNKNOWN",
        path: req.url?.split("?", 1)[0] ?? "/",
        error: error instanceof Error ? error.name : "UnknownError"
      });
      writeJson(res, 500, { error: "internal_error" });
    }
  });
};

export const startServer = (): void => {
  const config = loadConfig();
  const httpServer = createHttpServer(config);

  httpServer.listen(config.port, () => {
    console.log(`DOAB Discovery MCP listening on :${config.port}`);
  });
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
