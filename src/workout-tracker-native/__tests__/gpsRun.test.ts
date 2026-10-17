import polylineLib from '@mapbox/polyline';
import { haversineKm } from '../utils/bestEfforts';
import {
  activityForExerciseName, HEALTH_ACTIVITY, runWindow,
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
    // A real climb first: 10 fixes 44.5 m apart rising 3 m each
    let climbing = emptyRun();
    for (let i = 0; i < 10; i += 1) climbing = applyFix(climbing, fix(i, { altitude: 10 + i * 3, altitudeAccuracy: 3 }));
    const gained = climbing.elevationGainM;
    expect(gained).toBeGreaterThan(0);
    let resumed = afterGap(climbing);
    for (let i = 10; i < 14; i += 1) resumed = applyFix(resumed, fix(i, { altitude: 200, altitudeAccuracy: 3 }));
    expect(resumed.elevationGainM).toBe(gained);
  });
});

describe('elevation gain', () => {
  const alt = (...altitudes: number[]) =>
    altitudes.reduce((s, a, i) => applyFix(s, fix(i, { altitude: a, altitudeAccuracy: 3 })), emptyRun());

  it('ignores wobble inside the threshold and counts a real rise', () => {
    expect(alt(100, 102, 99, 103, 101).elevationGainM).toBe(0);
    // A sustained 20 m rise over fixes 44.5 m apart, held long enough for the average to settle
    expect(alt(...Array(5).fill(100), ...Array(15).fill(120)).elevationGainM).toBe(20);
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

describe('a stretch with no GPS fixes', () => {
  // 0.0004 degrees of latitude is about 44.5 m
  const at = (i: number, secondsAfterStart: number, over: Partial<Fix['coords']> = {}): Fix => ({
    coords: { latitude: i * 0.0004, longitude: 0, altitude: null, accuracy: 5, altitudeAccuracy: null, ...over },
    timestamp: T0 + secondsAfterStart * 1000,
  });

  it('starts a new segment and adds no distance when the next fix is long after and far away', () => {
    let s = applyFix(applyFix(emptyRun(), at(0, 0)), at(1, 2));
    const before = s.distanceKm;
    // 90 s later and about 445 m on: nobody recorded the path between
    s = applyFix(s, at(11, 92));
    expect(s.coords[2]).toMatchObject({ resumed: true });
    expect(s.distanceKm).toBe(before);
  });

  it('keeps a slow stretch joined: a long wait but a short hop is standing still', () => {
    let s = applyFix(emptyRun(), at(0, 0));
    s = applyFix(s, at(1, 300)); // five minutes, 44 m
    expect(s.coords[1]).not.toHaveProperty('resumed');
    expect(s.distanceKm).toBeGreaterThan(0);
  });

  it('keeps a quick long hop joined: fixes dropped under trees for under a minute', () => {
    let s = applyFix(emptyRun(), at(0, 0));
    s = applyFix(s, at(4, 40)); // 40 s, 178 m
    expect(s.coords[1]).not.toHaveProperty('resumed');
  });

  it('counts no climb across the gap', () => {
    let s = applyFix(emptyRun(), at(0, 0, { altitude: 100, altitudeAccuracy: 3 }));
    s = applyFix(s, at(11, 90, { altitude: 160, altitudeAccuracy: 3 }));
    expect(s.elevationGainM).toBe(0);
  });

  it('sends the route split at the gap, and the joined line for older builds', () => {
    let s = emptyRun();
    [at(0, 0), at(1, 2), at(2, 4), at(12, 100), at(13, 102)].forEach(f => { s = applyFix(s, f); });
    const body = buildGpsRunBody({
      activity: 'Hike', workoutName: '', elapsedSec: 102, distanceKm: s.distanceKm, distanceUnit: 'mi',
      elevationGainM: 0, coords: s.coords, exerciseTemplateId: null, now: new Date(T0),
    });
    const ex = body.exercises[0] as { route_polyline: string | null; route_segments?: string[] };
    expect(ex.route_segments).toHaveLength(2);
    expect(polylineLib.decode(ex.route_segments![0])).toHaveLength(3);
    expect(polylineLib.decode(ex.route_segments![1])).toHaveLength(2);
    expect(polylineLib.decode(ex.route_polyline!)).toHaveLength(5);
  });

  it('never lets a best effort span the gap', () => {
    // 40 s per 44.5 m is about 15 min/km; the gap would make it look far faster
    let s = emptyRun();
    for (let i = 0; i < 12; i += 1) s = applyFix(s, at(i, i * 40));
    // 70 s and about 310 m on: a pace a runner could manage (so the plausibility
    // filter alone wouldn't catch it), and far quicker than this walk
    s = applyFix(s, at(18, 12 * 40 + 70));
    for (let i = 19; i < 30; i += 1) s = applyFix(s, at(i, 12 * 40 + 70 + (i - 18) * 40));
    const body = buildGpsRunBody({
      activity: 'Hike', workoutName: '', elapsedSec: 1000, distanceKm: s.distanceKm, distanceUnit: 'km',
      elevationGainM: 0, coords: s.coords, exerciseTemplateId: null, now: new Date(T0),
    });
    const efforts = (body.exercises[0] as { best_efforts?: { milestone_type: string; distance_km: number; duration_min: number }[] }).best_efforts ?? [];
    for (const e of efforts.filter(x => x.milestone_type === 'distance')) {
      // Never quicker than the pace actually walked
      expect(e.duration_min / e.distance_km).toBeGreaterThan(12);
    }
  });
});

describe('runWindow, for Health', () => {
  it('is the first fix to the last, not the moment of saving', () => {
    const coords = walk(5).coords;
    const w = runWindow(coords, 999, T0 + 3_600_000);
    expect(w.startDate.getTime()).toBe(coords[0].timestamp);
    expect(w.endDate.getTime()).toBe(coords[4].timestamp);
  });

  it('falls back to the clock for a run without fixes', () => {
    const w = runWindow([], 600, T0);
    expect(w.endDate.getTime()).toBe(T0);
    expect(w.startDate.getTime()).toBe(T0 - 600_000);
  });
});

describe('activities in Health', () => {
  it('maps each activity to its Health kind, and back from a saved exercise name', () => {
    expect(HEALTH_ACTIVITY).toEqual({ Run: 'running', Cycle: 'cycling', Walk: 'walking', Hike: 'hiking' });
    expect(activityForExerciseName('Hiking')).toBe('Hike');
    expect(activityForExerciseName('Bench Press')).toBeNull();
  });
});

