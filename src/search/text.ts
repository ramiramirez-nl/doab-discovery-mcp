export const normalizeText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (value: string): string[] =>
  normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
