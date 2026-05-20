import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'exercise_list_cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheShape = { exercises: object[]; savedAt: number };

export async function getExerciseCache(): Promise<object[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { exercises, savedAt }: CacheShape = JSON.parse(raw);
    return Date.now() - savedAt < TTL_MS ? exercises : null;
  } catch {
    return null;
  }
}

export async function setExerciseCache(exercises: object[]): Promise<void> {
  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ exercises, savedAt: Date.now() }),
  );
}
