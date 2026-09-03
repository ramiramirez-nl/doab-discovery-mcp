import type { QueryPreferences } from "../types.js";
import { normalizeText } from "../search/text.js";
import { countryAliases, languageAliases } from "../doab/vocab.js";

export const analyzeQueryPreferences = (query: string): QueryPreferences => {
  const normalized = normalizeText(query);
  const preferredCountries = new Set<string>();
  const preferredLanguages = new Set<string>();

  for (const { alias, name } of countryAliases) {
    if (normalized.includes(normalizeText(alias))) preferredCountries.add(name);
  }
  for (const { alias, name } of languageAliases) {
    if (normalized.includes(normalizeText(alias))) preferredLanguages.add(name);
  }

  let detectedLanguage: string | undefined;
  if (
    /[ıİğĞüÜşŞöÖçÇ]/u.test(query) ||
    normalized.includes("turkiye") ||
    normalized.includes("kitap")
  ) {
    detectedLanguage = "Turkish";
    preferredLanguages.add("Turkish");
    preferredCountries.add("Turkey");
  }

  return {
    ...(detectedLanguage ? { detectedLanguage } : {}),
    preferredLanguages: [...preferredLanguages],
    preferredCountries: [...preferredCountries]
  };
};
