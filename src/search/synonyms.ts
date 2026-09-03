import { normalizeText } from "./text.js";

const SYNONYMS: Record<string, string[]> = {
  "open access": ["OA", "free access", "open monograph"],
  monograph: ["book", "volume", "study"],
  "edited volume": ["collected essays", "essay collection", "festschrift"],
  "syriac christianity": [
    "Syriac studies",
    "Assyrian Christianity",
    "Chaldean",
    "Aramaic",
    "Syriac Orthodox",
    "Church of the East"
  ],
  ottoman: ["Ottoman Empire", "Sublime Porte", "Tanzimat"],
  diaspora: ["migration", "exile", "transnational community"],
  archives: ["archival studies", "manuscript archives", "documentary sources"],
  kurdish: ["Kurmanji", "Sorani", "Kurdish language"],
  historiography: ["history writing", "historical method"]
};

export const expandSynonyms = (query: string): string[] => {
  const normalized = normalizeText(query);
  const expansions = new Set<string>();
  for (const [term, values] of Object.entries(SYNONYMS)) {
    if (normalized.includes(normalizeText(term))) {
      values.forEach((value) => expansions.add(value));
    }
  }
  return [...expansions];
};

export const expandedQueryText = (query: string): string =>
  [query, ...expandSynonyms(query)].join(" ");
