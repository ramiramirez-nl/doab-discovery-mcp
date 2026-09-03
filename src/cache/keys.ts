import { createHash } from "node:crypto";

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
};

export const createCacheKey = (namespace: string, value: unknown): string => {
  const encoded = JSON.stringify(stable(value));
  const digest = createHash("sha256").update(encoded).digest("hex");
  return `${namespace}:${digest}`;
};
