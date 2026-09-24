import { parseApiDate, toLocalDateStr, timeAgo } from '../utils/date';

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

describe('parseApiDate', () => {
  it('reads a bare date as that local calendar day', () => {
    // new Date('2026-01-01') is UTC midnight: Dec 31 in the Americas.
    const d = parseApiDate('2026-01-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 1]);
  });

  it('parses a full timestamp normally', () => {
    const d = parseApiDate('2026-01-01T15:30:00');
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 15, 30]);
  });
});

describe('test timezone', () => {
  it('runs west of UTC so UTC date bugs fail here, not just for users', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBeGreaterThan(0);
  });
});

describe('timeAgo', () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('reads under a minute as "just now"', () => {
    expect(timeAgo(at(0))).toBe('just now');
    expect(timeAgo(at(59 * 1000))).toBe('just now');
  });

  it('steps up through minutes, hours and days at each boundary', () => {
    expect(timeAgo(at(60 * 1000))).toBe('1m ago');
    expect(timeAgo(at(59 * 60 * 1000))).toBe('59m ago');
    expect(timeAgo(at(60 * 60 * 1000))).toBe('1h ago');
    expect(timeAgo(at(23 * 60 * 60 * 1000))).toBe('23h ago');
    expect(timeAgo(at(24 * 60 * 60 * 1000))).toBe('1d ago');
    expect(timeAgo(at(9 * 24 * 60 * 60 * 1000))).toBe('9d ago');
  });
});
