import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  announceFlushResult, discardStuckWorkout, earnedLine, enqueueWorkout, flushQueue, getPendingCount, getStuckCount,
  getStuckWorkouts, initPendingCount, isUploading, onPendingCountChange, onUploadingChange, onWorkoutsUploaded,
  retryStuckWorkout,
} from '../utils/offlineQueue';
import { apiFetch } from '../utils/api';
import { showToast } from '../utils/toast';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
let mockCurrentRoute = 'DashboardHome';
const mockRefNavigate = jest.fn();
jest.mock('../navigation/navigationRef', () => ({ navigationRef: {
  isReady: () => true,
  getCurrentRoute: () => ({ name: mockCurrentRoute }),
  navigate: (...a: any[]) => mockRefNavigate(...a),
} }));
const mockSyncFinishedWorkout = jest.fn();
jest.mock('../utils/healthSync', () => ({ syncFinishedWorkout: (w: any) => mockSyncFinishedWorkout(w) }));

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

  // Section 22: a workout the server refuses is never deleted for the user
  describe('a workout the server keeps refusing', () => {
    const refused = (message = 'Exercise name too long') =>
      ({ ok: false, status: 400, json: () => Promise.resolve({ message }) });
    const stick = async () => {
      await loginAs(7);
      await enqueueWorkout({ workoutName: 'Leg Day', date: '2026-10-14' });
      mockApiFetch.mockResolvedValue(refused());
      for (let i = 0; i < 3; i += 1) await flushQueue();
    };

    it('is kept, marked stuck with the reason, after 3 refusals', async () => {
      await loginAs(7);
      await enqueueWorkout({ workoutName: 'Leg Day', date: '2026-10-14' });
      mockApiFetch.mockResolvedValue(refused());

      expect((await flushQueue()).stuck).toBe(0);
      expect((await flushQueue()).stuck).toBe(0);
      expect((await flushQueue()).stuck).toBe(1);

      const q = await readKey('offline_workout_queue_7');
      expect(q).toHaveLength(1);
      expect(q[0].rejected).toMatchObject({ status: 400, message: 'Exercise name too long' });
    });

    it('is not sent again by later automatic uploads', async () => {
      await stick();
      mockApiFetch.mockClear();
      const result = await flushQueue();
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, stuck: 0, uploaded: [] });
      expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
    });

    it("doesn't hold up the workouts behind it", async () => {
      await stick();
      await enqueueWorkout({ workoutName: 'Push Day', date: '2026-10-15' });
      mockApiFetch.mockResolvedValue({ ok: true, status: 201 });
      expect((await flushQueue()).synced).toBe(1);
      const q = await readKey('offline_workout_queue_7');
      expect(q.map((i: any) => i.payload.workoutName)).toEqual(['Leg Day']);
    });

    it('still counts toward the pending dot, and on its own', async () => {
      await stick();
      expect(getPendingCount()).toBe(1);
      expect(getStuckCount()).toBe(1);
      await initPendingCount();
      expect(getStuckCount()).toBe(1);
    });

    it('is listed with its name, date and reason', async () => {
      await stick();
      expect(await getStuckWorkouts()).toEqual([
        expect.objectContaining({ name: 'Leg Day', date: '2026-10-14', reason: 'Exercise name too long', status: 400 }),
      ]);
    });

    it('leaves the queue when a retry gets through', async () => {
      await stick();
      const [w] = await getStuckWorkouts();
      mockApiFetch.mockResolvedValue({ ok: true, status: 201 });
      expect(await retryStuckWorkout(w.id)).toBe('synced');
      expect(await readKey('offline_workout_queue_7')).toHaveLength(0);
      expect(getPendingCount()).toBe(0);
      expect(getStuckCount()).toBe(0);
    });

    it('stays stuck with the latest reason when a retry is refused again', async () => {
      await stick();
      const [w] = await getStuckWorkouts();
      mockApiFetch.mockResolvedValue(refused('Date is in the future'));
      expect(await retryStuckWorkout(w.id)).toBe('rejected');
      expect((await getStuckWorkouts())[0].reason).toBe('Date is in the future');
    });

    it('stays put when a retry has no connection', async () => {
      await stick();
      const [w] = await getStuckWorkouts();
      mockApiFetch.mockRejectedValue(new Error('Network request failed'));
      expect(await retryStuckWorkout(w.id)).toBe('offline');
      expect(await getStuckWorkouts()).toHaveLength(1);
    });

    it('is deleted only by its Delete, and Delete never touches one still waiting', async () => {
      await stick();
      await enqueueWorkout({ workoutName: 'Push Day', date: '2026-10-15' });
      const waitingId = (await readKey('offline_workout_queue_7')).find((i: any) => !i.rejected).id;
      await discardStuckWorkout(waitingId);
      expect(await readKey('offline_workout_queue_7')).toHaveLength(2);

      const [w] = await getStuckWorkouts();
      await discardStuckWorkout(w.id);
      const q = await readKey('offline_workout_queue_7');
      expect(q.map((i: any) => i.payload.workoutName)).toEqual(['Push Day']);
      expect(getStuckCount()).toBe(0);
    });
  });

  describe('reaching Health once uploaded', () => {
    beforeEach(() => mockSyncFinishedWorkout.mockClear());

    it('uses the details queued with it, and the new id for heart rate', async () => {
      await loginAs(7);
      await enqueueWorkout({ workoutName: 'Hike' }, {
        type: 'cardio', activity: 'hiking', distanceKm: 1.72,
        startedAt: '2026-10-14T17:00:00.000Z', endedAt: '2026-10-14T17:33:06.000Z',
      });
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 99 }) });
      await flushQueue();
      expect(mockSyncFinishedWorkout).toHaveBeenCalledWith({
        type: 'cardio', activity: 'hiking', distanceKm: 1.72,
        startDate: new Date('2026-10-14T17:00:00.000Z'), endDate: new Date('2026-10-14T17:33:06.000Z'),
        userId: 7, workoutId: 99,
      });
    });

    it('estimates for a workout queued by an older build, without details', async () => {
      await loginAs(7);
      await AsyncStorage.setItem('offline_workout_queue_7', JSON.stringify([{
        id: 'old1', enqueuedAt: '2026-10-14T18:00:00.000Z',
        payload: { workoutName: 'Legs', duration: 45, exercises: [{ name: 'Squat', exercise_type: 'strength' }] },
      }]));
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 5 }) });
      await flushQueue();
      expect(mockSyncFinishedWorkout).toHaveBeenCalledWith(expect.objectContaining({
        type: 'strength', endDate: new Date('2026-10-14T18:00:00.000Z'),
        startDate: new Date('2026-10-14T17:15:00.000Z'), workoutId: 5,
      }));
    });

    it('waits for the upload to work', async () => {
      await loginAs(7);
      await enqueueWorkout({ workoutName: 'Hike' }, { type: 'cardio', startedAt: '2026-10-14T17:00:00.000Z', endedAt: '2026-10-14T17:30:00.000Z' });
      mockApiFetch.mockResolvedValue({ ok: false, status: 503 });
      await flushQueue();
      expect(mockSyncFinishedWorkout).not.toHaveBeenCalled();
    });
  });

  it('gives two workouts queued in the same millisecond different ids', async () => {
    await loginAs(7);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
    try {
      await enqueueWorkout({ workoutName: 'A' });
      await enqueueWorkout({ workoutName: 'B' });
    } finally {
      now.mockRestore();
    }
    const ids = (await readKey('offline_workout_queue_7')).map((i: any) => i.id);
    expect(new Set(ids).size).toBe(2);
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

  it('does not double-post when two flushes overlap', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    let resolvePost: (v: any) => void = () => {};
    mockApiFetch.mockImplementation(() => new Promise(r => { resolvePost = r; }));

    const first = flushQueue();
    const second = flushQueue();
    await new Promise(r => setImmediate(r));
    resolvePost({ ok: true });
    const results = await Promise.all([first, second]);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(results.map(r => r.synced).sort()).toEqual([0, 1]);
    expect(await readKey('offline_workout_queue_7')).toHaveLength(0);
  });

  it('allows a new flush once the previous one has finished, even if it threw', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(flushQueue()).rejects.toThrow('disk full');

    mockApiFetch.mockResolvedValue({ ok: true });
    const { synced } = await flushQueue();
    expect(synced).toBe(1);
  });

  it('keeps a workout saved offline while a flush is in progress', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Morning' });
    let resolvePost: (v: any) => void = () => {};
    mockApiFetch.mockImplementation(() => new Promise(r => { resolvePost = r; }));

    const flushing = flushQueue();
    await new Promise(r => setImmediate(r));
    await new Promise(r => setTimeout(r, 2)); // distinct Date.now()-based id
    await enqueueWorkout({ workoutName: 'Evening' });
    resolvePost({ ok: true });
    await flushing;

    const q = await readKey('offline_workout_queue_7');
    expect(q.map((i: any) => i.payload.workoutName)).toEqual(['Evening']);
  });

  it('treats 429 as transient and keeps retrying', async () => {
    await loginAs(7);
    await enqueueWorkout({ workoutName: 'Push Day' });
    mockApiFetch.mockResolvedValue({ ok: false, status: 429 });
    for (let i = 0; i < 5; i++) await flushQueue();
    expect(await readKey('offline_workout_queue_7')).toHaveLength(1);
  });

  it('posts queued workouts in order and removes only the ones that synced', async () => {
    await loginAs(7);
    await AsyncStorage.setItem('offline_workout_queue_7', JSON.stringify([
      { id: 'a', payload: { workoutName: 'One' }, enqueuedAt: new Date().toISOString() },
      { id: 'b', payload: { workoutName: 'Two' }, enqueuedAt: new Date().toISOString() },
    ]));
    mockApiFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true });

    const { synced } = await flushQueue();

    expect(synced).toBe(1);
    expect(mockApiFetch.mock.calls.map(c => JSON.parse(c[1].body).workoutName)).toEqual(['One', 'Two']);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workouts');
    expect(mockApiFetch.mock.calls[0][1].method).toBe('POST');
    expect((await readKey('offline_workout_queue_7')).map((i: any) => i.id)).toEqual(['a']);
  });

  describe('after an upload', () => {
    const saved = {
      id: 42, new_prs: [{ exercise_name: 'Walk', pr_type: 'best_distance', value: 3 }],
      new_achievements: [{ key: 'workouts_10' }], is_first_workout: false, total_volume: 0, muscles: [],
    };
    const summaryOf = (body: any) => ({ workoutId: body.id, prs: body.new_prs, newAchievements: body.new_achievements });

    beforeEach(async () => {
      mockCurrentRoute = 'DashboardHome';
      mockRefNavigate.mockReset();
      (showToast as jest.Mock).mockReset();
      await loginAs(7);
      await enqueueWorkout({ workoutName: 'Evening Walk' });
    });

    it('keeps the summary the save would have opened', async () => {
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve(saved) });
      const { uploaded } = await flushQueue();
      expect(uploaded).toHaveLength(1);
      expect(uploaded![0].name).toBe('Evening Walk');
      expect(uploaded![0].summary).toMatchObject({ workoutName: 'Evening Walk', ...summaryOf(saved) });
    });

    it('reports the upload while it runs and what landed, before the count drops', async () => {
      const states: boolean[] = [];
      const events: string[] = [];
      const offA = onUploadingChange(v => states.push(v));
      const offB = onWorkoutsUploaded(list => events.push(`uploaded ${list[0].name}, count ${getPendingCount()}`));
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve(saved) });
      await initPendingCount();
      await flushQueue();
      offA(); offB();
      expect(states).toEqual([true, false]);
      expect(isUploading()).toBe(false);
      expect(events).toEqual(['uploaded Evening Walk, count 1']);
      expect(getPendingCount()).toBe(0);
    });

    it('says nothing was uploaded when the server is down', async () => {
      const events: unknown[] = [];
      const off = onWorkoutsUploaded(list => events.push(list));
      mockApiFetch.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
      expect((await flushQueue()).uploaded).toEqual([]);
      off();
      expect(events).toEqual([]);
    });

    it("names one upload, what it earned, and opens its summary on tap", async () => {
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve(saved) });
      announceFlushResult(await flushQueue());
      const [message, options] = (showToast as jest.Mock).mock.calls[0];
      expect(options.title).toBe('Evening Walk uploaded');
      expect(message).toBe('A new PR and a new badge. Tap to see your summary.');
      options.onPress();
      expect(mockRefNavigate).toHaveBeenCalledWith('DashboardTab', expect.objectContaining({
        screen: 'WorkoutSummary', initial: false, params: expect.objectContaining({ workoutId: 42 }),
      }));
    });

    it('offers no tap while a workout or run is open', async () => {
      mockCurrentRoute = 'GPSCardio';
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve(saved) });
      announceFlushResult(await flushQueue());
      const [message, options] = (showToast as jest.Mock).mock.calls[0];
      expect(message).toBe('A new PR and a new badge.');
      expect(options.onPress).toBeUndefined();
    });

    it('counts PRs across several uploads', async () => {
      await enqueueWorkout({ workoutName: 'Morning Walk' });
      mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve(saved) });
      announceFlushResult(await flushQueue());
      const [message, options] = (showToast as jest.Mock).mock.calls[0];
      expect(options.title).toBe('2 workouts uploaded');
      expect(message).toBe('2 new PRs between them.');
    });
  });

  describe('earnedLine', () => {
    const line = (prs: number, badges: number) => earnedLine({
      prs: Array(prs).fill({}), newAchievements: Array(badges).fill({}),
    } as any);
    it('reads naturally for each mix', () => {
      expect(line(0, 0)).toBe('');
      expect(line(1, 0)).toBe('A new PR.');
      expect(line(3, 0)).toBe('3 new PRs.');
      expect(line(0, 1)).toBe('A new badge.');
      expect(line(0, 2)).toBe('2 new badges.');
      expect(line(2, 1)).toBe('2 new PRs and a new badge.');
    });
  });
});
