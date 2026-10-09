import { haversineKm } from '../utils/bestEfforts';
import {
  afterGap, applyFix, buildGpsRunBody, emptyRun, runElapsedSeconds, MAX_ACCURACY_M, type Fix, type RunState,
} from '../utils/gpsRun';

const T0 = Date.UTC(2026, 9, 8, 15, 0, 0);
// 0.0004 degrees of latitude is about 44.5 m
const fix = (i: number, over: Partial<Fix['coords']> = {}, dt = 15_000): Fix => ({
  coords: { latitude: i * 0.0004, longitude: 0, altitude: null, accuracy: 5, altitudeAccuracy: null, ...over },
  timestamp: T0 + i * dt,
});
const walk = (n: number, from: RunState = emptyRun(), start = 0) => {
  let s = from;
  for (let i = start; i < start + n; i += 1) s = applyFix(s, fix(i));
  return s;
};

describe('applyFix', () => {
  it('adds no distance for the first fix, then the distance between fixes', () => {
    const one = applyFix(emptyRun(), fix(0));
    expect(one.coords).toHaveLength(1);
    expect(one.distanceKm).toBe(0);
    const two = applyFix(one, fix(1));
    expect(two.distanceKm).toBeCloseTo(haversineKm(fix(0).coords, fix(1).coords), 6);
  });

  it('drops a fix worse than the accuracy limit and returns the same state', () => {
    const state = walk(2);
    expect(applyFix(state, fix(2, { accuracy: MAX_ACCURACY_M + 1 }))).toBe(state);
    expect(applyFix(state, fix(2, { accuracy: MAX_ACCURACY_M })).coords).toHaveLength(3);
  });

  it('keeps a fix that reports no accuracy', () => {
    expect(applyFix(emptyRun(), fix(0, { accuracy: null })).coords).toHaveLength(1);
  });

  it('never mutates the state it was given', () => {
    const before = walk(2);
    const snapshot = JSON.stringify(before);
    applyFix(before, fix(2, { altitude: 100, altitudeAccuracy: 3 }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('records the fix time and altitude', () => {
    const s = applyFix(emptyRun(), fix(3, { altitude: 42 }));
    expect(s.coords[0]).toMatchObject({ timestamp: T0 + 3 * 15_000, altitude: 42 });
    expect(s.coords[0]).not.toHaveProperty('resumed');
  });
});

describe('a gap (pause, resume or a crash restore)', () => {
  it('marks the next fix resumed and counts no distance across it', () => {
    const before = walk(3);
    const resumedAt = applyFix(afterGap(before), fix(40));
    expect(resumedAt.coords[3]).toMatchObject({ resumed: true });
    expect(resumedAt.distanceKm).toBe(before.distanceKm);
    // ...and only that one fix: distance counts again from the next
    const after = applyFix(resumedAt, fix(41));
    expect(after.coords[4]).not.toHaveProperty('resumed');
    expect(after.distanceKm).toBeGreaterThan(before.distanceKm);
  });

  it('does not use up the gap on a fix that gets dropped', () => {
    const gapped = afterGap(walk(2));
    const dropped = applyFix(gapped, fix(9, { accuracy: 100 }));
    expect(dropped.skipNext).toBe(true);
    expect(applyFix(dropped, fix(10)).coords[2]).toMatchObject({ resumed: true });
  });

  it('starts the climb anchor over, so the jump while away is not elevation gain', () => {
    const climbing = applyFix(applyFix(emptyRun(), fix(0, { altitude: 10, altitudeAccuracy: 3 })), fix(1, { altitude: 20, altitudeAccuracy: 3 }));
    expect(climbing.elevationGainM).toBe(10);
    const resumed = applyFix(afterGap(climbing), fix(2, { altitude: 80, altitudeAccuracy: 3 }));
    expect(resumed.elevationGainM).toBe(10);
  });
});

describe('elevation gain', () => {
  const alt = (...altitudes: number[]) =>
    altitudes.reduce((s, a, i) => applyFix(s, fix(i, { altitude: a, altitudeAccuracy: 3 })), emptyRun());

  it('ignores wobble inside the threshold and counts a real rise', () => {
    expect(alt(100, 102, 99, 103, 101).elevationGainM).toBe(0);
    expect(alt(100, 106).elevationGainM).toBe(6);
  });

  it('skips an altitude the OS rates as inaccurate', () => {
    const s = applyFix(applyFix(emptyRun(), fix(0, { altitude: 100, altitudeAccuracy: 3 })), fix(1, { altitude: 130, altitudeAccuracy: 50 }));
    expect(s.elevationGainM).toBe(0);
  });
});

describe('runElapsedSeconds', () => {
  it('is the banked time plus the running segment', () => {
    expect(runElapsedSeconds(120, T0, T0 + 45_900)).toBe(165);
  });
  it('is just the banked time when nothing is running', () => {
    expect(runElapsedSeconds(120, null, T0 + 999_000)).toBe(120);
  });
});

describe('buildGpsRunBody', () => {
  const base = {
    activity: 'Run' as const, workoutName: '  ', elapsedSec: 600, distanceKm: 2, distanceUnit: 'mi' as const,
    elevationGainM: 0, coords: walk(2).coords, exerciseTemplateId: 7, now: new Date(2026, 9, 8, 23, 30),
  };
  const set = (body: ReturnType<typeof buildGpsRunBody>) => body.exercises[0].sets[0];

  it('sends distance and pace in the display unit', () => {
    const body = buildGpsRunBody(base);
    const miles = 2 / 1.60934;
    expect(set(body).distance).toBeCloseTo(miles, 3);
    expect(set(body).distance_unit).toBe('mi');
    expect(set(body).cardio_duration).toBe(10);
    // pace is minutes per mile, the unit shown, not per km
    expect(set(body).intensity).toBeCloseTo(10 / miles, 3);
    expect(buildGpsRunBody({ ...base, distanceUnit: 'km' }).exercises[0].sets[0]).toMatchObject({ distance: 2, intensity: 5 });
  });

  it('names an unnamed run after its activity and maps the activity to its library exercise', () => {
    expect(buildGpsRunBody(base).workoutName).toBe('Run');
    const ride = buildGpsRunBody({ ...base, activity: 'Cycle', workoutName: ' Loop ' });
    expect(ride.workoutName).toBe('Loop');
    expect(ride.exercises[0]).toMatchObject({ name: 'Cycling', exercise_template_id: 7, exercise_type: 'cardio' });
  });

  it('dates the run by the local day, not the UTC one', () => {
    // 11:30 pm local on the 8th is already the 9th in UTC for a US phone
    expect(buildGpsRunBody(base).date).toBe('2026-10-08');
  });

  it('has no pace for a run with no distance', () => {
    expect(set(buildGpsRunBody({ ...base, distanceKm: 0 })).intensity).toBeNull();
  });

  it('records elevation only when there was some, rounded', () => {
    expect(set(buildGpsRunBody(base)).elevation_gain).toBeNull();
    expect(set(buildGpsRunBody({ ...base, elevationGainM: 12.6 })).elevation_gain).toBe(13);
  });

  it('encodes a route from two points and sends none for fewer', () => {
    expect(typeof buildGpsRunBody(base).exercises[0].route_polyline).toBe('string');
    expect(buildGpsRunBody({ ...base, coords: walk(1).coords }).exercises[0].route_polyline).toBeNull();
  });

  it('sends the best efforts a long enough track holds, and none otherwise', () => {
    expect(buildGpsRunBody(base).exercises[0]).not.toHaveProperty('best_efforts');
    // 45 fixes of 44.5 m every 15 s is a 1.9 km track at about 5:36 per km
    const long = buildGpsRunBody({ ...base, coords: walk(45).coords, distanceKm: 1.9, elapsedSec: 660 });
    expect((long.exercises[0] as { best_efforts?: { milestone_type: string }[] }).best_efforts?.length).toBeGreaterThan(0);
  });

  it('is the same body for the online and the offline save: plain JSON', () => {
    const body = buildGpsRunBody({ ...base, coords: walk(45).coords });
    expect(JSON.parse(JSON.stringify(body))).toEqual(body);
  });
});
