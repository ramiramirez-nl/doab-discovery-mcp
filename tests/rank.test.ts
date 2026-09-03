import { describe, expect, test } from "vitest";

import { searchableFromBook } from "../src/doab/normalize.js";
import { rankRecords } from "../src/search/rank.js";
import { expandSynonyms } from "../src/search/synonyms.js";
import { normalizeText, tokenize } from "../src/search/text.js";
import type { NormalizedBook } from "../src/types.js";

const book = (overrides: Partial<NormalizedBook>): NormalizedBook => ({
  id: "x",
  title: "Untitled",
  alternativeTitles: [],
  type: "book",
  authors: [],
  editors: [],
  languages: [],
  subjects: [],
  classifications: [],
  isbns: [],
  funders: [],
  landingUrls: [],
  ...overrides
});

describe("lexical ranking", () => {
  test("normalizes case and diacritics", () => {
    expect(normalizeText("Syriac Chrístianity")).toBe("syriac christianity");
    expect(tokenize("Kurdish-language education")).toEqual(["kurdish", "language", "education"]);
  });

  test("expands synonyms conservatively", () => {
    const expanded = expandSynonyms("syriac christianity in the ottoman empire");

    expect(expanded).toContain("Church of the East");
    expect(expanded).toContain("Tanzimat");
  });

  test("boosts phrase, field, language and country matches", () => {
    const ranked = rankRecords(
      "Syriac manuscripts",
      [
        book({
          id: "a",
          title: "Syriac manuscripts of Tur Abdin",
          abstract: "A survey of manuscript collections.",
          subjects: ["manuscripts", "Syriac"],
          publisherCountry: "Netherlands",
          languages: ["English"]
        }),
        book({
          id: "b",
          title: "Marine Biology of the North Sea",
          abstract: "Coastal ecology.",
          publisherCountry: "Brazil",
          languages: ["Portuguese"]
        })
      ],
      searchableFromBook,
      { preferredLanguages: ["English"], preferredCountries: ["Netherlands"] }
    );

    expect(ranked[0]?.record.id).toBe("a");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  test("rewards declared peer review only when the query asks for it", () => {
    const records = [
      book({ id: "plain", title: "Ottoman archives" }),
      book({
        id: "reviewed",
        title: "Ottoman archives",
        peerReview: { anonymity: "Single-anonymised", reviewerTypes: ["External peer reviewer"] }
      })
    ];

    const neutral = rankRecords("Ottoman archives", records, searchableFromBook);
    expect(neutral[0]?.score).toBe(neutral[1]?.score);

    const asking = rankRecords("peer reviewed Ottoman archives", records, searchableFromBook);
    expect(asking[0]?.record.id).toBe("reviewed");
  });
});
