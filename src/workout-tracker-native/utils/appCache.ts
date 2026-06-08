const _cache = new Map<string, any>();

export const appCache = {
  set: (key: string, data: any) => _cache.set(key, data),
  get: <T>(key: string): T | null => (_cache.get(key) ?? null) as T | null,
  has: (key: string) => _cache.has(key),
  clear: () => _cache.clear(),
};
