import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

const CACHE_KEY = 'exercise_list_cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheShape = { exercises: object[]; savedAt: number };

function cacheKey(userId?: number | string | null): string {
  return userId ? `${CACHE_KEY}_${userId}` : CACHE_KEY;
}

export async function getExerciseCache(userId?: number | string | null): Promise<object[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const { exercises, savedAt }: CacheShape = JSON.parse(raw);
    return Date.now() - savedAt < TTL_MS ? exercises : null;
  } catch {
    return null;
  }
}

export async function setExerciseCache(exercises: object[], userId?: number | string | null): Promise<void> {
  await AsyncStorage.setItem(
    cacheKey(userId),
    JSON.stringify({ exercises, savedAt: Date.now() }),
  );
}

/**
 * Stale-while-revalidate exercise list fetch: paints cached data immediately
 * if present (skips the network round-trip most screens were blocking on),
 * then always fetches the network in the background and calls back again
 * with the authoritative result — so a screen showing this right after the
 * user creates a custom exercise still ends up correct, just briefly preceded
 * by whatever was cached.
 */
export async function loadExerciseList(
  userId: number | string | null | undefined,
  onUpdate: (exercises: any[]) => void,
): Promise<{ ok: boolean; usedCache: boolean }> {
  const cached = await getExerciseCache(userId);
  const usedCache = !!cached;
  if (cached) onUpdate(cached);
  try {
    const res = await apiFetch('/api/exercises');
    if (res.ok) {
      const data = await res.json();
      onUpdate(data);
      setExerciseCache(data, userId);
      return { ok: true, usedCache };
    }
    return { ok: false, usedCache };
  } catch {
    return { ok: false, usedCache };
  }
}
