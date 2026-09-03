import { describe, expect, test } from "vitest";

import {
  buildFilterClauses,
  buildFreeTextClause,
  buildQueryLadder,
  composeQuery,
  contentTerms,
  escapeQuotedValue,
  stripLuceneSyntax
} from "../src/doab/query.js";

describe("free text clauses", () => {
  test("drops stopwords and de-duplicates content terms", () => {
    expect(contentTerms("the history of the book and the book trade")).toEqual([
      "history",
      "trade"
    ]);
  });

  test("AND-joins short deliberate queries", () => {
    expect(buildFreeTextClause("Syriac manuscripts")).toBe("syriac AND manuscripts");
  });

  test("OR-joins long free text so it does not match zero records", () => {
    const clause = buildFreeTextClause(
      "This volume examines Ottoman provincial administration, taxation and local notables"
    );

    expect(clause).toContain(" OR ");
    expect(clause).not.toContain(" AND ");
  });

  test("falls back to a match-all clause when nothing survives tokenisation", () => {
    expect(buildFreeTextClause("the and of")).toBe("*:*");
  });
});

describe("query ladder", () => {
  test("goes from narrow AND rungs to a broad OR rung", () => {
    const ladder = buildQueryLadder("Syriac Christianity manuscripts Tur Abdin diaspora");

    expect(ladder[0]).toContain(" AND ");
    expect(ladder.at(-1)).toContain(" OR ");
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  test("strict mode produces a single AND rung", () => {
    expect(buildQueryLadder("Syriac manuscripts Tur Abdin", { mode: "precise" })).toEqual([
      "syriac AND manuscripts AND tur AND abdin"
    ]);
  });
});

describe("filter clauses", () => {
  test("builds only verified DOAB field clauses", () => {
    expect(buildFilterClauses({ type: "book", language: "Turkish", publisher: "Brill" })).toEqual([
      'dc.type:"book"',
      'dc.language:"Turkish"',
      'publisher:"Brill"'
    ]);
  });

  test("builds an open-ended year range when only one bound is given", () => {
    expect(buildFilterClauses({ yearFrom: 2015 })).toEqual(["dc.date.issued:[2015 TO *]"]);
    expect(buildFilterClauses({ yearTo: 2015 })).toEqual(["dc.date.issued:[* TO 2015]"]);
  });

  test("peer review filter matches records that declare a process", () => {
    expect(buildFilterClauses({ peerReviewedOnly: true })).toEqual(["peerreview.anonymity:*"]);
  });

  test("composes filters against free text and against a match-all", () => {
    expect(composeQuery("syriac AND manuscripts", ['dc.type:"book"'])).toBe(
      '(syriac AND manuscripts) AND dc.type:"book"'
    );
    expect(composeQuery("*:*", ['dc.type:"book"'])).toBe('dc.type:"book"');
    expect(composeQuery("syriac", [])).toBe("syriac");
  });
});

describe("input sanitising", () => {
  test("escapes quotes and backslashes inside quoted values", () => {
    expect(escapeQuotedValue('Brill "Handbooks"')).toBe('Brill \\"Handbooks\\"');
  });

  test("strips Lucene operators that make DOAB return HTTP 500", () => {
    expect(stripLuceneSyntax("syriac: manuscripts (Tur Abdin) ~ ^ && ||")).toBe(
      "syriac manuscripts Tur Abdin"
    );
  });
});
