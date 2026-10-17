/**
 * Finished workouts reaching Apple Health and Health Connect (TODO.md section
 * 22, Phase 5): the right activity type, a GPS activity's distance, and the
 * time it happened. Each test loads the modules fresh for one platform.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const START = new Date('2026-10-14T17:00:00Z');
const END = new Date('2026-10-14T17:33:06Z');

const mockSaveWorkoutSample = jest.fn(async (..._args: any[]) => ({}));
const mockInsertRecords = jest.fn(async (..._args: any[]) => []);
const mockRequestPermission = jest.fn(async (..._args: any[]) => [] as any[]);
const mockAttachHeartRate = jest.fn();

function load(platform: 'ios' | 'android') {
  let mods: any;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    jest.doMock('@kingstinct/react-native-healthkit', () => ({
      isHealthDataAvailable: () => true,
      saveWorkoutSample: (...a: any[]) => mockSaveWorkoutSample(...a),
    }));
    jest.doMock('react-native-health-connect', () => ({
      initialize: jest.fn(async () => true),
      insertRecords: (...a: any[]) => mockInsertRecords(...a),
      requestPermission: (...a: any[]) => mockRequestPermission(...a),
    }));
    mods = {
      healthKit: require('../utils/healthKit'),
      healthConnect: require('../utils/healthConnect'),
    };
  });
  return mods;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('health_sync_enabled_1', 'true');
});

describe('Apple Health', () => {
  it('records each GPS activity as its own kind, with its distance in metres', async () => {
    const { healthKit } = load('ios');
    for (const [activity, hkType] of [['running', 37], ['cycling', 13], ['walking', 52], ['hiking', 24]] as const) {
      mockSaveWorkoutSample.mockClear();
      await healthKit.syncWorkoutToHealthKit({ type: 'cardio', activity, distanceKm: 1.72, startDate: START, endDate: END, userId: 1 });
      const [type, quantities, start, end, totals] = mockSaveWorkoutSample.mock.calls[0];
      expect(type).toBe(hkType);
      expect(quantities).toEqual([]);
      expect(start).toBe(START);
      expect(end).toBe(END);
      expect(totals).toEqual({ distance: 1720 });
    }
  });

  it('keeps strength as strength and untyped cardio as running, with no distance', async () => {
    const { healthKit } = load('ios');
    await healthKit.syncWorkoutToHealthKit({ type: 'strength', startDate: START, endDate: END, userId: 1 });
    await healthKit.syncWorkoutToHealthKit({ type: 'cardio', startDate: START, endDate: END, userId: 1 });
    expect(mockSaveWorkoutSample.mock.calls.map(c => [c[0], c[4]])).toEqual([[50, undefined], [37, undefined]]);
  });

  it('writes nothing with sync off', async () => {
    await AsyncStorage.removeItem('health_sync_enabled_1');
    const { healthKit } = load('ios');
    await healthKit.syncWorkoutToHealthKit({ type: 'cardio', activity: 'hiking', startDate: START, endDate: END, userId: 1 });
    expect(mockSaveWorkoutSample).not.toHaveBeenCalled();
  });
});

describe('Health Connect', () => {
  it('records strength training as strength, not as a run', async () => {
    // 56 is RUNNING: every strength workout used to go in as a run
    const { healthConnect } = load('android');
    await healthConnect.syncWorkoutToHealthConnect({ type: 'strength', startDate: START, endDate: END, userId: 1 });
    expect(mockInsertRecords.mock.calls[0][0][0]).toMatchObject({ recordType: 'ExerciseSession', exerciseType: 70 });
  });

  it('records untyped cardio as "other", not as a walk', async () => {
    const { healthConnect } = load('android');
    await healthConnect.syncWorkoutToHealthConnect({ type: 'cardio', startDate: START, endDate: END, userId: 1 });
    expect(mockInsertRecords.mock.calls[0][0][0].exerciseType).toBe(0);
    // No distance, so no distance record
    expect(mockInsertRecords).toHaveBeenCalledTimes(1);
  });

  it('records each GPS activity as its own kind, and its distance as a separate record', async () => {
    const { healthConnect } = load('android');
    for (const [activity, hcType] of [['running', 56], ['cycling', 8], ['walking', 79], ['hiking', 37]] as const) {
      mockInsertRecords.mockClear();
      await healthConnect.syncWorkoutToHealthConnect({ type: 'cardio', activity, distanceKm: 2.5, startDate: START, endDate: END, userId: 1 });
      expect(mockInsertRecords.mock.calls[0][0][0]).toMatchObject({
        recordType: 'ExerciseSession', exerciseType: hcType, startTime: START.toISOString(), endTime: END.toISOString(),
      });
      expect(mockInsertRecords.mock.calls[1][0][0]).toEqual({
        recordType: 'Distance', startTime: START.toISOString(), endTime: END.toISOString(),
        distance: { value: 2500, unit: 'meters' },
      });
    }
  });

  it('still records the session when the distance is refused (no Distance permission)', async () => {
    const { healthConnect } = load('android');
    mockInsertRecords.mockImplementationOnce(async () => []).mockImplementationOnce(async () => { throw new Error('SecurityException'); });
    await expect(healthConnect.syncWorkoutToHealthConnect({
      type: 'cardio', activity: 'hiking', distanceKm: 1, startDate: START, endDate: END, userId: 1,
    })).resolves.toBeUndefined();
    expect(mockInsertRecords.mock.calls[0][0][0].recordType).toBe('ExerciseSession');
  });

  it('asks for permission to write distance, without making it required', async () => {
    const { healthConnect } = load('android');
    mockRequestPermission.mockResolvedValueOnce([{ recordType: 'ExerciseSession', accessType: 'write' }]);
    expect(await healthConnect.requestHealthConnectPermission()).toBe(true);
    expect(mockRequestPermission.mock.calls[0][0]).toEqual(expect.arrayContaining([
      { accessType: 'write', recordType: 'Distance' },
    ]));
  });
});

describe('syncFinishedWorkout', () => {
  function loadSync(platform: 'ios' | 'android') {
    let mod: any;
    const hk = jest.fn();
    const hc = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
      jest.doMock('../utils/healthKit', () => ({ syncWorkoutToHealthKit: hk }));
      jest.doMock('../utils/healthConnect', () => ({ syncWorkoutToHealthConnect: hc }));
      jest.doMock('../utils/heartRateSync', () => ({ attachHeartRateToWorkout: mockAttachHeartRate }));
      mod = require('../utils/healthSync');
    });
    return { mod, hk, hc };
  }
  const run = { type: 'cardio' as const, activity: 'hiking' as const, distanceKm: 1.72, startDate: START, endDate: END, userId: 1 };

  it('on iPhone, writes the workout and attaches heart rate to the saved one', () => {
    const { mod, hk, hc } = loadSync('ios');
    mod.syncFinishedWorkout({ ...run, workoutId: 77 });
    expect(hk).toHaveBeenCalledWith(expect.objectContaining({ activity: 'hiking', distanceKm: 1.72, startDate: START }));
    expect(mockAttachHeartRate).toHaveBeenCalledWith({ workoutId: 77, startDate: START, endDate: END, userId: 1 });
    expect(hc).not.toHaveBeenCalled();
  });

  it('skips heart rate without a saved workout to attach it to', () => {
    const { mod, hk } = loadSync('ios');
    mod.syncFinishedWorkout({ ...run, workoutId: null });
    expect(hk).toHaveBeenCalled();
    expect(mockAttachHeartRate).not.toHaveBeenCalled();
  });

  it('on Android, writes to Health Connect', () => {
    const { mod, hk, hc } = loadSync('android');
    mod.syncFinishedWorkout({ ...run, workoutId: 77 });
    expect(hc).toHaveBeenCalledWith(expect.objectContaining({ activity: 'hiking', distanceKm: 1.72 }));
    expect(hk).not.toHaveBeenCalled();
  });
});
