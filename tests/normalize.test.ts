import { describe, expect, test } from "vitest";

import { normalizeBook, searchableFromBook, toMetadataMap } from "../src/doab/normalize.js";

const item = (pairs: Array<[string, string]>, overrides: Record<string, unknown> = {}) => ({
  uuid: "6672a1eb-f21b-44ce-a31d-53280c182995",
  name: "The Syriac World",
  handle: "20.500.12854/32785",
  type: "item",
  metadata: pairs.map(([key, value]) => ({ key, value, language: null })),
  ...overrides
});

describe("DSpace metadata flattening", () => {
  test("collapses repeated keys into one entry with all values", () => {
    const map = toMetadataMap(
      item([
        ["dc.contributor.author", "Kiraz, George"],
        ["dc.contributor.author", "Brock, Sebastian"]
      ])
    );

    expect(map.get("dc.contributor.author")).toEqual(["Kiraz, George", "Brock, Sebastian"]);
  });

  test("tolerates a record with no metadata array", () => {
    expect(toMetadataMap({ uuid: "x" }).size).toBe(0);
    expect(toMetadataMap(null).size).toBe(0);
  });
});

describe("normalizeBook", () => {
  test("maps the fields DOAB actually supplies", () => {
    const book = normalizeBook(
      item([
        ["dc.title", "The Syriac World"],
        ["dc.title.alternative", "Syriac World, The"],
        ["dc.type", "book"],
        ["dc.contributor.editor", "King, Daniel"],
        ["dc.date.issued", "2019"],
        ["dc.language", "English"],
        ["dc.description.abstract", "This volume surveys the Syriac world."],
        ["dc.subject.other", "religion"],
        ["dc.subject.other", "religion"],
        ["dc.subject.classification", "History"],
        ["dc.rights", "open access"],
        ["dc.relation.ispartofseries", "Routledge Worlds"],
        ["oapen.pages", "870"],
        ["oapen.imprint", "Routledge"],
        ["oapen.place.publication", "London"],
        ["oapen.identifier.doi", "10.4324/9781315708195"],
        ["publisher.name", "Taylor & Francis"],
        ["publisher.country", "United Kingdom"],
        ["publisher.oalicense", "Creative Commons BY-NC-ND"],
        ["grantor.name", "Wellcome Trust"],
        ["peerreview.anonymity", "Single-anonymised"],
        ["peerreview.reviewer.type", "External peer reviewer"]
      ])
    );

    expect(book.title).toBe("The Syriac World");
    expect(book.alternativeTitles).toEqual(["Syriac World, The"]);
    expect(book.type).toBe("book");
    expect(book.editors).toEqual(["King, Daniel"]);
    expect(book.publishedYear).toBe(2019);
    expect(book.languages).toEqual(["English"]);
    expect(book.publisher).toBe("Taylor & Francis");
    expect(book.imprint).toBe("Routledge");
    expect(book.publisherCountry).toBe("United Kingdom");
    expect(book.placeOfPublication).toBe("London");
    expect(book.series).toBe("Routledge Worlds");
    expect(book.pages).toBe(870);
    expect(book.doi).toBe("10.4324/9781315708195");
    expect(book.funders).toEqual(["Wellcome Trust"]);
    expect(book.peerReview?.anonymity).toBe("Single-anonymised");
    expect(book.peerReview?.reviewerTypes).toEqual(["External peer reviewer"]);
    expect(book.doabUrl).toBe("https://directory.doabooks.org/handle/20.500.12854/32785");
    // dc.subject.other is repeatable and DOAB does repeat values; they must not duplicate.
    expect(book.subjects).toEqual(["religion"]);
  });

  test("recovers ISBNs from the untyped dc.identifier field and ignores its noise", () => {
    const book = normalizeBook(
      item([
        ["dc.identifier", "1005032"],
        ["dc.identifier", "OCN: 1113642306"],
        ["dc.identifier", "978-1-138-89901-8"],
        ["dc.identifier", "http://library.oapen.org/handle/20.500.12657/25062"],
        ["dc.identifier.uri", "https://directory.doabooks.org/handle/20.500.12854/32785"]
      ])
    );

    expect(book.isbns).toEqual(["9781138899018"]);
    expect(book.landingUrls).toEqual([
      "https://directory.doabooks.org/handle/20.500.12854/32785",
      "http://library.oapen.org/handle/20.500.12657/25062"
    ]);
  });

  test("omits the peer-review block entirely when DOAB supplies none", () => {
    expect(normalizeBook(item([["dc.title", "Plain"]])).peerReview).toBeUndefined();
  });

  test("marks an unrecognised dc.type rather than guessing", () => {
    expect(normalizeBook(item([["dc.type", "dataset"]])).type).toBe("unknown");
    expect(normalizeBook(item([["dc.type", "chapter"]])).type).toBe("chapter");
  });

  test("survives a malformed record without throwing", () => {
    const book = normalizeBook({ metadata: [{ key: "dc.title" }, "nonsense", null] });

    expect(book.id).toBe("unknown-record");
    expect(book.title).toBe("Untitled record");
  });
});

describe("searchableFromBook", () => {
  test("projects publisher country and peer-review presence for ranking", () => {
    const searchable = searchableFromBook(
      normalizeBook(
        item([
          ["dc.subject.other", "manuscripts"],
          ["dc.subject.classification", "History"],
          ["publisher.country", "Germany"],
          ["peerreview.anonymity", "Double-anonymised"]
        ])
      )
    );

    expect(searchable.keywords).toEqual(["manuscripts"]);
    expect(searchable.subjects).toEqual(["History"]);
    expect(searchable.country).toBe("Germany");
    expect(searchable.peerReviewed).toBe(true);
  });
});
