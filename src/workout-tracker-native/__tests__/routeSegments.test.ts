import polylineLib from '@mapbox/polyline';
import {
  asSegments, decodeRouteSegments, encodeSegments, regionFor, splitAtGaps, thinSegments,
} from '../utils/routeSegments';

const pt = (lat: number, lng = 0, resumed = false) => ({ latitude: lat, longitude: lng, ...(resumed ? { resumed: true } : {}) });
const enc = (pts: { latitude: number; longitude: number }[]) => polylineLib.encode(pts.map(p => [p.latitude, p.longitude]));

describe('splitAtGaps', () => {
  it('starts a new segment at every resumed point', () => {
    const route = [pt(1), pt(2), pt(3, 0, true), pt(4), pt(5, 0, true)];
    expect(splitAtGaps(route).map(s => s.map(p => p.latitude))).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('is one segment with no gaps, and none for no points', () => {
    expect(splitAtGaps([pt(1), pt(2), pt(3)])).toHaveLength(1);
    expect(splitAtGaps([])).toEqual([]);
  });
});

describe('asSegments', () => {
  it('treats one line as one segment and drops anything under two points', () => {
    expect(asSegments([pt(1), pt(2)])).toEqual([[pt(1), pt(2)]]);
    expect(asSegments([[pt(1), pt(2)], [pt(3)], []])).toEqual([[pt(1), pt(2)]]);
    expect(asSegments([pt(1)])).toEqual([]);
    expect(asSegments(null)).toEqual([]);
  });
});

describe('decodeRouteSegments', () => {
  const a = [pt(40, -74), pt(40.001, -74)];
  const b = [pt(40.01, -74), pt(40.011, -74)];

  it('reads route_segments when the server has them', () => {
    const segs = decodeRouteSegments({ route_polyline: enc([...a, ...b]), route_segments: [enc(a), enc(b)] });
    expect(segs).toHaveLength(2);
    expect(segs[1][0].latitude).toBeCloseTo(40.01, 5);
  });

  it('falls back to the joined line for a route saved before segments', () => {
    expect(decodeRouteSegments({ route_polyline: enc([...a, ...b]), route_segments: null })).toHaveLength(1);
    expect(decodeRouteSegments({ route_polyline: enc([...a, ...b]) })[0]).toHaveLength(4);
    // An empty list from a route too short to split also falls back
    expect(decodeRouteSegments({ route_polyline: enc(a), route_segments: [] })).toHaveLength(1);
  });

  it('has nothing without a route', () => {
    expect(decodeRouteSegments({ route_polyline: null })).toEqual([]);
    expect(decodeRouteSegments(undefined)).toEqual([]);
  });

  it('round-trips with encodeSegments', () => {
    const segs = decodeRouteSegments({ route_segments: encodeSegments([a, b]) });
    expect(segs.map(s => s.length)).toEqual([2, 2]);
  });
});

describe('thinSegments', () => {
  const long = (n: number, from = 0) => Array.from({ length: n }, (_, i) => pt(from + i * 0.0001));

  it('leaves a short route alone', () => {
    const segs = [long(10), long(10, 1)];
    expect(thinSegments(segs, 500)).toBe(segs);
  });

  it('caps the points across all segments, keeping each one\'s first and last', () => {
    const segs = [long(900), long(900, 1)];
    const thin = thinSegments(segs, 500);
    expect(thin.reduce((n, s) => n + s.length, 0)).toBeLessThanOrEqual(504);
    thin.forEach((s, i) => {
      expect(s[0]).toBe(segs[i][0]);
      expect(s[s.length - 1]).toBe(segs[i][segs[i].length - 1]);
    });
  });
});

describe('regionFor', () => {
  it('frames every segment, not just the first', () => {
    const r = regionFor([[pt(40, -74), pt(40.01, -74)], [pt(40.05, -74.02), pt(40.06, -74.02)]])!;
    expect(r.latitude).toBeCloseTo(40.03, 5);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(0.06);
  });

  it('is null with nothing to frame', () => {
    expect(regionFor([])).toBeNull();
  });
});
