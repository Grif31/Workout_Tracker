import AsyncStorage from '@react-native-async-storage/async-storage';

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
