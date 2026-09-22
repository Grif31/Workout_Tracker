import { fmtSignedDelta, lengthUnitFor, measurementTrend, trailingAverages } from '../utils/bodyMetrics';

describe('lengthUnitFor', () => {
  it('pairs inches with lbs and cm with kg', () => {
    expect(lengthUnitFor('lbs')).toBe('in');
    expect(lengthUnitFor('kg')).toBe('cm');
  });
});

describe('measurementTrend', () => {
  it('returns null when no entry has the field', () => {
    expect(measurementTrend([{ waist: null }, {}], 'waist')).toBeNull();
  });

  it('skips blank entries when finding latest, previous and first', () => {
    const logs = [{ waist: null }, { waist: 32 }, { waist: null }, { waist: 32.7 }, { waist: 34 }];
    expect(measurementTrend(logs, 'waist')).toEqual({ latest: 32, sinceLast: -0.7, sinceFirst: -2 });
  });

  it('omits since-start when it would repeat since-last', () => {
    expect(measurementTrend([{ chest: 41 }, { chest: 40 }], 'chest')).toEqual({ latest: 41, sinceLast: 1, sinceFirst: null });
    expect(measurementTrend([{ chest: 41 }], 'chest')).toEqual({ latest: 41, sinceLast: null, sinceFirst: null });
  });
});

describe('fmtSignedDelta', () => {
  it('signs with a true minus', () => {
    expect(fmtSignedDelta(1.5)).toBe('+1.5');
    expect(fmtSignedDelta(-0.5)).toBe('−0.5');
    expect(fmtSignedDelta(0)).toBe('0');
  });
});

describe('trailingAverages', () => {
  it('averages the entries within the 7 calendar days ending on each day', () => {
    const logs = [
      { weight: 200, date: '2026-09-01T00:00:00' },
      { weight: 190, date: '2026-09-07T23:00:00' }, // day 7 of the window: included
      { weight: 180, date: '2026-09-08T06:00:00' }, // Sep 1 has now dropped out
    ];
    expect(trailingAverages(logs)).toEqual([200, 195, 185]);
  });

  it('counts several weigh-ins on one day individually', () => {
    const logs = [
      { weight: 181, date: '2026-09-01T07:00:00' },
      { weight: 183, date: '2026-09-01T21:00:00' },
    ];
    expect(trailingAverages(logs)).toEqual([181, 182]);
  });

  it('crosses a DST change without dropping a day', () => {
    const logs = [
      { weight: 180, date: '2026-10-29T00:00:00' },
      { weight: 182, date: '2026-11-04T00:00:00' },
    ];
    expect(trailingAverages(logs)).toEqual([180, 181]);
  });
});
