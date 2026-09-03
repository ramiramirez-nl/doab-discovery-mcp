/**
 * DOAB runs DSpace 6, whose REST search accepts Lucene syntax but only over the indexes DOAB
 * actually configured. An unknown field name is not an error: the query simply matches nothing,
 * so a plausible-looking filter silently empties the result set. Every field listed here was
 * verified against the live index; anything not listed must not be used in a query.
 */
export const DOAB_FIELDS = {
  title: "dc.title",
  author: "dc.contributor.author",
  editor: "dc.contributor.editor",
  /** Covers authors, editors and other contributors in one index. */
  contributor: "contributor",
  abstract: "dc.description.abstract",
  /** DOAB stores both free keywords and Thema/BIC classification strings here. */
  keyword: "dc.subject.other",
  classification: "dc.subject.classification",
  /** Values are language NAMES ("English", "Turkish"), not ISO codes. */
  language: "dc.language",
  /** Values are "book" or "chapter". */
  type: "dc.type",
  issued: "dc.date.issued",
  /** Publisher free-text index. `publisher.name` exists as metadata but is not usefully indexed. */
  publisher: "publisher",
  imprint: "oapen.imprint",
  doi: "oapen.identifier.doi",
  peerReviewAnonymity: "peerreview.anonymity"
} as const;

/**
 * Publisher country is present on every item as `publisher.country` metadata, but the index only
 * resolves it for publisher community records, so filtering books by it returns zero. It is
 * therefore a ranking signal only, never a query clause.
 */
export const UNFILTERABLE_FIELDS = ["publisher.country"] as const;
