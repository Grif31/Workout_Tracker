import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExerciseCache, setExerciseCache, loadExerciseList } from '../utils/exerciseCache';
import { apiFetch } from '../utils/api';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));
const mockApiFetch = apiFetch as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const cached = [{ id: 1, name: 'Squat' }];
const fresh = [{ id: 1, name: 'Squat' }, { id: 2, name: 'My Custom Press' }];

const ok = (data: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

describe('exerciseCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApiFetch.mockReset();
    jest.useFakeTimers({ now: new Date('2026-09-17T10:00:00'), doNotFake: ['setImmediate', 'nextTick'] });
  });
  afterEach(() => jest.useRealTimers());

  describe('get/set', () => {
    it("stores per user so one account never sees another account's custom exercises", async () => {
      await setExerciseCache(cached, 7);
      expect(await AsyncStorage.getItem('exercise_list_cache_7')).not.toBeNull();
      expect(await getExerciseCache(7)).toEqual(cached);
      expect(await getExerciseCache(9)).toBeNull();
      expect(await getExerciseCache(null)).toBeNull();
    });

    it('falls back to the unsuffixed key without a user id', async () => {
      await setExerciseCache(cached);
      expect(await AsyncStorage.getItem('exercise_list_cache')).not.toBeNull();
      expect(await getExerciseCache(undefined)).toEqual(cached);
    });

    it('expires after 24 hours', async () => {
      await setExerciseCache(cached, 7);
      jest.setSystemTime(Date.now() + DAY - 1);
      expect(await getExerciseCache(7)).toEqual(cached);
      jest.setSystemTime(Date.now() + 1);
      expect(await getExerciseCache(7)).toBeNull();
    });

    it('treats corrupt cache data as a miss', async () => {
      await AsyncStorage.setItem('exercise_list_cache_7', '{nope');
      expect(await getExerciseCache(7)).toBeNull();
    });
  });

  describe('loadExerciseList', () => {
    it('shows cached exercises first, then the network result, and refreshes the cache', async () => {
      await setExerciseCache(cached, 7);
      mockApiFetch.mockReturnValue(ok(fresh));
      const updates: any[] = [];

      const result = await loadExerciseList(7, data => updates.push(data));

      expect(updates).toEqual([cached, fresh]);
      expect(result).toEqual({ ok: true, usedCache: true });
      await new Promise(r => setImmediate(r));
      expect(await getExerciseCache(7)).toEqual(fresh);
    });

    it('goes straight to the network on a cold cache', async () => {
      mockApiFetch.mockReturnValue(ok(fresh));
      const updates: any[] = [];

      const result = await loadExerciseList(7, data => updates.push(data));

      expect(updates).toEqual([fresh]);
      expect(result).toEqual({ ok: true, usedCache: false });
    });

    it('ignores an expired cache', async () => {
      await setExerciseCache(cached, 7);
      jest.setSystemTime(Date.now() + DAY + 1);
      mockApiFetch.mockReturnValue(ok(fresh));
      const updates: any[] = [];

      await loadExerciseList(7, data => updates.push(data));
      expect(updates).toEqual([fresh]);
    });

    it('keeps the cached list when the server errors, without overwriting the cache', async () => {
      await setExerciseCache(cached, 7);
      mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
      const updates: any[] = [];

      const result = await loadExerciseList(7, data => updates.push(data));

      expect(updates).toEqual([cached]);
      expect(result).toEqual({ ok: false, usedCache: true });
      expect(await getExerciseCache(7)).toEqual(cached);
    });

    it('reports failure without throwing when offline and uncached', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network request failed'));
      const onUpdate = jest.fn();

      const result = await loadExerciseList(7, onUpdate);

      expect(onUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: false, usedCache: false });
    });
  });
});
