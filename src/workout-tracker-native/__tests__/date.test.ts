import { toLocalDateStr } from '../utils/date';

describe('toLocalDateStr', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses the local calendar day late in the evening', () => {
    // toISOString() would roll this to the next day anywhere west of UTC.
    expect(toLocalDateStr(new Date(2026, 2, 5, 23, 59, 59))).toBe('2026-03-05');
  });

  it('uses the local calendar day just after midnight', () => {
    // ...and to the previous day anywhere east of UTC.
    expect(toLocalDateStr(new Date(2026, 2, 5, 0, 0, 1))).toBe('2026-03-05');
  });

  it('handles year boundaries and leap days', () => {
    expect(toLocalDateStr(new Date(2025, 11, 31, 23, 30))).toBe('2025-12-31');
    expect(toLocalDateStr(new Date(2028, 1, 29, 12))).toBe('2028-02-29');
  });

  it('matches the local getters, not UTC, at every hour of the day', () => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(2026, 6, 4, h, 30);
      expect(toLocalDateStr(d)).toBe('2026-07-04');
    }
  });
});
