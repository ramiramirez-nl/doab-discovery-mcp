export interface CacheEntry<T> {
  key: string;
  createdAt: string;
  ttlSeconds: number;
  source: string;
  payloadVersion: number;
  payload: T;
}

export interface CacheSetOptions {
  ttlSeconds: number;
  source: string;
  payloadVersion: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, payload: T, options: CacheSetOptions): Promise<CacheEntry<T>>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const isExpired = (entry: CacheEntry<unknown>, now = Date.now()): boolean => {
  const created = Date.parse(entry.createdAt);
  return Number.isNaN(created) || now > created + entry.ttlSeconds * 1000;
};
