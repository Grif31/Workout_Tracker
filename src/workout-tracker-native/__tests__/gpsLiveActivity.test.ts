import { gpsLiveActivityKey, gpsLiveActivityProps } from '../utils/gpsLiveActivityProps';
import { applyFix, emptyRun, type RunState } from '../utils/gpsRun';
import { fmtPaceValue } from '../utils/cardioFormat';

const NOW = 1_700_000_000_000;
// 0.0009 degrees of latitude is about 100 m; fixes 30 s apart is 5:00 per km
const track = (n: number, dt = 30_000): RunState => {
  let s = emptyRun();
  for (let i = 0; i < n; i += 1) {
    s = applyFix(s, { coords: { latitude: i * 0.0009, longitude: 0, altitude: null, accuracy: 5, altitudeAccuracy: null }, timestamp: NOW - (n - i) * dt });
  }
  return s;
};
const base = {
  activity: 'Run' as const, run: track(21), timing: { base: 0, segmentStart: NOW - 600_000 },
  running: true, unit: 'km' as const, accent: '#abc', now: NOW,
};

describe('gpsLiveActivityProps', () => {
  it('shows distance in the preferred unit, to the hundredth', () => {
    const km = gpsLiveActivityProps(base);
    expect(km).toMatchObject({ distance: base.run.distanceKm.toFixed(2), unit: 'km' });
    const mi = gpsLiveActivityProps({ ...base, unit: 'mi' });
    expect(mi).toMatchObject({ distance: (base.run.distanceKm * 0.621371).toFixed(2), unit: 'mi' });
  });

  it('works out average pace the way the map screen does', () => {
    // 10 minutes over the track's distance
    const p = gpsLiveActivityProps(base);
    expect(p.avgRate).toBe(fmtPaceValue(10 / base.run.distanceKm));
    expect(p.rateUnit).toBe('/km');
  });

  it('shows speed, not pace, for a ride', () => {
    const p = gpsLiveActivityProps({ ...base, activity: 'Cycle', unit: 'mi' });
    expect(p.rateUnit).toBe('mph');
    expect(p.avgRate).toMatch(/^\d+\.\d$/);
    expect(p.icon).toBe('figure.outdoor.cycle');
  });

  it('shows no pace over the first few meters, where it is noise', () => {
    const p = gpsLiveActivityProps({ ...base, run: track(1) });
    expect(p.avgRate).toBe('--:--');
    expect(gpsLiveActivityProps({ ...base, activity: 'Cycle', run: track(1) }).avgRate).toBe('--');
  });

  it('gives a current pace while running, and none while paused', () => {
    expect(gpsLiveActivityProps(base).nowRate).toMatch(/^\d+:\d\d$/);
    expect(gpsLiveActivityProps({ ...base, running: false, timing: { base: 600, segmentStart: null } })).not.toHaveProperty('nowRate');
  });

  it('starts the native clock at the run start, not a floored now - elapsed', () => {
    const p = gpsLiveActivityProps({ ...base, timing: { base: 90, segmentStart: NOW - 600_500 } });
    expect(p.startedAt).toBe(NOW - 600_500 - 90_000);
    expect(p).not.toHaveProperty('pausedAt');
  });

  it('freezes the clock at the banked time while paused', () => {
    const p = gpsLiveActivityProps({ ...base, running: false, timing: { base: 754, segmentStart: null } });
    expect(p.pausedAt).toBe(NOW);
    expect(p.pausedAt! - p.startedAt).toBe(754_000);
  });

  it('has an icon for every activity', () => {
    for (const activity of ['Run', 'Cycle', 'Walk', 'Hike'] as const) {
      expect(gpsLiveActivityProps({ ...base, activity }).icon).toMatch(/^figure\./);
    }
  });

  // UserDefaults refuses a whole payload over one undefined or null
  it('has no undefined or null values, running or paused', () => {
    for (const running of [true, false]) {
      const p = gpsLiveActivityProps({ ...base, running, run: running ? base.run : track(1) });
      expect(JSON.parse(JSON.stringify(p))).toEqual(p);
      expect(Object.values(p).every(v => v !== null && v !== undefined)).toBe(true);
    }
  });
});

describe('gpsLiveActivityKey', () => {
  it('ignores the clock fields, which tick on the lock screen by themselves', () => {
    const a = gpsLiveActivityProps(base);
    expect(gpsLiveActivityKey({ ...a, startedAt: a.startedAt + 9999, pausedAt: 5 })).toBe(gpsLiveActivityKey(a));
  });

  it('changes as the average pace drifts with time, which is worth sending', () => {
    const a = gpsLiveActivityProps(base);
    const later = gpsLiveActivityProps({ ...base, now: NOW + 60_000 });
    expect(gpsLiveActivityKey(later)).not.toBe(gpsLiveActivityKey(a));
  });

  it('changes when the distance shown changes', () => {
    expect(gpsLiveActivityKey(gpsLiveActivityProps(base)))
      .not.toBe(gpsLiveActivityKey(gpsLiveActivityProps({ ...base, run: track(22) })));
  });
});
