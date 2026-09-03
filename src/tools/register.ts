import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { DoabClient } from "../doab/client.js";
import { DOAB_FIELDS } from "../doab/fields.js";
import { searchableFromBook } from "../doab/normalize.js";
import {
  buildFilterClauses,
  buildQueryLadder,
  composeQuery,
  escapeQuotedValue,
  stripLuceneSyntax
} from "../doab/query.js";
import { canonicalLanguageName } from "../doab/vocab.js";
import { analyzeQueryPreferences } from "../query/preferences.js";
import { rankRecords } from "../search/rank.js";
import type { AppConfig, DoabSearchResult, NormalizedBook } from "../types.js";
import { explainDoabMetadata } from "./explain.js";

const discoveryWarning =
  "Discovery-only tool. DOAB metadata is publisher-supplied; this server does not verify peer review, licence terms, or publisher legitimacy. Treat every result as a candidate and confirm it on the DOAB record and the publisher's own page.";

export const semanticFallbackWarning = (): string =>
  "Local vector semantic search is not enabled. Results are ranked by lexical relevance, synonym expansion, and DOAB metadata.";

export const relaxedMatchWarning = (): string =>
  "No results matched all key terms together, so the query was broadened to match any of them. These results may be only loosely related to the topic.";

export const countryFilterWarning = (country: string): string =>
  `DOAB does not index publisher country as a searchable field, so "${country}" was used for ranking only, not filtering.`;

const doabReadOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

const localReadOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const limitSchema = (config: AppConfig) =>
  z
    .number()
    .int()
    .positive()
    .max(config.maxResultsLimit)
    .optional()
    .default(config.maxResultsDefault);

/** Candidate pool fetched before local ranking; must exceed `limit` or ranking has nothing to sort. */
const candidatePoolSize = (limit: number): number => Math.min(100, Math.max(25, limit * 5));

const format = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }]
});

/**
 * Runs the relaxation rungs and returns the first that yields records, so a precise AND result is
 * always preferred over broad OR recall. Stops early on an upstream warning to avoid hammering
 * DOAB while it is rate limiting or down. When only the broadest rung produced anything, the
 * caller is told the match was loose rather than being handed weak results that look confident.
 */
const searchWithRelaxation = async (
  queries: string[],
  search: (query: string) => Promise<DoabSearchResult<NormalizedBook>>
): Promise<{ result: DoabSearchResult<NormalizedBook>; query: string; relaxed: boolean }> => {
  let last:
    { result: DoabSearchResult<NormalizedBook>; query: string; relaxed: boolean } | undefined;
  for (const [index, query] of queries.entries()) {
    const result = await search(query);
    const relaxed = queries.length > 1 && index === queries.length - 1;
    last = { result, query, relaxed };
    if (result.records.length > 0 || result.warnings.length > 0) return last;
  }
  return last ?? { result: { records: [], warnings: [] }, query: queries[0] ?? "", relaxed: false };
};

const resolveLanguage = (language: string | undefined, warnings: string[]): string | undefined => {
  if (!language) return undefined;
  const canonical = canonicalLanguageName(language);
  if (!canonical) {
    warnings.push(
      `Could not resolve language "${language}" to a DOAB language name; it was used for ranking only, not filtering.`
    );
  }
  return canonical;
};

const yearSchema = z.number().int().min(1000).max(2999);

export const registerDiscoveryTools = (
  server: McpServer,
  client: DoabClient,
  config: AppConfig
): void => {
  const queryInput = z
    .string()
    .min(2)
    .max(4_000)
    .describe(
      'Search text: a topic, keywords, or a short phrase (e.g. "Ottoman provincial administration"). ' +
        "Longer text is automatically broadened if a narrow match returns nothing."
    );

  const limitInput = limitSchema(config).describe(
    `Maximum number of results to return (1-${config.maxResultsLimit}). Defaults to ${config.maxResultsDefault}.`
  );

  const strictInput = z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, require every query term to match (AND) instead of relaxing to a broader OR match " +
        "when the strict search returns nothing. Use for a well-defined, narrow query."
    );

  const sharedFilters = {
    publisher: z
      .string()
      .max(200)
      .optional()
      .describe('Publisher name to narrow to, e.g. "Brill" or "De Gruyter".'),
    language: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Publication language as a name, e.g. "English" or "Turkish". ISO codes are accepted and converted.'
      ),
    yearFrom: yearSchema.optional().describe("Earliest publication year, inclusive."),
    yearTo: yearSchema.optional().describe("Latest publication year, inclusive.")
  };

  /** Shared search body for the book and chapter tools, which differ only in `dc.type`. */
  const runTypedSearch = async (
    type: "book" | "chapter",
    input: {
      query: string;
      limit: number;
      strict: boolean;
      publisher?: string | undefined;
      language?: string | undefined;
      yearFrom?: number | undefined;
      yearTo?: number | undefined;
      peerReviewedOnly?: boolean | undefined;
    }
  ) => {
    const cleanQuery = stripLuceneSyntax(input.query);
    const preferences = analyzeQueryPreferences(input.query);
    if (input.language) preferences.preferredLanguages.unshift(input.language);

    const resolutionWarnings: string[] = [];
    const language = resolveLanguage(input.language, resolutionWarnings);

    const filters = buildFilterClauses({
      type,
      ...(language ? { language } : {}),
      ...(input.publisher ? { publisher: stripLuceneSyntax(input.publisher) } : {}),
      ...(input.yearFrom !== undefined ? { yearFrom: input.yearFrom } : {}),
      ...(input.yearTo !== undefined ? { yearTo: input.yearTo } : {}),
      ...(input.peerReviewedOnly ? { peerReviewedOnly: true } : {})
    });

    const ladder = buildQueryLadder(cleanQuery, {
      ...(input.strict ? { mode: "precise" as const } : {})
    }).map((freeText) => composeQuery(freeText, filters));

    const pool = candidatePoolSize(input.limit);
    const {
      result,
      query: effectiveQuery,
      relaxed
    } = await searchWithRelaxation(ladder, (query) => client.search(query, { pageSize: pool }));

    const ranked = rankRecords(input.query, result.records, searchableFromBook, preferences).slice(
      0,
      input.limit
    );

    return format({
      warning: discoveryWarning,
      warnings: [
        ...resolutionWarnings,
        ...(relaxed ? [relaxedMatchWarning()] : []),
        ...result.warnings
      ],
      query: effectiveQuery,
      total: result.total,
      returned: ranked.length,
      results: ranked
    });
  };

  server.registerTool(
    "search_doab_books",
    {
      title: "Search DOAB books",
      description:
        "Find open-access books indexed in DOAB by topic, with publisher, language, year and peer-review filters.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        query: queryInput,
        limit: limitInput,
        strict: strictInput,
        ...sharedFilters,
        peerReviewedOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, return only records that carry structured peer-review metadata. Absence of " +
              "that metadata does not mean a book was not reviewed; many publishers simply do not supply it."
          )
      }
    },
    async (input) => runTypedSearch("book", input)
  );

  server.registerTool(
    "search_doab_chapters",
    {
      title: "Search DOAB book chapters",
      description:
        "Find individual open-access book chapters indexed in DOAB, which often carry their own DOI and abstract.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: { query: queryInput, limit: limitInput, strict: strictInput, ...sharedFilters }
    },
    async (input) => runTypedSearch("chapter", input)
  );

  server.registerTool(
    "recommend_doab_books_for_topic",
    {
      title: "Recommend DOAB books for a research topic",
      description:
        "Suggest open-access book candidates for a research abstract, chapter draft, or topic description.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        abstract: z
          .string()
          .min(20)
          .max(12_000)
          .describe(
            "The abstract, chapter summary, or topic description. Pass the full text, not keywords."
          ),
        title: z
          .string()
          .max(500)
          .optional()
          .describe("A working title, if available. Improves matching."),
        limit: limitInput,
        preferredLanguage: z
          .string()
          .max(100)
          .optional()
          .describe('Preferred publication language as a name, e.g. "English".'),
        preferredCountry: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Preferred publisher country as a name, e.g. "Turkey". DOAB cannot filter by country, ' +
              "so this only affects ranking."
          ),
        includeChapters: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, include individual chapters alongside whole books.")
      }
    },
    async (input) => {
      const query = [input.title, input.abstract].filter(Boolean).join(" ");
      const cleanQuery = stripLuceneSyntax(query);
      const preferences = analyzeQueryPreferences(query);
      if (input.preferredLanguage) preferences.preferredLanguages.unshift(input.preferredLanguage);
      if (input.preferredCountry) preferences.preferredCountries.unshift(input.preferredCountry);

      const resolutionWarnings: string[] = [];
      const language = resolveLanguage(input.preferredLanguage, resolutionWarnings);
      if (input.preferredCountry)
        resolutionWarnings.push(countryFilterWarning(input.preferredCountry));

      const filters = buildFilterClauses({
        ...(input.includeChapters ? {} : { type: "book" }),
        ...(language ? { language } : {})
      });
      const ladder = buildQueryLadder(cleanQuery).map((freeText) =>
        composeQuery(freeText, filters)
      );

      const pool = candidatePoolSize(input.limit);
      const {
        result,
        query: effectiveQuery,
        relaxed
      } = await searchWithRelaxation(ladder, (rung) => client.search(rung, { pageSize: pool }));
      const ranked = rankRecords(query, result.records, searchableFromBook, preferences).slice(
        0,
        input.limit
      );

      return format({
        warning: `${discoveryWarning} These are topical discovery candidates, not a reading list vetted for quality or relevance.`,
        warnings: [
          ...resolutionWarnings,
          ...(relaxed ? [relaxedMatchWarning()] : []),
          ...result.warnings
        ],
        query: effectiveQuery,
        total: result.total,
        returned: ranked.length,
        results: ranked
      });
    }
  );

  server.registerTool(
    "find_doab_books_by_publisher",
    {
      title: "Find DOAB books by publisher",
      description: "List a publisher's open-access books in DOAB, optionally narrowed by topic.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        publisher: z
          .string()
          .min(2)
          .max(200)
          .describe('Publisher name, e.g. "Brill", "De Gruyter", "Taylor & Francis".'),
        query: z
          .string()
          .max(4_000)
          .optional()
          .describe("Optional topic to narrow the publisher's list."),
        limit: limitInput,
        yearFrom: yearSchema.optional().describe("Earliest publication year, inclusive."),
        yearTo: yearSchema.optional().describe("Latest publication year, inclusive.")
      }
    },
    async (input) => {
      const publisher = stripLuceneSyntax(input.publisher);
      const filters = buildFilterClauses({
        type: "book",
        publisher,
        ...(input.yearFrom !== undefined ? { yearFrom: input.yearFrom } : {}),
        ...(input.yearTo !== undefined ? { yearTo: input.yearTo } : {})
      });

      const topic = input.query ? stripLuceneSyntax(input.query) : "";
      const ladder = (topic ? buildQueryLadder(topic) : ["*:*"]).map((freeText) =>
        composeQuery(freeText, filters)
      );

      const pool = candidatePoolSize(input.limit);
      const {
        result,
        query: effectiveQuery,
        relaxed
      } = await searchWithRelaxation(ladder, (query) => client.search(query, { pageSize: pool }));
      const ranked = rankRecords(
        topic || publisher,
        result.records,
        searchableFromBook,
        analyzeQueryPreferences(topic || publisher)
      ).slice(0, input.limit);

      return format({
        warning: discoveryWarning,
        warnings: [...(relaxed ? [relaxedMatchWarning()] : []), ...result.warnings],
        query: effectiveQuery,
        total: result.total,
        returned: ranked.length,
        results: ranked
      });
    }
  );

  server.registerTool(
    "find_similar_doab_books",
    {
      title: "Find similar DOAB books",
      description: "Find DOAB books similar to a given abstract or book description.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        abstract: z
          .string()
          .min(20)
          .max(12_000)
          .describe("The reference abstract or description. Pass the full text, not keywords."),
        title: z.string().max(500).optional().describe("The reference title, if available."),
        limit: limitInput
      }
    },
    async (input) => {
      const query = [input.title, input.abstract].filter(Boolean).join(" ");
      const filters = buildFilterClauses({ type: "book" });
      const ladder = buildQueryLadder(stripLuceneSyntax(query)).map((freeText) =>
        composeQuery(freeText, filters)
      );

      const pool = candidatePoolSize(input.limit);
      const {
        result,
        query: effectiveQuery,
        relaxed
      } = await searchWithRelaxation(ladder, (rung) => client.search(rung, { pageSize: pool }));
      const ranked = rankRecords(
        query,
        result.records,
        searchableFromBook,
        analyzeQueryPreferences(query)
      ).slice(0, input.limit);

      return format({
        warning: discoveryWarning,
        warnings: [
          semanticFallbackWarning(),
          ...(relaxed ? [relaxedMatchWarning()] : []),
          ...result.warnings
        ],
        query: effectiveQuery,
        total: result.total,
        returned: ranked.length,
        results: ranked
      });
    }
  );

  server.registerTool(
    "get_doab_record_by_doi",
    {
      title: "Get DOAB record by DOI",
      description: "Look up a single DOAB book or chapter by its DOI.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        doi: z
          .string()
          .min(4)
          .max(300)
          .describe(
            'The DOI, e.g. "10.14631/978-3-96317-857-3", with or without a "https://doi.org/" prefix.'
          )
      }
    },
    async (input) => {
      const bareDoi = input.doi.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "");
      const query = `${DOAB_FIELDS.doi}:"${escapeQuotedValue(bareDoi)}"`;
      const result = await client.search(query, { pageSize: 5 });
      return format({
        warning: discoveryWarning,
        warnings: result.warnings,
        query,
        returned: result.records.length,
        results: result.records
      });
    }
  );

  server.registerTool(
    "get_doab_record_by_handle",
    {
      title: "Get DOAB record by handle",
      description:
        "Look up a single DOAB record by its handle, its DOAB URL, or its internal item UUID.",
      annotations: doabReadOnlyAnnotations,
      inputSchema: {
        handle: z
          .string()
          .min(4)
          .max(300)
          .describe(
            'A DOAB handle ("20.500.12854/32785"), a full DOAB URL, or an item UUID. DOAB books ' +
              "have no ISSN, so the handle is the stable identifier."
          )
      }
    },
    async (input) => {
      const value = input.handle.trim();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      // A DSpace handle prefix carries several dot-separated parts ("20.500.12854"), so the
      // whole prefix has to be consumed at once; matching a single dot pair would silently
      // truncate "20.500.12854/32785" to "500.12854/32785" and look up a different record.
      const handleMatch = /(\d+(?:\.\d+)+\/[A-Za-z0-9._-]+)/.exec(value);

      if (uuidPattern.test(value)) {
        const result = await client.getByUuid(value);
        return format({
          warning: discoveryWarning,
          warnings: result.warnings,
          returned: result.records.length,
          results: result.records
        });
      }

      if (!handleMatch?.[1]) {
        return format({
          warning: discoveryWarning,
          warnings: [
            'Could not read a DOAB handle or item UUID from that input. Expected a handle such as "20.500.12854/32785", a DOAB URL containing one, or a UUID.'
          ],
          returned: 0,
          results: []
        });
      }

      const result = await client.getByHandle(handleMatch[1]);
      return format({
        warning: discoveryWarning,
        warnings: result.warnings,
        handle: handleMatch[1],
        returned: result.records.length,
        results: result.records
      });
    }
  );

  server.registerTool(
    "explain_doab_metadata",
    {
      title: "Explain DOAB metadata",
      description:
        "Explain DOAB metadata terms such as handle, chapter records, peer-review fields, licence, Thema, or OAPEN.",
      annotations: localReadOnlyAnnotations,
      inputSchema: {
        term: z
          .string()
          .min(1)
          .max(200)
          .describe(
            'The term to explain, e.g. "handle", "peer review", "chapter", "Thema", "licence", "OAPEN".'
          )
      }
    },
    async (input) => format({ term: input.term, explanation: explainDoabMetadata(input.term) })
  );
};
