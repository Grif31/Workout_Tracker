import polylineLib from '@mapbox/polyline';

// A GPS route is a list of segments, not one line: a pause, a resume after a
// kill, or a stretch with no GPS fixes leaves a gap, and joining across it drew
// a straight line over ground nobody recorded (TODO.md section 22). Everything
// that draws a route (the live map, Cardio Details, Workout Details and the
// share card) reads it through here, so they all break it in the same places.

export type LatLng = { latitude: number; longitude: number };

/** A recorded route split into segments: a new one starts at every point marked `resumed`. */
export function splitAtGaps<T extends LatLng & { resumed?: boolean }>(coords: T[]): T[][] {
  const segments: T[][] = [];
  for (const c of coords) {
    if (segments.length === 0 || c.resumed) segments.push([c]);
    else segments[segments.length - 1].push(c);
  }
  return segments;
}

/** One line or several, as segments; a segment needs two points to draw. */
export function asSegments(route: LatLng[] | LatLng[][] | null | undefined): LatLng[][] {
  if (!route || route.length === 0) return [];
  const segments = Array.isArray(route[0]) ? (route as LatLng[][]) : [route as LatLng[]];
  return segments.filter(s => s.length >= 2);
}

const decode = (encoded: string): LatLng[] =>
  polylineLib.decode(encoded).map(([lat, lng]: [number, number]) => ({ latitude: lat, longitude: lng }));

/**
 * A saved route's segments. `route_segments` when the server has them; a
 * workout saved before they existed has only `route_polyline`, one joined line.
 * A segment that won't decode is skipped rather than losing the whole route.
 */
export function decodeRouteSegments(ex: { route_polyline?: string | null; route_segments?: string[] | null } | null | undefined): LatLng[][] {
  if (!ex) return [];
  if (Array.isArray(ex.route_segments) && ex.route_segments.length > 0) {
    const out: LatLng[][] = [];
    for (const encoded of ex.route_segments) {
      try { out.push(decode(encoded)); } catch {}
    }
    return asSegments(out);
  }
  if (!ex.route_polyline) return [];
  try { return asSegments([decode(ex.route_polyline)]); } catch { return []; }
}

/**
 * At most about `max` points across all segments, each segment keeping its
 * first and last point so no gap closes up and no end is cut short. Maps and
 * the share card only need a bounded number of vertices; react-native-maps
 * rebuilds a whole Polyline overlay on every change.
 */
export function thinSegments<T extends LatLng>(segments: T[][], max = 500): T[][] {
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (total <= max) return segments;
  const step = Math.ceil(total / max);
  return segments.map(seg => {
    const kept = seg.filter((_, i) => i % step === 0);
    const last = seg[seg.length - 1];
    if (kept[kept.length - 1] !== last) kept.push(last);
    return kept;
  });
}

/** The map region that frames every segment, or null with nothing to frame. */
export function regionFor(segments: LatLng[][], pad = 0.002, minDelta = 0.005) {
  const points = segments.flat();
  if (points.length === 0) return null;
  const lats = points.map(c => c.latitude);
  const lngs = points.map(c => c.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + pad, minDelta),
    longitudeDelta: Math.max(maxLng - minLng + pad, minDelta),
  };
}

/** Each segment as an encoded polyline, for `route_segments`. */
export function encodeSegments(segments: LatLng[][]): string[] {
  return asSegments(segments).map(seg => polylineLib.encode(seg.map(c => [c.latitude, c.longitude])));
}
