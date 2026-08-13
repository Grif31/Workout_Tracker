import { fmtPrValue, fmtPrDelta, fmtPrContext, fmtMinSec, nearPrHint, type PREventItem } from '../utils/prFormat';

const base: Omit<PREventItem, 'pr_type' | 'value' | 'improved_by'> = {
  id: 1,
  exercise_template_id: 1,
  workout_id: 1,
  weight_context: null,
  previous_value: null,
  achieved_at: '2026-08-01T00:00:00',
};

const ev = (pr_type: PREventItem['pr_type'], value: number, improved_by: number | null = null, weight_context: number | null = null): PREventItem =>
  ({ ...base, pr_type, value, improved_by, weight_context });

describe('fmtMinSec', () => {
  it('formats minutes as m:ss', () => {
    expect(fmtMinSec(24.5)).toBe('24:30');
    expect(fmtMinSec(5)).toBe('5:00');
  });
});

describe('fmtPrValue', () => {
  it('formats max_weight with unit', () => {
    expect(fmtPrValue(ev('max_weight', 245), 'lbs', 'mi')).toBe('245 lbs');
  });

  it('formats estimated_1rm with one decimal', () => {
    expect(fmtPrValue(ev('estimated_1rm', 262.5), 'lbs', 'mi')).toBe('262.5 lbs');
  });

  it('formats max_reps as reps', () => {
    expect(fmtPrValue(ev('max_reps', 10), 'lbs', 'mi')).toBe('10 reps');
  });

  it('formats best_time as m:ss', () => {
    expect(fmtPrValue(ev('best_time', 27.5), 'lbs', 'mi')).toBe('27:30');
  });

  it('converts best_distance km to the display unit', () => {
    expect(fmtPrValue(ev('best_distance', 5), 'lbs', 'km')).toBe('5.00 km');
    expect(fmtPrValue(ev('best_distance', 5), 'lbs', 'mi')).toBe('3.11 mi');
  });
});

describe('fmtPrContext', () => {
  it('shows the rep-record weight context', () => {
    expect(fmtPrContext(ev('max_reps', 10, null, 185), 'lbs')).toBe('@ 185 lbs');
  });

  it('labels weight 0 as bodyweight', () => {
    expect(fmtPrContext(ev('max_reps', 10, null, 0), 'lbs')).toBe('Bodyweight');
  });

  it('returns null for types whose label carries the context', () => {
    expect(fmtPrContext(ev('max_weight', 245), 'lbs')).toBeNull();
    expect(fmtPrContext(ev('best_time', 27.5, null, 5), 'lbs')).toBeNull();
  });
});

describe('fmtPrDelta', () => {
  it('returns null on a first-ever PR', () => {
    expect(fmtPrDelta(ev('max_weight', 245, null), 'lbs', 'mi')).toBeNull();
  });

  it('formats weight improvements', () => {
    expect(fmtPrDelta(ev('max_weight', 245, 20), 'lbs', 'mi')).toBe('+20 lbs');
  });

  it('formats rep improvements with singular/plural', () => {
    expect(fmtPrDelta(ev('max_reps', 10, 1), 'lbs', 'mi')).toBe('+1 rep');
    expect(fmtPrDelta(ev('max_reps', 12, 2), 'lbs', 'mi')).toBe('+2 reps');
  });

  it('formats sub-minute time improvements in seconds', () => {
    // improved_by is already sign-normalized positive by the backend
    expect(fmtPrDelta(ev('best_time', 27.5, 0.5), 'lbs', 'mi')).toBe('30s faster');
  });

  it('formats minute-plus time improvements as m:ss', () => {
    expect(fmtPrDelta(ev('best_time', 24, 2.5), 'lbs', 'mi')).toBe('2:30 faster');
  });

  it('converts distance improvements to the display unit', () => {
    expect(fmtPrDelta(ev('best_distance', 6, 0.5), 'lbs', 'km')).toBe('+0.50 km');
  });
});

describe('nearPrHint', () => {
  it('returns null with no PR on record', () => {
    expect(nearPrHint('245', null, 'lbs')).toBeNull();
    expect(nearPrHint('245', undefined, 'lbs')).toBeNull();
  });

  it('returns null for empty or zero weight', () => {
    expect(nearPrHint('', 250, 'lbs')).toBeNull();
    expect(nearPrHint('0', 250, 'lbs')).toBeNull();
  });

  it('returns null when more than 5% below the PR', () => {
    expect(nearPrHint('200', 250, 'lbs')).toBeNull();
  });

  it('hints within 5% below the PR', () => {
    expect(nearPrHint('245', 250, 'lbs')).toBe('5 lbs from your 250 lbs PR');
    expect(nearPrHint('247.5', 250, 'lbs')).toBe('2.5 lbs from your 250 lbs PR');
  });

  it('recognizes a tie', () => {
    expect(nearPrHint('250', 250, 'lbs')).toBe('Ties your 250 lbs PR');
  });

  it('recognizes beating the PR', () => {
    expect(nearPrHint('255', 250, 'lbs')).toBe('Beats your 250 lbs PR!');
  });
});
