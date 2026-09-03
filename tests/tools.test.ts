import { describe, expect, test, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { DoabClient } from "../src/doab/client.js";
import { createMcpServer } from "../src/server.js";
import { explainDoabMetadata } from "../src/tools/explain.js";
import { countryFilterWarning, semanticFallbackWarning } from "../src/tools/register.js";

const EXPECTED_TOOL_COUNT = 8;

const config = () => loadConfig({ ENABLE_CACHE: "false" });

const registeredTools = <T>(): Record<string, T> => {
  const cfg = config();
  const server = createMcpServer(new DoabClient(cfg), cfg);
  return (server as unknown as { _registeredTools: Record<string, T> })._registeredTools;
};

describe("tool helpers", () => {
  test("explains DOAB-specific metadata without implying editorial review", () => {
    const explanation = explainDoabMetadata("peer review");

    expect(explanation).toContain("publisher-supplied");
    expect(explanation).toContain("declared process");
  });

  test("explains the handle, since DOAB books have no ISSN", () => {
    expect(explainDoabMetadata("handle")).toContain("20.500.12854");
  });

  test("falls back to a general explanation for an unknown term", () => {
    expect(explainDoabMetadata("sprocket")).toContain("discovery only");
  });

  test("names DOAB, not DOAJ, in the lexical fallback warning", () => {
    expect(semanticFallbackWarning()).toContain("DOAB metadata");
  });

  test("warns that publisher country cannot be used as a filter", () => {
    expect(countryFilterWarning("Turkey")).toContain("ranking only");
  });
});

describe("server registration", () => {
  test("advertises branding metadata to clients in serverInfo", () => {
    const cfg = loadConfig({ ENABLE_CACHE: "false", DEPLOYMENT_BASE_URL: "https://example.test" });
    const server = createMcpServer(new DoabClient(cfg), cfg);
    const info = (
      server.server as unknown as {
        _serverInfo: {
          title?: string;
          description?: string;
          websiteUrl?: string;
          icons?: Array<{ src: string; mimeType?: string }>;
        };
      }
    )._serverInfo;

    expect(info.title).toBe("DOAB Discovery MCP");
    expect(info.description).toContain("DOAB");
    expect(info.websiteUrl).toBe("https://example.test");
    // Clients fetch the icon themselves, so it must be absolute, not a bare path.
    expect(info.icons?.[0]?.src).toBe("https://example.test/icon.svg");
    expect(info.icons?.[0]?.mimeType).toBe("image/svg+xml");
  });

  test("tells the model the things DOAB metadata cannot prove", () => {
    const cfg = config();
    const server = createMcpServer(new DoabClient(cfg), cfg);
    const instructions = (server.server as unknown as { _instructions?: string })._instructions;

    expect(instructions).toContain("publisher");
    expect(instructions).toContain("confirm");
    expect(instructions).toContain("get_doab_record_by_handle");
  });

  test("gives every input-schema field a non-empty description", () => {
    const tools = registeredTools<{
      inputSchema?: { shape: Record<string, { description?: string }> };
    }>();

    for (const [toolName, tool] of Object.entries(tools)) {
      for (const [field, schema] of Object.entries(tool.inputSchema?.shape ?? {})) {
        expect(schema.description, `${toolName}.${field} has no description`).toBeTruthy();
        expect(
          schema.description!.length,
          `${toolName}.${field} description is too short to be useful`
        ).toBeGreaterThan(10);
      }
    }
  });

  test("marks every tool as read-only", () => {
    const tools = registeredTools<{ annotations?: Record<string, boolean> }>();

    expect(Object.keys(tools)).toHaveLength(EXPECTED_TOOL_COUNT);
    for (const tool of Object.values(tools)) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      });
    }
  });
});

describe("tool handlers end-to-end (stubbed DOAB API)", () => {
  const item = (overrides: Record<string, unknown> = {}) => ({
    uuid: "6672a1eb-f21b-44ce-a31d-53280c182995",
    name: "The Syriac World",
    handle: "20.500.12854/32785",
    metadata: [
      { key: "dc.title", value: "The Syriac World" },
      { key: "dc.type", value: "book" },
      { key: "dc.language", value: "English" },
      { key: "dc.date.issued", value: "2019" },
      { key: "publisher.name", value: "Taylor & Francis" },
      { key: "publisher.country", value: "United Kingdom" },
      { key: "oapen.identifier.doi", value: "10.4324/9781315708195" }
    ],
    ...overrides
  });

  const jsonResponse = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json", "x-total-count": "1" }
    });

  const handlers = (fetchImpl: (url: URL) => Promise<Response>) => {
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    return registeredTools<{ handler: (input: unknown) => Promise<unknown> }>();
  };

  const bodyOf = async (
    tool: { handler: (input: unknown) => Promise<unknown> },
    input: unknown
  ) => {
    const response = (await tool.handler(input)) as { content: Array<{ text: string }> };
    return JSON.parse(response.content[0]!.text);
  };

  test("search_doab_books scopes the query to whole books", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([item()]);
    });

    const body = await bodyOf(tools.search_doab_books!, {
      query: "Syriac manuscripts",
      limit: 5,
      strict: false,
      peerReviewedOnly: false
    });

    expect(captured!.searchParams.get("query")).toContain('dc.type:"book"');
    expect(body.results[0].record.title).toBe("The Syriac World");
    expect(body.total).toBe(1);
    vi.unstubAllGlobals();
  });

  test("search_doab_chapters scopes the query to chapters", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([]);
    });

    await bodyOf(tools.search_doab_chapters!, {
      query: "scribal practices",
      limit: 5,
      strict: false
    });

    expect(captured!.searchParams.get("query")).toContain('dc.type:"chapter"');
    vi.unstubAllGlobals();
  });

  test("search_doab_books converts an ISO language code to the name DOAB indexes", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([]);
    });

    await bodyOf(tools.search_doab_books!, {
      query: "kitap",
      limit: 5,
      strict: false,
      peerReviewedOnly: false,
      language: "tr"
    });

    expect(captured!.searchParams.get("query")).toContain('dc.language:"Turkish"');
    vi.unstubAllGlobals();
  });

  test("search_doab_books warns instead of filtering on an unknown language", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([]);
    });

    const body = await bodyOf(tools.search_doab_books!, {
      query: "manuscripts",
      limit: 5,
      strict: false,
      peerReviewedOnly: false,
      language: "Klingon"
    });

    expect(captured!.searchParams.get("query")).not.toContain("dc.language");
    expect(body.warnings.join(" ")).toContain("Could not resolve language");
    vi.unstubAllGlobals();
  });

  test("recommend_doab_books_for_topic says publisher country only affects ranking", async () => {
    const tools = handlers(async () => jsonResponse([item()]));

    const body = await bodyOf(tools.recommend_doab_books_for_topic!, {
      abstract:
        "This study examines the transmission of Syriac liturgical manuscripts in the Ottoman period, focusing on scribal practices in Tur Abdin monasteries.",
      limit: 5,
      includeChapters: false,
      preferredCountry: "Turkey"
    });

    expect(body.warnings.join(" ")).toContain("ranking only");
    expect(body.results).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  test("find_doab_books_by_publisher searches a publisher's whole list without a topic", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([item()]);
    });

    await bodyOf(tools.find_doab_books_by_publisher!, { publisher: "Brill", limit: 5 });

    const query = captured!.searchParams.get("query")!;
    expect(query).toContain('publisher:"Brill"');
    expect(query).toContain('dc.type:"book"');
    // With no topic there is no free-text clause to AND against.
    expect(query.startsWith("(")).toBe(false);
    vi.unstubAllGlobals();
  });

  test("find_similar_doab_books reports that ranking is lexical, not semantic", async () => {
    const tools = handlers(async () => jsonResponse([item()]));

    const body = await bodyOf(tools.find_similar_doab_books!, {
      abstract: "Scribal networks and manuscript patronage in Ottoman monastic centres.",
      limit: 5
    });

    expect(body.warnings).toContain(semanticFallbackWarning());
    vi.unstubAllGlobals();
  });

  test("get_doab_record_by_doi strips a doi.org prefix before querying", async () => {
    let captured: URL | undefined;
    const tools = handlers(async (url) => {
      captured = url;
      return jsonResponse([item()]);
    });

    await bodyOf(tools.get_doab_record_by_doi!, {
      doi: "https://doi.org/10.4324/9781315708195"
    });

    const query = captured!.searchParams.get("query")!;
    expect(query).toBe('oapen.identifier.doi:"10.4324/9781315708195"');
    vi.unstubAllGlobals();
  });

  test("get_doab_record_by_handle accepts a handle, a URL, and a UUID", async () => {
    const seen: string[] = [];
    const tools = handlers(async (url) => {
      seen.push(url.pathname);
      return jsonResponse(item());
    });

    await bodyOf(tools.get_doab_record_by_handle!, { handle: "20.500.12854/32785" });
    await bodyOf(tools.get_doab_record_by_handle!, {
      handle: "https://directory.doabooks.org/handle/20.500.12854/32785"
    });
    await bodyOf(tools.get_doab_record_by_handle!, {
      handle: "6672a1eb-f21b-44ce-a31d-53280c182995"
    });

    expect(seen[0]).toBe("/rest/handle/20.500.12854/32785");
    expect(seen[1]).toBe("/rest/handle/20.500.12854/32785");
    expect(seen[2]).toBe("/rest/items/6672a1eb-f21b-44ce-a31d-53280c182995");
    vi.unstubAllGlobals();
  });

  test("get_doab_record_by_handle refuses unparseable input without calling DOAB", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tools = registeredTools<{ handler: (input: unknown) => Promise<unknown> }>();

    const body = await bodyOf(tools.get_doab_record_by_handle!, { handle: "not an identifier" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.results).toEqual([]);
    expect(body.warnings.join(" ")).toContain("Could not read a DOAB handle");
    vi.unstubAllGlobals();
  });

  test("explain_doab_metadata answers locally, with no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tools = registeredTools<{ handler: (input: unknown) => Promise<unknown> }>();

    const body = await bodyOf(tools.explain_doab_metadata!, { term: "Thema" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.explanation).toContain("classification");
    vi.unstubAllGlobals();
  });
});
