import polylineLib from '@mapbox/polyline';
import { haversineKm } from '../utils/bestEfforts';
import {
  HEALTH_ACTIVITY, runWindow,
  afterGap, applyFix, buildGpsRunBody, emptyRun, fmtClock, runElapsedSeconds, MAX_ACCURACY_M, type Fix, type RunState,
  isAutoPaused, movingSeconds, settleStop, stopGraceSec, SPEED_CAP_KMH, type FixRules,
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

  it('scans a ride against the ride milestones', () => {
    type Efforts = { best_efforts?: { milestone_type: string; distance_km: number }[] };
    const track = { ...base, coords: walk(45).coords, distanceKm: 1.9, elapsedSec: 660 };
    const kms = (body: ReturnType<typeof buildGpsRunBody>) => ((body.exercises[0] as Efforts).best_efforts ?? [])
      .filter(e => e.milestone_type === 'distance').map(e => e.distance_km);
    expect(kms(buildGpsRunBody(track))).toContain(1);
    // A ride's shortest milestone is 5K, so 1.9 km holds none
    expect(kms(buildGpsRunBody({ ...track, activity: 'Cycle' }))).toEqual([]);
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
  it('maps each activity to its Health kind', () => {
    expect(HEALTH_ACTIVITY).toEqual({ Run: 'running', Cycle: 'cycling', Walk: 'walking', Hike: 'hiking' });
  });
});

describe('checkpointIntervalMs', () => {
  const { checkpointIntervalMs, CHECKPOINT_EVERY_MS, CHECKPOINT_FULL_RATE_POINTS, CHECKPOINT_MAX_MS } = require('../utils/gpsRun');

  it('checkpoints every 5 s for the first 20 minutes or so of fixes', () => {
    expect(checkpointIntervalMs(0)).toBe(CHECKPOINT_EVERY_MS);
    expect(checkpointIntervalMs(CHECKPOINT_FULL_RATE_POINTS)).toBe(CHECKPOINT_EVERY_MS);
  });

  it('stretches in step with the route, so bytes written per second stay flat', () => {
    expect(checkpointIntervalMs(CHECKPOINT_FULL_RATE_POINTS * 2)).toBe(CHECKPOINT_EVERY_MS * 2);
    // An hour of fixes, about 1,800 points
    expect(checkpointIntervalMs(1800)).toBe(15_000);
    const bytesPerMs = (n: number) => n / checkpointIntervalMs(n);
    expect(bytesPerMs(3000)).toBeCloseTo(bytesPerMs(1200));
  });

  it('never waits longer than a minute, the most a kill can cost', () => {
    expect(checkpointIntervalMs(50_000)).toBe(CHECKPOINT_MAX_MS);
  });
});

describe('fmtClock', () => {
  it('shows m:ss under an hour and h:mm:ss above', () => {
    expect(fmtClock(5)).toBe('0:05');
    expect(fmtClock(725)).toBe('12:05');
    expect(fmtClock(3909)).toBe('1:05:09');
  });
});

describe('auto-pause and max speed', () => {
  const RIDE: FixRules = { stopBelowKmh: 3, speedCapKmh: 110 };
  const OFF: FixRules = { stopBelowKmh: null, speedCapKmh: 110 };
  // A fix `m` metres north of the start, `sec` seconds in, with a Doppler speed in m/s
  const at = (sec: number, m: number, speed: number | null = 5): Fix => ({
    coords: { latitude: m / 111_195, longitude: 0, altitude: null, accuracy: 5, altitudeAccuracy: null, speed },
    timestamp: T0 + sec * 1000,
  });
  const feed = (fixes: Fix[], rules = RIDE, from = emptyRun()) => fixes.reduce((s, f) => applyFix(s, f, rules), from);
  // Riding at 5 m/s (18 km/h): a fix every 2 s, 10 m apart, for `sec` seconds from `startSec`
  const riding = (startSec: number, sec: number, startM = 0) =>
    Array.from({ length: sec / 2 + 1 }, (_, i) => at(startSec + i * 2, startM + i * 10));
  const clock = { base: 0, segmentStart: T0 };

  it('counts nothing as stopped while riding', () => {
    const s = feed(riding(0, 60));
    expect(s.stoppedSec).toBe(0);
    expect(movingSeconds(s, clock, T0 + 60_000, 3)).toBe(60);
  });

  it('takes a stop out of the moving time once the next fix shows how slow it was', () => {
    // 60 s riding, then the next fix comes 90 s later only 12 m on: a red light
    const s = feed([...riding(0, 60), at(150, 312, 2), ...riding(152, 20, 322)]);
    expect(s.stoppedSec).toBe(90);
    expect(movingSeconds(s, clock, T0 + 172_000, 3)).toBe(172 - 90);
    // The distance still counts: auto-pause only stops the clock
    expect(s.distanceKm).toBeCloseTo(0.422, 2);
  });

  it('freezes the moving clock during a stop, before the next fix arrives', () => {
    const s = feed(riding(0, 60));
    // A fix is kept every 8 m or more, so silence past the grace means standing still
    expect(stopGraceSec(3)).toBeCloseTo(11.6, 5);
    // A rougher fix needs more ground before it counts, so the next one is due later
    expect(stopGraceSec(3, 20)).toBeCloseTo(26, 5);
    expect(isAutoPaused(s, clock, T0 + 67_000, 3)).toBe(false);
    expect(isAutoPaused(s, clock, T0 + 80_000, 3)).toBe(true);
    expect(movingSeconds(s, clock, T0 + 80_000, 3)).toBe(60);
    expect(movingSeconds(s, clock, T0 + 120_000, 3)).toBe(60);
  });

  it('reads a hop past the wander as stopped when the chip says 0', () => {
    // 12 m in 2 s would be 21.6 km/h
    const s = feed([...riding(0, 10), at(12, 62, 0)]);
    expect(s.stoppedSec).toBe(2);
    expect(isAutoPaused(s, clock, T0 + 12_500, 3)).toBe(true);
  });

  describe('standing still', () => {
    // A phone on a parked bike for 3 minutes: a fix every 2 s wandering up to
    // 9 m around the spot, at 10 m accuracy, with jumpy speeds. A real
    // 1170x2532 capture drew a scribble, 0.09 mi, 42 s moving and 14 mph.
    const wander = (startSec: number, accuracy = 10) => Array.from({ length: 90 }, (_, i): Fix => {
      const angle = i * 2.4;
      const r = 3 + ((i * 7) % 7);
      return {
        coords: {
          latitude: (r * Math.cos(angle)) / 111_195, longitude: (r * Math.sin(angle)) / 111_195,
          altitude: null, accuracy, altitudeAccuracy: null, speed: (i % 5) * 1.5,
        },
        timestamp: T0 + (startSec + i * 2) * 1000,
      };
    });

    it('adds no distance, no moving time and no top speed', () => {
      const fixes = wander(0);
      const s = feed(fixes);
      expect(s.coords).toHaveLength(1);
      expect(s.distanceKm).toBe(0);
      expect(s.maxSpeedKmh).toBe(0);
      expect(movingSeconds(s, clock, T0 + 180_000, 3)).toBeLessThanOrEqual(12);
    });

    it('drops the wander with auto-pause off too', () => {
      const s = feed(wander(0), OFF);
      expect(s.distanceKm).toBe(0);
      expect(s.maxSpeedKmh).toBe(0);
    });

    it('needs more ground when the fix is rougher', () => {
      const first = feed([at(0, 0)]);
      const rough = (m: number) => ({ ...at(2, m), coords: { ...at(2, m).coords, accuracy: 25 } });
      expect(applyFix(first, rough(20), RIDE)).toBe(first);
      expect(applyFix(first, rough(26), RIDE).coords).toHaveLength(2);
    });

    it('starts again where the rider is after a pause, however close', () => {
      const s = afterGap(feed(riding(0, 10)));
      expect(applyFix(s, at(100, 52), RIDE).coords).toHaveLength(7);
    });
  });

  it('changes nothing with auto-pause off', () => {
    const s = feed([...riding(0, 60), at(150, 304, 2)], OFF);
    expect(s.stoppedSec).toBe(0);
    expect(isAutoPaused(s, clock, T0 + 300_000, null)).toBe(false);
    expect(movingSeconds(s, clock, T0 + 300_000, null)).toBe(300);
  });

  it('banks a stop in progress when the clock is paused, so the moving time holds', () => {
    const s = feed(riding(0, 60));
    const settled = settleStop(s, clock, T0 + 100_000, 3);
    expect(settled.stoppedSec).toBe(40);
    // Paused at 100 s of clock, 40 of it stopped
    expect(movingSeconds(settled, { base: 100, segmentStart: null }, T0 + 500_000, 3)).toBe(60);
  });

  it('is not auto-paused the moment a run resumes', () => {
    const s = afterGap(feed(riding(0, 60)));
    // Resumed at 300 s: the last fix is long ago, but the clock only just started
    expect(isAutoPaused(s, { segmentStart: T0 + 300_000 }, T0 + 302_000, 3)).toBe(false);
  });

  it('takes max speed as a median of three, so one spike never sets it', () => {
    const s = feed([at(0, 0, 5), at(2, 10, 5), at(4, 20, 30), at(6, 30, 5), at(8, 40, 5)]);
    expect(s.maxSpeedKmh).toBeCloseTo(18, 5);
  });

  it('leaves out readings past the activity cap', () => {
    // 40 m/s is 144 km/h: no bike on these roads
    const s = feed([at(0, 0, 40), at(2, 80, 40), at(4, 160, 40)]);
    expect(s.maxSpeedKmh).toBe(0);
    expect(SPEED_CAP_KMH.Cycle).toBeLessThan(144);
  });

  it('works from positions when the phone reports no speed', () => {
    // 30 m every 4 s is 27 km/h
    const s = feed([0, 1, 2, 3].map(i => at(i * 4, i * 30, null)));
    expect(s.maxSpeedKmh).toBeCloseTo(27, 0);
  });
});

describe('buildGpsRunBody with auto-pause', () => {
  it('saves the moving time on the set and the time out on the workout, with the top speed', () => {
    const body = buildGpsRunBody({
      activity: 'Cycle', workoutName: 'Loop', elapsedSec: 3600, movingSec: 3000, maxSpeedKmh: 41.27,
      distanceKm: 25, distanceUnit: 'km', elevationGainM: 0, coords: walk(2).coords,
      exerciseTemplateId: 7, now: new Date(2026, 9, 8, 12),
    });
    const [set] = body.exercises[0].sets;
    expect(body.duration).toBe(60);
    expect(set.cardio_duration).toBe(50);
    expect(set.intensity).toBeCloseTo(2, 5);
    expect(set.max_speed).toBe(41.3);
  });

  it('sends no top speed when there was none', () => {
    const body = buildGpsRunBody({
      activity: 'Run', workoutName: '', elapsedSec: 600, distanceKm: 2, distanceUnit: 'km',
      elevationGainM: 0, coords: walk(2).coords, exerciseTemplateId: 7, now: new Date(2026, 9, 8, 12),
    });
    expect(body.exercises[0].sets[0].max_speed).toBeNull();
    expect(body.exercises[0].sets[0].cardio_duration).toBe(10);
  });
});
