/**
 * Country and language vocabulary.
 *
 * Unlike DOAJ, DOAB stores language as a NAME ("English", "Turkish"), not an ISO code, so the
 * ISO tables here exist only to normalise user input — "tr", "türkçe" and "Turkish" all have to
 * resolve to the single spelling DOAB indexes. Country is never a query clause (see
 * UNFILTERABLE_FIELDS in fields.ts); it is kept for ranking and for reading publisher metadata.
 */
const COUNTRY_TO_ISO: Record<string, string> = {
  afghanistan: "AF",
  albania: "AL",
  algeria: "DZ",
  argentina: "AR",
  armenia: "AM",
  australia: "AU",
  austria: "AT",
  azerbaijan: "AZ",
  bangladesh: "BD",
  belarus: "BY",
  belgium: "BE",
  benin: "BJ",
  bolivia: "BO",
  "bosnia and herzegovina": "BA",
  bosnia: "BA",
  brazil: "BR",
  bulgaria: "BG",
  "burkina faso": "BF",
  cambodia: "KH",
  cameroon: "CM",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  "costa rica": "CR",
  croatia: "HR",
  cuba: "CU",
  cyprus: "CY",
  czechia: "CZ",
  "czech republic": "CZ",
  denmark: "DK",
  "dominican republic": "DO",
  ecuador: "EC",
  egypt: "EG",
  "el salvador": "SV",
  estonia: "EE",
  ethiopia: "ET",
  finland: "FI",
  france: "FR",
  georgia: "GE",
  germany: "DE",
  ghana: "GH",
  greece: "GR",
  guatemala: "GT",
  honduras: "HN",
  "hong kong": "HK",
  hungary: "HU",
  iceland: "IS",
  india: "IN",
  indonesia: "ID",
  iran: "IR",
  iraq: "IQ",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
  japan: "JP",
  jordan: "JO",
  kazakhstan: "KZ",
  kenya: "KE",
  "south korea": "KR",
  korea: "KR",
  kosovo: "XK",
  kuwait: "KW",
  kyrgyzstan: "KG",
  latvia: "LV",
  lebanon: "LB",
  libya: "LY",
  lithuania: "LT",
  luxembourg: "LU",
  malaysia: "MY",
  mali: "ML",
  malta: "MT",
  mexico: "MX",
  moldova: "MD",
  mongolia: "MN",
  montenegro: "ME",
  morocco: "MA",
  mozambique: "MZ",
  myanmar: "MM",
  namibia: "NA",
  nepal: "NP",
  netherlands: "NL",
  "new zealand": "NZ",
  nicaragua: "NI",
  nigeria: "NG",
  "north macedonia": "MK",
  macedonia: "MK",
  norway: "NO",
  oman: "OM",
  pakistan: "PK",
  palestine: "PS",
  panama: "PA",
  paraguay: "PY",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  qatar: "QA",
  romania: "RO",
  russia: "RU",
  "saudi arabia": "SA",
  senegal: "SN",
  serbia: "RS",
  singapore: "SG",
  slovakia: "SK",
  slovenia: "SI",
  "south africa": "ZA",
  spain: "ES",
  "sri lanka": "LK",
  sudan: "SD",
  sweden: "SE",
  switzerland: "CH",
  syria: "SY",
  taiwan: "TW",
  tajikistan: "TJ",
  tanzania: "TZ",
  thailand: "TH",
  tunisia: "TN",
  turkey: "TR",
  turkiye: "TR",
  türkiye: "TR",
  turkmenistan: "TM",
  uganda: "UG",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  "united states": "US",
  usa: "US",
  "united states of america": "US",
  uruguay: "UY",
  uzbekistan: "UZ",
  venezuela: "VE",
  vietnam: "VN",
  yemen: "YE",
  zambia: "ZM",
  zimbabwe: "ZW"
};

const LANGUAGE_TO_ISO: Record<string, string> = {
  afrikaans: "AF",
  albanian: "SQ",
  amharic: "AM",
  arabic: "AR",
  armenian: "HY",
  azerbaijani: "AZ",
  bengali: "BN",
  bosnian: "BS",
  bulgarian: "BG",
  burmese: "MY",
  catalan: "CA",
  chinese: "ZH",
  croatian: "HR",
  czech: "CS",
  danish: "DA",
  dutch: "NL",
  english: "EN",
  estonian: "ET",
  finnish: "FI",
  french: "FR",
  georgian: "KA",
  german: "DE",
  greek: "EL",
  hebrew: "HE",
  hindi: "HI",
  hungarian: "HU",
  icelandic: "IS",
  indonesian: "ID",
  italian: "IT",
  japanese: "JA",
  kazakh: "KK",
  khmer: "KM",
  korean: "KO",
  kurdish: "KU",
  kyrgyz: "KY",
  lao: "LO",
  latvian: "LV",
  lithuanian: "LT",
  macedonian: "MK",
  malay: "MS",
  mongolian: "MN",
  nepali: "NE",
  norwegian: "NO",
  persian: "FA",
  farsi: "FA",
  polish: "PL",
  portuguese: "PT",
  romanian: "RO",
  russian: "RU",
  serbian: "SR",
  slovak: "SK",
  slovenian: "SL",
  spanish: "ES",
  swahili: "SW",
  swedish: "SV",
  tajik: "TG",
  tamil: "TA",
  thai: "TH",
  turkish: "TR",
  türkçe: "TR",
  turkce: "TR",
  turkmen: "TK",
  ukrainian: "UK",
  urdu: "UR",
  uzbek: "UZ",
  vietnamese: "VI"
};

const invert = (map: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [name, code] of Object.entries(map)) {
    const upperCode = code.toUpperCase();
    if (!(upperCode in result)) {
      result[upperCode] = name.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
  return result;
};

const ISO_TO_COUNTRY_NAME = invert(COUNTRY_TO_ISO);
const ISO_TO_LANGUAGE_NAME = invert(LANGUAGE_TO_ISO);

export const countryNameToCode = (name: string): string | undefined => {
  const key = name.trim().toLowerCase();
  return COUNTRY_TO_ISO[key];
};

export const languageNameToCode = (name: string): string | undefined => {
  const key = name.trim().toLowerCase();
  if (key.length === 2 && key.toUpperCase() in ISO_TO_LANGUAGE_NAME) return key.toUpperCase();
  return LANGUAGE_TO_ISO[key];
};

export const countryCodeToName = (code: string): string | undefined =>
  ISO_TO_COUNTRY_NAME[code.trim().toUpperCase()];

export const languageCodeToName = (code: string): string | undefined =>
  ISO_TO_LANGUAGE_NAME[code.trim().toUpperCase()];

export interface CodeAlias {
  alias: string;
  code: string;
  name: string;
}

export const countryAliases: CodeAlias[] = Object.entries(COUNTRY_TO_ISO).map(([alias, code]) => ({
  alias,
  code,
  name: countryCodeToName(code) ?? code
}));

export const languageAliases: CodeAlias[] = Object.entries(LANGUAGE_TO_ISO).map(
  ([alias, code]) => ({ alias, code, name: languageCodeToName(code) ?? code })
);

/**
 * Resolve any spelling the user might type to the exact language name DOAB indexes. Returns
 * undefined when the language is unknown, so the caller can fall back to ranking-only rather
 * than emitting a filter clause that would silently match nothing.
 */
export const canonicalLanguageName = (value: string): string | undefined => {
  const code = languageNameToCode(value);
  return code ? languageCodeToName(code) : undefined;
};

/** Canonical country name, used for ranking and for reading publisher metadata. */
export const canonicalCountryName = (value: string): string | undefined => {
  const code = countryNameToCode(value);
  return code ? countryCodeToName(code) : undefined;
};
