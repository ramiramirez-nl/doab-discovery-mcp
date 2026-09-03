export type UnknownRecord = Record<string, unknown>;

export interface AppConfig {
  port: number;
  doabApiBaseUrl: string;
  doabRequestTimeoutMs: number;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  maxRequestBodyBytes: number;
  enableCache: boolean;
  cacheDir: string;
  cacheTtlSeconds: number;
  enableMemoryCache: boolean;
  memoryCacheMaxEntries: number;
  memoryCacheTtlSeconds: number;
  maxResultsDefault: number;
  maxResultsLimit: number;
  trustProxy: boolean;
  buildSha: string;
  deploymentBaseUrl?: string;
}

/** DOAB indexes books and book chapters; `dc.type` carries the distinction. */
export type DoabRecordType = "book" | "chapter" | "unknown";

export interface PeerReviewInfo {
  reviewType?: string;
  anonymity?: string;
  stage?: string;
  openReview?: string;
  reviewerTypes: string[];
  responsibility?: string;
}

export interface NormalizedBook {
  id: string;
  handle?: string;
  title: string;
  alternativeTitles: string[];
  type: DoabRecordType;
  authors: string[];
  editors: string[];
  abstract?: string;
  publisher?: string;
  imprint?: string;
  publisherCountry?: string;
  placeOfPublication?: string;
  publishedYear?: number;
  languages: string[];
  subjects: string[];
  classifications: string[];
  series?: string;
  pages?: number;
  doi?: string;
  isbns: string[];
  rights?: string;
  publisherLicense?: string;
  funders: string[];
  peerReview?: PeerReviewInfo;
  doabUrl?: string;
  landingUrls: string[];
}

export type SearchableRecord = {
  id: string;
  title?: string;
  abstract?: string;
  keywords?: string[];
  subjects?: string[];
  country?: string;
  languages?: string[];
  publisher?: string;
  series?: string;
  peerReviewed?: boolean;
};

export interface QueryPreferences {
  detectedLanguage?: string;
  preferredLanguages: string[];
  preferredCountries: string[];
}

export interface RankedRecord<T> {
  record: T;
  score: number;
  reasons: string[];
}

export interface DoabSearchResult<T> {
  records: T[];
  total?: number;
  warnings: string[];
}
