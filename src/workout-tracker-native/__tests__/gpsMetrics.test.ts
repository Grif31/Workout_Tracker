import {
  addAltitude, currentPaceMinPerKm, currentSpeedKmh, freshClimb, speedInUnit, isCycling, CLIMB_THRESHOLD_M, MAX_CLIMB_GRADE,
} from '../utils/gpsMetrics';

// Feeds altitudes as fixes `stepM` metres apart, the way applyFix does
const climb = (alts: (number | null)[], accuracy: number | null = 5, stepM = 20) => {
  const st = freshClimb();
  return alts.reduce<number>((g, a, i) => g + addAltitude(st, a, accuracy, i === 0 ? 0 : stepM), 0);
};

// Repeatable noise in [-1, 1], so a failing case fails the same way every run
const noise = (seed: number) => {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x / 2147483648) * 2 - 1;
  };
};

describe('elevation gain', () => {
  it('ignores wobble on flat ground', () => {
    expect(climb([100, 103, 99, 102, 98, 103, 100, 97, 102, 100])).toBe(0);
  });

  it('keeps a flat mile with slowly drifting GPS altitude near zero too', () => {
    // Real GPS altitude wanders rather than jitters: a slow drift of about 10 m
    const rand = noise(3);
    let drift = 0;
    const alts = Array.from({ length: 344 }, () => { drift = 0.97 * drift + 0.24 * 10 * rand() * 1.7; return 100 + drift; });
    expect(climb(alts, 8, 5)).toBeLessThan(45);
  });

  it('keeps a flat mile with GPS-sized noise near zero, not thousands of feet', () => {
    // 1.07 mi at a fix every 5 m, altitude flat at 100 m give or take 15 m:
    // the kind of track that came out at 2,477 ft (TODO.md section 22)
    const rand = noise(7);
    const alts = Array.from({ length: 344 }, () => 100 + rand() * 15);
    expect(climb(alts, 8, 5)).toBeLessThan(25);
  });

  it('keeps a real but gentle climb under that noise, roughly', () => {
    // 1.7 km rising 60 m, the same noise on top
    const rand = noise(11);
    const alts = Array.from({ length: 344 }, (_, i) => 100 + (60 * i) / 343 + rand() * 15);
    const gained = climb(alts, 8, 5);
    expect(gained).toBeGreaterThan(30);
    expect(gained).toBeLessThan(110);
  });

  it('counts a steady climb to within the threshold', () => {
    const alts = Array.from({ length: 41 }, (_, i) => 100 + i); // 100 -> 140 m over 800 m
    const gained = climb(alts);
    expect(gained).toBeGreaterThanOrEqual(40 - CLIMB_THRESHOLD_M);
    expect(gained).toBeLessThanOrEqual(40);
  });

  it('undercounts short hills rather than invent climb on the flat', () => {
    // Two 30 m hills, each up and down over 40 fixes 10 m apart. The 10 m
    // threshold and the average's lag cost about half of it; a lower threshold
    // got more of the hills back but read 20 to 50 m on a flat mile. Climb
    // nobody did was the reported bug, so the flat wins until the barometer
    const hill = (from: number, to: number) => Array.from({ length: 40 }, (_, i) => from + ((to - from) * i) / 39);
    const alts = [...hill(100, 130), ...hill(130, 100), ...hill(100, 130), ...hill(130, 100)];
    const gained = climb(alts, 5, 10);
    expect(gained).toBeGreaterThanOrEqual(25);
    expect(gained).toBeLessThanOrEqual(60);
  });

  it('ignores one wild reading', () => {
    expect(climb([100, 100, 100, 160, 100, 100, 100])).toBe(0);
  });

  it('skips readings the OS rates inaccurate', () => {
    expect(climb([100, 140, 140, 140], 40)).toBe(0);
  });

  it('counts nothing while standing still, however the altitude drifts', () => {
    expect(climb([100, 100, 100, 130, 130, 130, 130], 5, 0)).toBe(0);
  });

  it('caps a rise at a grade no trail keeps up', () => {
    // 30 m up over 6 fixes 2 m apart: 12 m of ground
    const gained = climb([100, 100, 100, 130, 130, 130, 130], 5, 2);
    expect(gained).toBeLessThanOrEqual(MAX_CLIMB_GRADE * 12 + 1e-9);
  });
});

describe('current pace', () => {
  // Due north, ~111 m per 0.001 degree
  const pt = (sec: number, lat: number, resumed = false) => ({ latitude: lat, longitude: 0, timestamp: sec * 1000, ...(resumed ? { resumed } : {}) });

  it('reads the last ~30 seconds, not the whole run', () => {
    // Slow for 5 minutes, then 333 m in the last 30 s (= 1:30 /km)
    const pts = [pt(0, 0), pt(300, 0.001), pt(310, 0.002), pt(320, 0.003), pt(330, 0.004)];
    expect(currentPaceMinPerKm(pts)!).toBeCloseTo(1.5, 1);
  });

  it('has nothing to say right after a resume', () => {
    expect(currentPaceMinPerKm([pt(0, 0), pt(600, 0.001, true), pt(602, 0.0011)])).toBeNull();
  });

  it('has nothing to say from a handful of meters', () => {
    expect(currentPaceMinPerKm([pt(0, 0), pt(30, 0.0001)])).toBeNull();
  });
});

describe('current speed', () => {
  const pt = (sec: number, lat: number, speed?: number, resumed = false) => ({
    latitude: lat, longitude: 0, timestamp: sec * 1000,
    ...(speed != null ? { speed } : {}), ...(resumed ? { resumed } : {}),
  });

  it("reads the GPS chip's own speed, the median of the last three", () => {
    // 8, 8 and a 20 m/s blip: 8 m/s is 28.8 km/h
    expect(currentSpeedKmh([pt(0, 0, 8), pt(2, 0.0001, 8), pt(4, 0.0002, 20)], 4000)).toBeCloseTo(28.8, 5);
  });

  it('reacts at once where the position window lags', () => {
    // Ten minutes at walking pace, then a sprint the chip already reads as 10 m/s
    const pts = [pt(0, 0, 1.4), pt(300, 0.004, 1.4), pt(302, 0.0041, 10), pt(304, 0.0043, 10)];
    expect(currentSpeedKmh(pts, 304_000)).toBeCloseTo(36, 5);
  });

  it('falls back to positions when the phone gives no speed, or a stale one', () => {
    const noSpeed = [pt(0, 0), pt(300, 0.001), pt(310, 0.002), pt(320, 0.003), pt(330, 0.004)];
    expect(currentSpeedKmh(noSpeed, 330_000)!).toBeCloseTo(60 / currentPaceMinPerKm(noSpeed)!, 5);
    expect(currentSpeedKmh([pt(0, 0, 8), pt(2, 0.0001, 8)], 60_000)).toBeNull();
  });

  it("doesn't reach back across a resume", () => {
    expect(currentSpeedKmh([pt(0, 0, 2), pt(600, 0.001, 9, true), pt(602, 0.0011, 9)], 602_000)).toBeCloseTo(32.4, 5);
  });
});

describe('speed', () => {
  it('converts to mph or km/h', () => {
    expect(speedInUnit(30, 60, 'km')).toBeCloseTo(30);
    expect(speedInUnit(30, 60, 'mi')).toBeCloseTo(18.64, 1);
  });

  it('knows a ride from a run', () => {
    expect(['Cycling', 'Cycle', 'Bike Ride', 'Running', 'Walking'].map(isCycling)).toEqual([true, true, true, false, false]);
  });
});
