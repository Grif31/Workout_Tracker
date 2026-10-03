import { addAltitude, currentPaceMinPerKm, speedInUnit, isCycling, type ClimbState } from '../utils/gpsMetrics';

const climb = (alts: (number | null)[], accuracy: number | null = 5) => {
  const st: ClimbState = { anchor: null };
  return alts.reduce<number>((g, a) => g + addAltitude(st, a, accuracy), 0);
};

describe('elevation gain', () => {
  it('ignores wobble on flat ground', () => {
    // ±3 m noise around 100 m: the old >2 m rule counted every upward wobble
    expect(climb([100, 103, 99, 102, 98, 103, 100, 97, 102, 100])).toBe(0);
  });

  it('counts a real climb', () => {
    const alts = Array.from({ length: 41 }, (_, i) => 100 + i); // 100 -> 140 m
    expect(climb(alts)).toBe(40);
  });

  it('counts each climb of a rolling route', () => {
    expect(climb([100, 120, 100, 120])).toBe(40);
  });

  it('skips readings the OS rates inaccurate', () => {
    expect(climb([100, 140], 40)).toBe(0);
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

describe('speed', () => {
  it('converts to mph or km/h', () => {
    expect(speedInUnit(30, 60, 'km')).toBeCloseTo(30);
    expect(speedInUnit(30, 60, 'mi')).toBeCloseTo(18.64, 1);
  });

  it('knows a ride from a run', () => {
    expect(['Cycling', 'Cycle', 'Bike Ride', 'Running', 'Walking'].map(isCycling)).toEqual([true, true, true, false, false]);
  });
});
