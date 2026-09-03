import type {
  DoabRecordType,
  NormalizedBook,
  PeerReviewInfo,
  SearchableRecord,
  UnknownRecord
} from "../types.js";

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
};

/**
 * DSpace returns metadata as a flat list of repeatable `{key, value}` pairs rather than a nested
 * object, so every field lookup is a scan. Collapsing it once per record keeps the extractors
 * below linear instead of quadratic.
 */
export type MetadataMap = Map<string, string[]>;

export const toMetadataMap = (record: unknown): MetadataMap => {
  const map: MetadataMap = new Map();
  if (!isRecord(record) || !Array.isArray(record.metadata)) return map;
  for (const entry of record.metadata) {
    if (!isRecord(entry)) continue;
    const key = stringValue(entry.key);
    const value = stringValue(entry.value);
    if (!key || !value) continue;
    const existing = map.get(key);
    if (existing) existing.push(value);
    else map.set(key, [value]);
  }
  return map;
};

const all = (map: MetadataMap, key: string): string[] => map.get(key) ?? [];
const first = (map: MetadataMap, key: string): string | undefined => map.get(key)?.[0];

const parseYear = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const match = /\d{4}/.exec(value);
  if (!match) return undefined;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : undefined;
};

const parseInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveType = (value: string | undefined): DoabRecordType => {
  const normalized = value?.toLowerCase();
  if (normalized === "book") return "book";
  if (normalized === "chapter") return "chapter";
  return "unknown";
};

const ISBN_PATTERN = /(?:^|\b)(?:isbn[:\s-]*)?((?:97[89][\d-]{10,17}|\d[\dxX-]{8,16}))(?:\b|$)/i;

/**
 * DOAB has no dedicated ISBN index, and ISBNs arrive mixed into the repeatable, untyped
 * `dc.identifier` field alongside OCLC numbers, internal ids and URLs. They are recovered by
 * shape rather than by key, and only from values that are not URLs.
 */
const extractIsbns = (map: MetadataMap): string[] => {
  const isbns = new Set<string>();
  for (const value of [...all(map, "dc.identifier"), ...all(map, "dc.identifier.isbn")]) {
    if (/^https?:\/\//i.test(value)) continue;
    if (/ocn|oclc/i.test(value)) continue;
    const match = ISBN_PATTERN.exec(value);
    if (!match?.[1]) continue;
    const digits = match[1].replace(/-/g, "");
    if (digits.length === 10 || digits.length === 13) isbns.add(digits);
  }
  return [...isbns];
};

const extractLandingUrls = (map: MetadataMap): string[] => {
  const urls = new Set<string>();
  for (const value of [...all(map, "dc.identifier.uri"), ...all(map, "dc.identifier")]) {
    if (/^https?:\/\//i.test(value)) urls.add(value);
  }
  return [...urls];
};

const extractPeerReview = (map: MetadataMap): PeerReviewInfo | undefined => {
  const reviewType = first(map, "peerreview.review.type");
  const anonymity = first(map, "peerreview.anonymity");
  const stage = first(map, "peerreview.review.stage");
  const openReview = first(map, "peerreview.open.review");
  const reviewerTypes = all(map, "peerreview.reviewer.type");
  const responsibility = first(map, "peerreview.publish.responsibility");

  if (
    !reviewType &&
    !anonymity &&
    !stage &&
    !openReview &&
    !responsibility &&
    reviewerTypes.length === 0
  ) {
    return undefined;
  }

  return {
    ...(reviewType ? { reviewType } : {}),
    ...(anonymity ? { anonymity } : {}),
    ...(stage ? { stage } : {}),
    ...(openReview ? { openReview } : {}),
    reviewerTypes,
    ...(responsibility ? { responsibility } : {})
  };
};

const extractFunders = (map: MetadataMap): string[] => [
  ...new Set([...all(map, "grantor.name"), ...all(map, "grantor.acronym")])
];

export const normalizeBook = (record: unknown): NormalizedBook => {
  const root = isRecord(record) ? record : {};
  const map = toMetadataMap(root);

  const id =
    stringValue(root.uuid) ?? stringValue(root.id) ?? first(map, "dc.title") ?? "unknown-record";
  const handle = stringValue(root.handle);
  const title = stringValue(root.name) ?? first(map, "dc.title") ?? "Untitled record";
  const abstract = first(map, "dc.description.abstract");
  const publisher = first(map, "publisher.name");
  const imprint = first(map, "oapen.imprint");
  const publisherCountry = first(map, "publisher.country");
  const placeOfPublication = first(map, "oapen.place.publication");
  const publishedYear = parseYear(first(map, "dc.date.issued"));
  const series = first(map, "dc.relation.ispartofseries");
  const pages = parseInteger(first(map, "oapen.pages"));
  const doi = first(map, "oapen.identifier.doi");
  const rights = first(map, "dc.rights");
  const publisherLicense = first(map, "publisher.oalicense");
  const peerReview = extractPeerReview(map);

  return {
    id,
    ...(handle ? { handle } : {}),
    title,
    alternativeTitles: all(map, "dc.title.alternative"),
    type: resolveType(first(map, "dc.type")),
    authors: all(map, "dc.contributor.author"),
    editors: all(map, "dc.contributor.editor"),
    ...(abstract ? { abstract } : {}),
    ...(publisher ? { publisher } : {}),
    ...(imprint ? { imprint } : {}),
    ...(publisherCountry ? { publisherCountry } : {}),
    ...(placeOfPublication ? { placeOfPublication } : {}),
    ...(publishedYear !== undefined ? { publishedYear } : {}),
    languages: all(map, "dc.language"),
    subjects: [...new Set(all(map, "dc.subject.other"))],
    classifications: [...new Set(all(map, "dc.subject.classification"))],
    ...(series ? { series } : {}),
    ...(pages !== undefined ? { pages } : {}),
    ...(doi ? { doi } : {}),
    isbns: extractIsbns(map),
    ...(rights ? { rights } : {}),
    ...(publisherLicense ? { publisherLicense } : {}),
    funders: extractFunders(map),
    ...(peerReview ? { peerReview } : {}),
    ...(handle ? { doabUrl: `https://directory.doabooks.org/handle/${handle}` } : {}),
    landingUrls: extractLandingUrls(map)
  };
};

export const extractResults = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) return [payload];
  return [];
};

/**
 * Flat text view used by the ranker. DOAB's `dc.subject.other` mixes free keywords with Thema
 * classification strings, so both go in as keywords; the formal classification stays separate.
 */
export const searchableFromBook = (book: NormalizedBook): SearchableRecord => ({
  id: book.id,
  title: book.title,
  ...(book.abstract ? { abstract: book.abstract } : {}),
  keywords: book.subjects,
  subjects: book.classifications,
  ...(book.publisherCountry ? { country: book.publisherCountry } : {}),
  languages: book.languages,
  ...(book.publisher ? { publisher: book.publisher } : {}),
  ...(book.series ? { series: book.series } : {}),
  peerReviewed: Boolean(book.peerReview)
});
