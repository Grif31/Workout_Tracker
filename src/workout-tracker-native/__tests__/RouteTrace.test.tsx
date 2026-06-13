import { projectRoute } from '../components/share/RouteTrace';

const W = 320, H = 230, PAD = 16;

function pathPoints(path: string): { x: number; y: number }[] {
  return path.split(' ').map(seg => {
    const [x, y] = seg.slice(1).split(',').map(Number);
    return { x, y };
  });
}

describe('projectRoute', () => {
  it('returns null for empty or single-point routes', () => {
    expect(projectRoute([], W, H)).toBeNull();
    expect(projectRoute([{ latitude: 40, longitude: -75 }], W, H)).toBeNull();
  });

  it('keeps all points within the padded box', () => {
    const coords = [
      { latitude: 40.0, longitude: -75.0 },
      { latitude: 40.01, longitude: -74.99 },
      { latitude: 40.005, longitude: -74.985 },
      { latitude: 39.998, longitude: -75.002 },
    ];
    const result = projectRoute(coords, W, H, PAD)!;
    for (const p of pathPoints(result.path)) {
      expect(p.x).toBeGreaterThanOrEqual(PAD - 0.1);
      expect(p.x).toBeLessThanOrEqual(W - PAD + 0.1);
      expect(p.y).toBeGreaterThanOrEqual(PAD - 0.1);
      expect(p.y).toBeLessThanOrEqual(H - PAD + 0.1);
    }
  });

  it('flips y so north is up', () => {
    const south = { latitude: 40.0, longitude: -75.0 };
    const north = { latitude: 40.01, longitude: -75.0 };
    const result = projectRoute([south, north], W, H)!;
    // start = south point → larger y (lower on screen) than the north end
    expect(result.start.y).toBeGreaterThan(result.end.y);
  });

  it('handles a perfectly straight east-west route without NaN', () => {
    const coords = [
      { latitude: 40.0, longitude: -75.0 },
      { latitude: 40.0, longitude: -74.99 },
    ];
    const result = projectRoute(coords, W, H)!;
    for (const p of pathPoints(result.path)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('preserves aspect ratio (square route stays square)', () => {
    // ~111m per 0.001° lat; lng span chosen so ground distances match
    const latSpan = 0.01;
    const midLat = 40.0;
    const lngSpan = latSpan / Math.cos((midLat * Math.PI) / 180);
    const coords = [
      { latitude: midLat, longitude: -75.0 },
      { latitude: midLat + latSpan, longitude: -75.0 },
      { latitude: midLat + latSpan, longitude: -75.0 + lngSpan },
      { latitude: midLat, longitude: -75.0 + lngSpan },
    ];
    const result = projectRoute(coords, W, H, PAD)!;
    const pts = pathPoints(result.path);
    const w = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
    const h = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
    expect(w / h).toBeCloseTo(1, 1);
  });
});
