import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config.js";
import { DoabClient } from "../src/doab/client.js";
import { DOAB_FIELDS, UNFILTERABLE_FIELDS } from "../src/doab/fields.js";
import {
  buildFilterClauses,
  buildFreeTextClause,
  buildQueryLadder,
  composeQuery
} from "../src/doab/query.js";

/**
 * Hits the real DOAB API. Skipped by default so CI stays hermetic.
 *
 * These exist because DOAB's DSpace index fails silently: a query naming a field that is not
 * indexed is not an error, it simply matches nothing. A stubbed `fetch` cannot tell a correct
 * field name from a plausible invented one, so every field this server puts in a query is
 * asserted against the live index here.
 *
 * Run with: DOAB_LIVE_TEST=1 npm test
 */
const describeLive = process.env.DOAB_LIVE_TEST ? describe : describe.skip;

describeLive("live DOAB API", () => {
  const client = new DoabClient(
    loadConfig({ ENABLE_CACHE: "false", ENABLE_MEMORY_CACHE: "false" })
  );

  test("a real abstract returns non-empty book candidates", async () => {
    const abstract =
      "This study examines the transmission of Syriac liturgical manuscripts in the Ottoman " +
      "period, focusing on scribal practices in Tur Abdin monasteries between 1500 and 1900, " +
      "using paleographic analysis and colophon evidence to reconstruct networks of copying " +
      "and patronage across monastic centres.";
    const ladder = buildQueryLadder(abstract).map((rung) =>
      composeQuery(rung, buildFilterClauses({ type: "book" }))
    );

    const results = await Promise.all(
      ladder.map((query) => client.search(query, { pageSize: 25 }))
    );

    expect(results.some((result) => result.records.length > 0)).toBe(true);
  }, 40_000);

  test("every field this server queries is actually indexed", async () => {
    const probes: Array<[string, string]> = [
      [DOAB_FIELDS.title, "syriac"],
      [DOAB_FIELDS.author, "King"],
      [DOAB_FIELDS.editor, "King"],
      [DOAB_FIELDS.contributor, "King"],
      [DOAB_FIELDS.abstract, "syriac"],
      [DOAB_FIELDS.keyword, "syriac"],
      [DOAB_FIELDS.classification, "History"],
      [DOAB_FIELDS.language, "Turkish"],
      [DOAB_FIELDS.type, "book"],
      [DOAB_FIELDS.issued, "2019"],
      [DOAB_FIELDS.publisher, "Brill"],
      [DOAB_FIELDS.imprint, "Routledge"],
      [DOAB_FIELDS.doi, "*"],
      [DOAB_FIELDS.peerReviewAnonymity, "*"]
    ];

    for (const [field, value] of probes) {
      const query = value === "*" ? `${field}:*` : `${field}:"${value}"`;
      const result = await client.search(query, { pageSize: 1 });
      expect(result.records.length, `${field} is not indexed by DOAB`).toBeGreaterThan(0);
    }
  }, 90_000);

  test("publisher country is still unfilterable, so the ranking-only warning stays honest", async () => {
    expect(UNFILTERABLE_FIELDS).toContain("publisher.country");

    const result = await client.search('publisher.country:"Turkey" AND dc.type:"book"', {
      pageSize: 1
    });

    expect(result.records).toHaveLength(0);
  }, 20_000);

  test("a year range narrows without emptying the result set", async () => {
    const query = composeQuery(
      buildFreeTextClause("history"),
      buildFilterClauses({ type: "book", yearFrom: 2020, yearTo: 2024 })
    );
    const result = await client.search(query, { pageSize: 5 });

    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(record.publishedYear).toBeGreaterThanOrEqual(2020);
      expect(record.publishedYear).toBeLessThanOrEqual(2024);
    }
  }, 20_000);

  test("the hit total arrives in the response header", async () => {
    const result = await client.search('dc.type:"book"', { pageSize: 1 });

    expect(result.total).toBeGreaterThan(10_000);
  }, 20_000);

  test("a handle lookup returns the expected record and normalizes its metadata", async () => {
    const result = await client.getByHandle("20.500.12854/32785");
    const book = result.records[0];

    expect(book?.title).toBe("The Syriac World");
    expect(book?.type).toBe("book");
    expect(book?.languages).toContain("English");
    expect(book?.publishedYear).toBe(2019);
    expect(book?.doabUrl).toBe("https://directory.doabooks.org/handle/20.500.12854/32785");
  }, 20_000);

  test("an unknown handle is reported as not found, not as an outage", async () => {
    const result = await client.getByHandle("20.500.12854/999999999");

    expect(result.records).toHaveLength(0);
    expect(result.warnings[0]).toContain("No DOAB record matched that identifier");
  }, 20_000);
});
