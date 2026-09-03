import { tokenize } from "../search/text.js";
import { DOAB_FIELDS } from "./fields.js";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "for",
  "to",
  "with",
  "this",
  "that",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "by",
  "as",
  "at",
  "from",
  "it",
  "its",
  "we",
  "our",
  "book",
  "books",
  "volume",
  "chapter",
  "study",
  "studies",
  "essay",
  "essays",
  "research",
  "using",
  "based",
  "analysis",
  "between",
  "among",
  "within",
  "der",
  "die",
  "das",
  "und",
  "een",
  "van",
  "het",
  "bir",
  "bu",
  "ve",
  "ile",
  "icin",
  "için",
  "gibi",
  "olan",
  "olarak",
  "de",
  "da",
  "mi",
  "mu",
  "ki"
]);

export const escapeQuotedValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Lucene reserves these; DOAB returns a 500 rather than an empty result when a bare one reaches
 * the parser, so unquoted user text is stripped of them before it is used as a term.
 */
export const stripLuceneSyntax = (value: string): string =>
  value
    .replace(/[+\-!(){}[\]^"~*?:\\/]|&&|\|\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type FreeTextMode = "precise" | "recall";

export interface FreeTextOptions {
  mode?: FreeTextMode;
  maxTerms?: number;
}

export const contentTerms = (text: string): string[] => [
  ...new Set(tokenize(text).filter((token) => !STOPWORDS.has(token)))
];

/**
 * DOAB's search defaults to AND across space-separated terms. Long free text (a back-cover
 * blurb, an abstract, a multi-concept question) matches zero records when AND-ed, while short
 * deliberate queries should stay AND-joined for precision.
 */
export const buildFreeTextClause = (text: string, options: FreeTextOptions = {}): string => {
  const maxTerms = Math.max(1, options.maxTerms ?? 12);
  const tokens = contentTerms(text);
  if (tokens.length === 0) return "*:*";

  const mode = options.mode ?? (tokens.length <= 4 ? "precise" : "recall");
  const selected = mode === "precise" ? tokens : tokens.slice(0, maxTerms);
  return selected.join(mode === "precise" ? " AND " : " OR ");
};

/**
 * Progressive relaxation rungs, most precise first.
 *
 * DOAB holds roughly 100,000 books and chapters. A flat OR over every query term always returns
 * something, but the top hits are unrelated; an AND of a few distinctive terms is selective
 * enough that DOAB's own relevance ordering means something, yet returns nothing for niche
 * topics. Callers walk the rungs and stop at the first that yields records.
 */
export const buildQueryLadder = (text: string, options: FreeTextOptions = {}): string[] => {
  const maxTerms = Math.max(1, options.maxTerms ?? 12);
  const tokens = contentTerms(text);
  if (tokens.length === 0) return ["*:*"];
  if (options.mode === "precise") return [tokens.join(" AND ")];

  const rungs: string[] = [];
  for (const width of [4, 3, 2].filter((value) => value <= tokens.length)) {
    rungs.push(tokens.slice(0, width).join(" AND "));
  }
  rungs.push(tokens.slice(0, maxTerms).join(" OR "));
  return [...new Set(rungs)];
};

export interface DoabFilters {
  /** "book" or "chapter"; omitted means both. */
  type?: string;
  /** Language NAME as DOAB stores it, e.g. "Turkish". */
  language?: string;
  publisher?: string;
  imprint?: string;
  yearFrom?: number;
  yearTo?: number;
  /** Restrict to records carrying peer-review metadata. */
  peerReviewedOnly?: boolean;
}

const quoted = (field: string, value: string): string =>
  `${field}:"${escapeQuotedValue(value.trim())}"`;

export const buildFilterClauses = (filters: DoabFilters): string[] => {
  const clauses: string[] = [];
  if (filters.type) clauses.push(quoted(DOAB_FIELDS.type, filters.type));
  if (filters.language) clauses.push(quoted(DOAB_FIELDS.language, filters.language));
  if (filters.publisher) clauses.push(quoted(DOAB_FIELDS.publisher, filters.publisher));
  if (filters.imprint) clauses.push(quoted(DOAB_FIELDS.imprint, filters.imprint));

  const from = filters.yearFrom;
  const to = filters.yearTo;
  if (from !== undefined || to !== undefined) {
    clauses.push(`${DOAB_FIELDS.issued}:[${from ?? "*"} TO ${to ?? "*"}]`);
  }

  if (filters.peerReviewedOnly) clauses.push(`${DOAB_FIELDS.peerReviewAnonymity}:*`);
  return clauses;
};

export const composeQuery = (freeText: string, filterClauses: string[]): string => {
  if (filterClauses.length === 0) return freeText;
  if (freeText === "*:*") return filterClauses.join(" AND ");
  return `(${freeText}) AND ${filterClauses.join(" AND ")}`;
};
