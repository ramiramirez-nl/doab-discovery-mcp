import type { QueryPreferences, RankedRecord, SearchableRecord } from "../types.js";
import { expandedQueryText } from "./synonyms.js";
import { normalizeText, tokenize } from "./text.js";

const fieldText = (record: SearchableRecord): Record<string, string> => ({
  title: record.title ?? "",
  abstract: record.abstract ?? "",
  keywords: (record.keywords ?? []).join(" "),
  subjects: (record.subjects ?? []).join(" "),
  series: record.series ?? "",
  publisher: record.publisher ?? "",
  country: record.country ?? "",
  languages: (record.languages ?? []).join(" ")
});

const weights: Record<string, number> = {
  title: 4,
  keywords: 3,
  subjects: 2.5,
  abstract: 1.6,
  series: 1.2,
  publisher: 0.8,
  country: 0.8,
  languages: 0.8
};

/**
 * Inverse document frequency across the fetched candidate pool. Without it, a query built from a
 * blurb or an abstract is dominated by whichever common term ("history", "culture") happens to
 * appear in a short book title, while the distinctive terms that actually identify the topic
 * contribute no more than the generic ones.
 */
const inverseDocumentFrequencies = (
  uniqueTokens: string[],
  recordTokenSets: Array<Set<string>>
): Map<string, number> => {
  const total = recordTokenSets.length;
  const idf = new Map<string, number>();
  for (const token of uniqueTokens) {
    const documentFrequency = recordTokenSets.reduce(
      (count, tokens) => (tokens.has(token) ? count + 1 : count),
      0
    );
    idf.set(token, Math.log(1 + total / (1 + documentFrequency)));
  }
  return idf;
};

/**
 * Ranks arbitrary records through a projection rather than requiring them to be structurally
 * `SearchableRecord`. A DOAB book keeps its own richer shape (publisher country, peer-review
 * block, classifications) in the response while ranking sees only the flat text view.
 */
export const rankRecords = <T>(
  query: string,
  records: T[],
  project: (record: T) => SearchableRecord,
  preferences: Partial<QueryPreferences> = {}
): Array<RankedRecord<T>> => {
  const queryTokens = tokenize(expandedQueryText(query));
  const uniqueTokens = [...new Set(queryTokens)];
  const phrase = normalizeText(query);
  const wantsPeerReview = /\b(peer[- ]?review(ed|ing)?|refereed)\b/i.test(query);

  const projected = records.map(project);
  const recordFields = projected.map((record) => fieldText(record));
  const recordTokenSets = recordFields.map(
    (fields) => new Set(tokenize(Object.values(fields).join(" ")))
  );
  const idf = inverseDocumentFrequencies(uniqueTokens, recordTokenSets);

  return records
    .map((record, index) => {
      let score = 0;
      const reasons: string[] = [];
      const searchable = projected[index] ?? project(record);
      const fields = recordFields[index] ?? fieldText(searchable);

      for (const [field, value] of Object.entries(fields)) {
        const normalized = normalizeText(value);
        const tokens = tokenize(value);
        if (!normalized) continue;
        const lengthNorm = Math.sqrt(tokens.length + 1);
        const matched = uniqueTokens.filter((token) => tokens.includes(token));
        if (matched.length > 0) {
          const weightedMatches = matched.reduce((sum, token) => sum + (idf.get(token) ?? 1), 0);
          score += (weightedMatches / lengthNorm) * (weights[field] ?? 1);
          reasons.push(`${field} match`);
        }
        if (phrase && normalized.includes(phrase)) {
          score += 5 * (weights[field] ?? 1);
          reasons.push(`${field} phrase`);
        }
      }

      if (wantsPeerReview && searchable.peerReviewed) {
        score += 6;
        reasons.push("peer review metadata");
      }

      for (const language of preferences.preferredLanguages ?? []) {
        if (
          (searchable.languages ?? []).some(
            (item) => normalizeText(item) === normalizeText(language)
          )
        ) {
          score += 4;
          reasons.push(`language ${language}`);
        }
      }

      for (const country of preferences.preferredCountries ?? []) {
        if (searchable.country && normalizeText(searchable.country) === normalizeText(country)) {
          score += 4;
          reasons.push(`country ${country}`);
        }
      }

      return { record, score, reasons: [...new Set(reasons)] };
    })
    .sort((a, b) => b.score - a.score);
};
