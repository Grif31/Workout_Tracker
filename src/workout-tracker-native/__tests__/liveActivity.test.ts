import { currentExerciseName, liveActivityProps, nextSetLines } from '../utils/liveActivityProps';

const NOW = 1_700_000_000_000;
const bench = { name: 'Bench Press', sets: [{ done: true, reps: '8', weight: '185' }, { done: true, reps: '8', weight: '185' }, { done: false, reps: '6', weight: '190.0' }] };
const row = { name: 'Barbell Row', sets: [{ done: false }, { done: false }] };
const base = { workoutName: 'Push Day', exercises: [bench, row], elapsedSeconds: 125, timerPaused: false, rest: null, accent: '#abc', weightUnit: 'lbs', now: NOW };

describe('currentExerciseName', () => {
  it('is the first exercise with a set left', () => {
    expect(currentExerciseName([bench, row])).toBe('Bench Press');
    expect(currentExerciseName([{ ...bench, sets: [{ done: true }] }, row])).toBe('Barbell Row');
  });
  it('is the last exercise once every set is done', () => {
    expect(currentExerciseName([{ ...bench, sets: [{ done: true }] }, { ...row, sets: [{ done: true }] }])).toBe('Barbell Row');
  });
  it('is undefined with no exercises', () => {
    expect(currentExerciseName([])).toBeUndefined();
  });
});

describe('nextSetLines', () => {
  it("names the set position and its reps-first target in the user's unit", () => {
    expect(nextSetLines([bench, row], 'lbs')).toEqual({ setLine: 'Next set  ·  3 of 3', next: '6 × 190 lbs' });
    expect(nextSetLines([bench, row], 'kg')?.next).toBe('6 × 190 kg');
  });

  it('shows reps alone for a bodyweight set or one with no weight yet', () => {
    const pushUp = { name: 'Push-up', equipment: 'Bodyweight', sets: [{ reps: '15', weight: '0' }] };
    expect(nextSetLines([pushUp], 'lbs')).toEqual({ setLine: 'Next set  ·  1 of 1', next: '15 reps' });
    expect(nextSetLines([{ name: 'Curl', sets: [{ reps: '10', weight: '' }] }], 'lbs')?.next).toBe('10 reps');
  });

  it('gives the position alone while the next set has no reps typed', () => {
    expect(nextSetLines([row], 'lbs')).toEqual({ setLine: 'Next set  ·  1 of 2' });
  });

  it('shows a timed hold as its time', () => {
    const plank = { name: 'Plank', exercise_type: 'duration', sets: [{ cardio_duration: '0.75' }, { cardio_duration: '1.5' }] };
    expect(nextSetLines([plank], 'lbs')).toEqual({ setLine: 'Next set  ·  1 of 2', next: '45s' });
    expect(nextSetLines([{ ...plank, sets: [{ done: true, cardio_duration: '0.75' }, { cardio_duration: '1.5' }] }], 'lbs')?.next).toBe('1:30');
  });

  it('has nothing for cardio, for finished work or for no exercises', () => {
    expect(nextSetLines([{ name: 'Run', exercise_type: 'cardio', sets: [{ done: false }] }], 'lbs')).toBeNull();
    expect(nextSetLines([{ name: 'Bench', sets: [{ done: true, reps: '5', weight: '100' }] }], 'lbs')).toBeNull();
    expect(nextSetLines([], 'lbs')).toBeNull();
  });

  it('follows the current exercise, not the first', () => {
    const done = { ...bench, sets: bench.sets.map(s => ({ ...s, done: true })) };
    expect(nextSetLines([done, { name: 'Curl', sets: [{ done: true, reps: '10', weight: '30' }, { reps: '12', weight: '25' }] }], 'lbs'))
      .toEqual({ setLine: 'Next set  ·  2 of 2', next: '12 × 25 lbs' });
  });
});

describe('liveActivityProps', () => {
  it('reports progress as the share of sets done', () => {
    expect(liveActivityProps(base).progress).toBeCloseTo(2 / 5);
    expect(liveActivityProps({ ...base, exercises: [] }).progress).toBe(0);
  });

  it('carries the next set target, and none once everything is done', () => {
    expect(liveActivityProps(base)).toMatchObject({ setLine: 'Next set  ·  3 of 3', next: '6 × 190 lbs' });
    const finished = liveActivityProps({ ...base, exercises: [{ name: 'Bench', sets: [{ done: true, reps: '5', weight: '100' }] }] });
    expect(finished).not.toHaveProperty('setLine');
    expect(finished).not.toHaveProperty('next');
  });

  it('counts sets and names the current exercise', () => {
    expect(liveActivityProps(base)).toMatchObject({ name: 'Push Day', exercise: 'Bench Press', sets: '2/5 sets' });
  });

  it('falls back to "Workout" for an unnamed workout', () => {
    expect(liveActivityProps({ ...base, workoutName: '  ' }).name).toBe('Workout');
  });

  it('starts the native timer elapsed seconds ago, so it keeps ticking while the app is suspended', () => {
    const p = liveActivityProps(base);
    expect(p.startedAt).toBe(NOW - 125_000);
    expect(p).not.toHaveProperty('pausedAt');
  });

  it('freezes a paused timer at the moment of the update', () => {
    const p = liveActivityProps({ ...base, timerPaused: true });
    expect(p.pausedAt).toBe(NOW);
    // pausedAt - startedAt is the elapsed time the lock screen shows
    expect(p.pausedAt! - p.startedAt).toBe(125_000);
  });

  it('sends a running rest as its finish time and a paused one as the time left', () => {
    const running = liveActivityProps({ ...base, rest: { endsAt: NOW + 30_000 } });
    expect(running.restEndsAt).toBe(NOW + 30_000);
    expect(running).not.toHaveProperty('restPausedLeft');
    const paused = liveActivityProps({ ...base, rest: { pausedLeft: 41.6 } });
    expect(paused.restPausedLeft).toBe(42);
    expect(paused).not.toHaveProperty('restEndsAt');
  });

  it('sends no rest fields when not resting', () => {
    const p = liveActivityProps(base);
    expect(p).not.toHaveProperty('restEndsAt');
    expect(p).not.toHaveProperty('restPausedLeft');
  });

  // UserDefaults refuses a whole payload over one undefined/null (see widgetLayouts.test.ts)
  it('has no undefined or null values', () => {
    for (const rest of [null, { endsAt: NOW + 1000 }, { pausedLeft: 5 }] as const) {
      for (const timerPaused of [false, true]) {
        const p = liveActivityProps({ ...base, rest, timerPaused });
        expect(JSON.parse(JSON.stringify(p))).toEqual(p);
        expect(Object.values(p).every(v => v !== null && v !== undefined)).toBe(true);
      }
    }
  });
});

describe('controller', () => {
  const props = liveActivityProps(base);

  function load(platform: 'ios' | 'android', factory?: object) {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    jest.doMock('expo-widgets', () => ({ widgetsDirectory: null }));
    jest.doMock('../utils/widgetImages', () => ({ prepareWidgetImages: async () => ({ logoDark: null, logoLight: null }) }));
    if (factory) jest.doMock('../widgets/WorkoutLiveActivity', () => ({ __esModule: true, default: factory }));
    else jest.doMock('../widgets/WorkoutLiveActivity', () => { throw new Error('no native module'); });
    return require('../utils/liveActivity') as typeof import('../utils/liveActivity');
  }

  function fakeFactory() {
    const instances: { update: jest.Mock; end: jest.Mock }[] = [];
    return {
      instances,
      start: jest.fn((_props?: unknown) => { const a = { update: jest.fn(async () => {}), end: jest.fn(async () => { instances.splice(instances.indexOf(a), 1); }) }; instances.push(a); return a; }),
      getInstances: jest.fn(() => [...instances]),
    };
  }

  it('starts once, then updates the running activity instead of starting a second', async () => {
    const f = fakeFactory();
    const la = load('ios', f);
    expect(await la.startOrUpdateLiveActivity(props)).toBe(true);
    expect(await la.startOrUpdateLiveActivity(props)).toBe(true);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.instances[0].update).toHaveBeenCalledTimes(1);
  });

  it('applies calls in order: an end queued after a start leaves nothing running', async () => {
    const f = fakeFactory();
    const la = load('ios', f);
    la.startOrUpdateLiveActivity(props);
    await la.endLiveActivity();
    expect(f.instances).toHaveLength(0);
    expect(la.isLiveActivityActive()).toBe(false);
  });

  it('reports active after a start, so the notification fallback stays quiet', async () => {
    const la = load('ios', fakeFactory());
    await la.startOrUpdateLiveActivity(props);
    expect(la.isLiveActivityActive()).toBe(true);
  });

  it('counts an activity left by an earlier launch as active', () => {
    const f = fakeFactory();
    f.start(props);
    expect(load('ios', f).isLiveActivityActive()).toBe(true);
  });

  it('reports false when the start fails, so the notification is posted instead', async () => {
    const f = fakeFactory();
    f.start.mockImplementation(() => { throw new Error('Live Activities are disabled'); });
    const la = load('ios', f);
    expect(await la.startOrUpdateLiveActivity(props)).toBe(false);
    expect(la.isLiveActivityActive()).toBe(false);
  });

  it('adds the logos from the App Group to what it sends, and still sends without them', async () => {
    const mountWith = (prepare: jest.Mock, f: ReturnType<typeof fakeFactory>) => {
      jest.resetModules();
      jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
      jest.doMock('../widgets/WorkoutLiveActivity', () => ({ __esModule: true, default: f }));
      jest.doMock('expo-widgets', () => ({ widgetsDirectory: '/group/widgets' }));
      jest.doMock('../utils/widgetImages', () => ({ prepareWidgetImages: prepare }));
      return require('../utils/liveActivity') as typeof import('../utils/liveActivity');
    };

    const prepare = jest.fn(async (_dir?: string) => ({ logoDark: 'file:///g/dark.png', logoLight: null }));
    const f = fakeFactory();
    const la = mountWith(prepare, f);
    await la.startOrUpdateLiveActivity(props);
    expect(prepare).toHaveBeenCalledWith('/group/widgets');
    expect(f.start.mock.calls[0][0]).toMatchObject({ logo: 'file:///g/dark.png' });
    await la.startOrUpdateLiveActivity(props);
    expect(prepare).toHaveBeenCalledTimes(1);

    const failing = jest.fn(async (_dir?: string): Promise<never> => { throw new Error('copy failed'); });
    const f2 = fakeFactory();
    expect(await mountWith(failing, f2).startOrUpdateLiveActivity(props)).toBe(true);
    expect(f2.start.mock.calls[0][0]).not.toHaveProperty('logo');
  });

  it('is a no-op on Android and when the native module is missing', async () => {
    for (const la of [load('android', fakeFactory()), load('ios')]) {
      expect(await la.startOrUpdateLiveActivity(props)).toBe(false);
      await expect(la.endLiveActivity()).resolves.toBeUndefined();
      expect(la.isLiveActivityActive()).toBe(false);
    }
  });
});
