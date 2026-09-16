import { fmtDuration, fmtPace, fmtPaceValue, fmtPaceForUnit } from '../utils/cardioFormat';

describe('fmtDuration', () => {
  it('shows h + m (no seconds) once the duration is an hour or more', () => {
    expect(fmtDuration(90)).toBe('1h 30m');
    expect(fmtDuration(60)).toBe('1h 0m');
    expect(fmtDuration(125.5)).toBe('2h 5m');
  });

  it('shows m + s under an hour', () => {
    expect(fmtDuration(30)).toBe('30m 0s');
    expect(fmtDuration(5.5)).toBe('5m 30s');
  });

  it('shows only seconds under a minute', () => {
    expect(fmtDuration(0)).toBe('0s');
    expect(fmtDuration(0.5)).toBe('30s');
  });

  it('rounds the fractional-minute remainder to whole seconds', () => {
    // 0.99 min = 59.4s -> 59s, still under a minute
    expect(fmtDuration(0.99)).toBe('59s');
    // 2m + 0.5083.. -> ~30s
    expect(fmtDuration(2.508333)).toBe('2m 30s');
  });
});

describe('fmtPace', () => {
  it('returns min:ss per unit distance', () => {
    expect(fmtPace(30, 6)).toBe('5:00');   // 5 min/km
    expect(fmtPace(25, 5)).toBe('5:00');
  });

  it('zero-pads the seconds', () => {
    expect(fmtPace(31, 6)).toBe('5:10');   // 5.1666 min -> 5:10
    expect(fmtPace(28, 6)).toBe('4:40');
  });

  it('guards against zero / negative distance', () => {
    expect(fmtPace(30, 0)).toBe('--:--');
    expect(fmtPace(30, -1)).toBe('--:--');
  });

  it('handles a near-whole-minute pace without dropping digits', () => {
    // 4.999 min/unit: guard against NaN / empty output at the rounding edge.
    expect(fmtPace(4.999, 1)).toMatch(/^\d+:\d{2}$/);
  });

  it('carries a 60-second rounding into the minute', () => {
    // 4.999 min rounds to 60s, which must read 5:00 and never 4:60
    expect(fmtPace(4.999, 1)).toBe('5:00');
  });
});

describe('fmtPaceValue', () => {
  it('formats a pace that is already per display unit', () => {
    expect(fmtPaceValue(5)).toBe('5:00');
    expect(fmtPaceValue(5.5)).toBe('5:30');
  });

  it('carries instead of emitting :60', () => {
    expect(fmtPaceValue(4.999)).toBe('5:00');
    expect(fmtPaceValue(9.9999)).toBe('10:00');
  });

  it('guards against zero, negative and non-finite paces', () => {
    expect(fmtPaceValue(0)).toBe('--:--');
    expect(fmtPaceValue(-3)).toBe('--:--');
    expect(fmtPaceValue(Infinity)).toBe('--:--');
    expect(fmtPaceValue(NaN)).toBe('--:--');
  });
});

describe('fmtPaceForUnit', () => {
  it('leaves a km pace alone', () => {
    expect(fmtPaceForUnit(5, 'km')).toBe('5:00');
  });

  it('converts a km pace to the slower per-mile figure', () => {
    // 5:00/km is 8:03/mi
    expect(fmtPaceForUnit(5, 'mi')).toBe('8:03');
  });
});
