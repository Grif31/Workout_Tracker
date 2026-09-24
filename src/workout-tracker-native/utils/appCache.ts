import { useCallback, useRef } from 'react';

// When a fetch happened, and how many writes the app had made at that point.
export type FetchStamp = { at: number; version: number };

// Tab screens refetch on focus. Within this window, and with no write since,
// what they already hold is still what the server would return.
export const FOCUS_REFETCH_TTL_MS = 60_000;

let _dataVersion = 0;

// Bumped by apiFetch after every successful write, so a gated screen never
// skips the refetch that would show the user their own change.
export function markDataChanged() {
  _dataVersion += 1;
}

export function fetchStamp(): FetchStamp {
  return { at: Date.now(), version: _dataVersion };
}

export function isFresh(stamp: FetchStamp | null | undefined): boolean {
  return !!stamp && stamp.version === _dataVersion && Date.now() - stamp.at < FOCUS_REFETCH_TTL_MS;
}

const _cache = new Map<string, any>();
const _stamps = new Map<string, FetchStamp>();

export const appCache = {
  set: (key: string, data: any) => {
    _cache.set(key, data);
    _stamps.set(key, fetchStamp());
  },
  get: <T>(key: string): T | null => (_cache.get(key) ?? null) as T | null,
  has: (key: string) => _cache.has(key),
  stampOf: (key: string): FetchStamp | null => _stamps.get(key) ?? null,
  clear: () => {
    _cache.clear();
    _stamps.clear();
  },
};

// Per-screen gate for focus refetches. `seed` is read on first render only,
// so a screen mounted right after PreloadScreen can count the preloaded data
// as its first fetch instead of repeating it.
export function useRefetchGate(seed: () => Record<string, FetchStamp | null>) {
  const stamps = useRef<Record<string, FetchStamp | null> | null>(null);
  if (stamps.current === null) stamps.current = seed();
  return useCallback((key: string, fetcher: () => Promise<unknown>, force = false): Promise<unknown> => {
    if (!force && isFresh(stamps.current![key])) return Promise.resolve();
    // Stamped before the request, so a write that lands while it's in flight
    // still marks this data stale.
    stamps.current![key] = fetchStamp();
    return fetcher();
  }, []);
}
