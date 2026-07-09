import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueWorkout, flushQueue, initPendingCount, onPendingCountChange } from '../utils/offlineQueue';
import { apiFetch } from '../utils/api';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = apiFetch as jest.Mock;

const loginAs = (id: number) => AsyncStorage.setItem('user', JSON.stringify({ id, username: `user${id}` }));
const readKey = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');

describe('offlineQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApiFetch.mockReset();
  });

  it('enqueues under the logged-in user key', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    const q = await readKey('offline_workout_queue_7');
    expect(q).toHaveLength(1);
    expect(q[0].payload.workoutName).toBe('Push Day');
  });

  it('does not enqueue when logged out', async () => {
    await enqueueWorkout({ workoutName: 'Orphan' });
    expect(await AsyncStorage.getItem('offline_workout_queue')).toBeNull();
  });

  it('dedupes identical payloads', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    await enqueueWorkout({ workoutName: 'Push Day' });
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
  });

  it('flushes only the current user queue and leaves other users parked', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'A workout' });
    // Simulate account switch: user 9 has their own parked queue
    await AsyncStorage.setItem('offline_workout_queue_9', JSON.stringify([
      { id: 'x1', payload: { workoutName: 'B workout' }, enqueuedAt: new Date().toISOString() },
    ]));

    mockApiFetch.mockResolvedValue({ ok: true });
    const { synced } = await flushQueue();

    expect(synced).toBe(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).workoutName).toBe('A workout');
    expect(await readKey('offline_workout_queue_7')).toHaveLength(0);
    // User 9's workout untouched — waits for user 9 to log back in
    expect(await readKey('offline_workout_queue_9')).toHaveLength(1);
  });

  it('does not flush when logged out', async () => {
    await AsyncStorage.setItem('offline_workout_queue_7', JSON.stringify([
      { id: 'x1', payload: { workoutName: 'Parked' }, enqueuedAt: new Date().toISOString() },
    ]));
    const { synced } = await flushQueue();
    expect(synced).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('keeps network-failed items queued for the next flush', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    mockApiFetch.mockRejectedValue(new Error('network'));
    const { synced } = await flushQueue();
    expect(synced).toBe(0);
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
  });

  it('keeps 5xx-failed items queued indefinitely', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
    for (let i = 0; i < 5; i++) await flushQueue();
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
  });

  it('drops permanently rejected items after 3 attempts', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Bad Payload' });
    mockApiFetch.mockResolvedValue({ ok: false, status: 400 });

    let result = await flushQueue();
    expect(result.dropped).toBe(0);
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);

    result = await flushQueue();
    expect(result.dropped).toBe(0);

    result = await flushQueue();
    expect(result.dropped).toBe(1);
    expect(await readKey('offline_workout_queue_7')).toHaveLength(0);
  });

  it('treats 401 as transient and keeps retrying', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    mockApiFetch.mockResolvedValue({ ok: false, status: 401 });
    for (let i = 0; i < 5; i++) await flushQueue();
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
  });

  it('migrates the legacy device-level queue into the current user queue', async () => {
    await loginAs(7);
    await AsyncStorage.setItem('offline_workout_queue', JSON.stringify([
      { id: 'legacy1', payload: { workoutName: 'Old workout' }, enqueuedAt: new Date().toISOString() },
    ]));

    let count = -1;
    const unsub = onPendingCountChange(n => { count = n; });
    await initPendingCount();
    unsub();

    expect(count).toBe(1);
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
    expect(await AsyncStorage.getItem('offline_workout_queue')).toBeNull();
  });
});
