import { extractBestEfforts, bestEffortLabel, type TrackPoint } from '../utils/bestEfforts';

// One degree of latitude is ~111.195 km on the sphere haversine assumes, so a
// straight north leg lets a test ask for an exact distance at an exact pace.
const KM_PER_DEG_LAT = (6371 * Math.PI) / 180;

/**
 * A straight northbound track. `paces` is one entry per leg: [km, minPerKm].
 * Points land every `stepKm`, so a window boundary usually falls between
 * samples — which is the case interpolation has to get right.
 */
function track(paces: [number, number][], stepKm = 0.05, startMs = 1_700_000_000_000): TrackPoint[] {
  const points: TrackPoint[] = [{ latitude: 40, longitude: -74, timestamp: startMs }];
  let lat = 40;
  let t = startMs;
  for (const [km, minPerKm] of paces) {
    const steps = Math.round(km / stepKm);
    for (let i = 0; i < steps; i++) {
      lat += stepKm / KM_PER_DEG_LAT;
      t += stepKm * minPerKm * 60 * 1000;
      points.push({ latitude: lat, longitude: -74, timestamp: t });
    }
  }
  return points;
}

const distanceEffort = (efforts: ReturnType<typeof extractBestEfforts>, km: number) =>
  efforts.find(e => e.milestone_type === 'distance' && e.distance_km === km);
const durationEffort = (efforts: ReturnType<typeof extractBestEfforts>, min: number) =>
  efforts.find(e => e.milestone_type === 'duration' && e.duration_min === min);

describe('extractBestEfforts', () => {
  it('reads an even-paced run at the pace it was run', () => {
    // 2 km at 5:00/km
    const efforts = extractBestEfforts(track([[2, 5]]));
    expect(distanceEffort(efforts, 1.0)!.duration_min).toBeCloseTo(5, 2);
    expect(distanceEffort(efforts, 0.4)!.duration_min).toBeCloseTo(2, 2);
  });

  it('finds the fast rep inside an interval session, not the session average', () => {
    // This is the whole point: 1 km warmup at 7:00, a hard 1 km at 4:00,
    // 1 km cooldown at 7:00. The bout average is 6:00/km, so the backend's
    // whole-run extrapolation would call this a 6:00 kilometre.
    const efforts = extractBestEfforts(track([[1, 7], [1, 4], [1, 7]]));
    expect(distanceEffort(efforts, 1.0)!.duration_min).toBeCloseTo(4, 1);
  });

  it('pulls a faster 1K out of a negative split', () => {
    const efforts = extractBestEfforts(track([[1, 6], [1, 4.5]]));
    expect(distanceEffort(efforts, 1.0)!.duration_min).toBeCloseTo(4.5, 1);
  });

  it('excludes paused time from the window', () => {
    // 1 km at 5:00, a 10-minute breather, then 1 km at 5:00. Without the
    // resumed flag the middle window would absorb the whole pause.
    const first = track([[1, 5]]);
    const second = track([[1, 5]], 0.05, first[first.length - 1].timestamp + 10 * 60 * 1000);
    // Continue northward from where the first leg stopped
    const lastLat = first[first.length - 1].latitude;
    const joined: TrackPoint[] = [
      ...first,
      ...second.map((p, i) => ({
        ...p,
        latitude: lastLat + (p.latitude - 40),
        resumed: i === 0 ? true : undefined,
      })),
    ];
    const efforts = extractBestEfforts(joined);
    expect(distanceEffort(efforts, 1.0)!.duration_min).toBeCloseTo(5, 1);
  });

  it('interpolates a boundary that falls between two samples', () => {
    // Samples every 300 m: an exact 1 km never lands on one, so a scan that
    // only used whole samples would report the 1.2 km time instead.
    const efforts = extractBestEfforts(track([[2.4, 5]], 0.3));
    expect(distanceEffort(efforts, 1.0)!.duration_min).toBeCloseTo(5, 1);
  });

  it('skips milestones longer than the run', () => {
    const efforts = extractBestEfforts(track([[2, 5]]));
    expect(distanceEffort(efforts, 5.0)).toBeUndefined();
    expect(distanceEffort(efforts, 42.195)).toBeUndefined();
  });

  it('rejects a GPS spike rather than banking an impossible PR', () => {
    // A jump of half a kilometre between consecutive fixes, one second apart
    const spiked: TrackPoint[] = [
      { latitude: 40, longitude: -74, timestamp: 0 },
      { latitude: 40.002, longitude: -74, timestamp: 1000 },
      { latitude: 40.006, longitude: -74, timestamp: 2000 },
      { latitude: 40.01, longitude: -74, timestamp: 3000 },
    ];
    expect(distanceEffort(extractBestEfforts(spiked), 0.4)).toBeUndefined();
  });

  it('ignores a window carried by too few points to mean anything', () => {
    const sparse: TrackPoint[] = [
      { latitude: 40, longitude: -74, timestamp: 0 },
      { latitude: 40.02, longitude: -74, timestamp: 15 * 60 * 1000 },
    ];
    expect(extractBestEfforts(sparse)).toEqual([]);
  });

  it('measures how far the runner got inside a duration milestone', () => {
    // 4 km at 5:00 then 2 km at 4:00 — 28 minutes of running. The best 10
    // minutes are the closing 8 at 4:00 (2 km) plus 2 at 5:00 (0.4 km).
    const efforts = extractBestEfforts(track([[4, 5], [2, 4]]));
    expect(durationEffort(efforts, 10)!.distance_km).toBeCloseTo(2.4, 1);
    // Same window logic over 20 minutes: 2 km fast plus 12 minutes at 5:00
    expect(durationEffort(efforts, 20)!.distance_km).toBeCloseTo(4.4, 1);
    // The run never reached an hour
    expect(durationEffort(efforts, 60)).toBeUndefined();
  });

  it('returns nothing for a track too short to measure', () => {
    expect(extractBestEfforts([])).toEqual([]);
    expect(extractBestEfforts([{ latitude: 40, longitude: -74, timestamp: 0 }])).toEqual([]);
  });

  it('never reports a time for a distance it did not cover', () => {
    const efforts = extractBestEfforts(track([[1.2, 5]]));
    for (const e of efforts.filter(x => x.milestone_type === 'distance')) {
      expect(e.distance_km).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('bestEffortLabel', () => {
  it('names the milestone an effort was measured against', () => {
    expect(bestEffortLabel({ milestone_type: 'distance', distance_km: 1.60934, duration_min: 7 })).toBe('1 Mile');
    expect(bestEffortLabel({ milestone_type: 'duration', distance_km: 2.2, duration_min: 10 })).toBe('10 min');
  });
});
