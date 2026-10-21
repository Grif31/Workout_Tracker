import { chartHeadline } from '../utils/chartHeadline';

const weeks = ['9/15', '9/22', '9/29', '10/6', '10/13'];
const base = { labels: weeks, monthly: false, weightUnit: 'lbs', distanceUnit: 'mi' } as const;

describe('chartHeadline', () => {
  it('shows the current week with the earlier average, not a percentage', () => {
    const h = chartHeadline({ ...base, metric: 'volume', values: [10000, 12000, 14000, 16000, 4000], index: 4 });
    expect(h).toEqual({
      value: '4,000', unit: 'lbs', when: 'this week so far',
      change: null, average: '4-week average 13,000',
    });
  });

  it('compares a finished week with the weeks before it', () => {
    const h = chartHeadline({ ...base, metric: 'volume', values: [10000, 10000, 10000, 11000, 4000], index: 3 });
    expect(h.when).toBe('week of 10/6');
    expect(h.change).toEqual({ pct: 10, text: '▲ 10% vs the 3 weeks before' });
    expect(h.average).toBeNull();
  });

  it('words a drop and no change', () => {
    expect(chartHeadline({ ...base, metric: 'sets', values: [10, 10, 8, 0, 0], index: 2 }).change?.text)
      .toBe('▼ 20% vs the 2 weeks before');
    expect(chartHeadline({ ...base, metric: 'sets', values: [10, 10, 10, 0, 0], index: 2 }).change?.text)
      .toBe('Level with the 2 weeks before');
  });

  it('has nothing to compare with fewer than two earlier periods, or only empty ones', () => {
    expect(chartHeadline({ ...base, metric: 'sets', values: [10, 12, 0, 0, 0], index: 1 }).change).toBeNull();
    const h = chartHeadline({ ...base, metric: 'sets', values: [0, 0, 0, 0, 5], index: 4 });
    expect(h.change).toBeNull();
    expect(h.average).toBeNull();
  });

  it('reaches into the periods before the first bar, so every bar looks back 4', () => {
    const h = chartHeadline({
      ...base, metric: 'volume', previous: [9000, 9000, 9000, 9000],
      values: [10000, 12000, 14000, 16000, 4000], index: 3,
    });
    // 16,000 against 9,000 / 10,000 / 12,000 / 14,000 (average 11,250)
    expect(h.change?.text).toBe('▲ 42% vs the 4 weeks before');
    const oldest = chartHeadline({
      ...base, metric: 'volume', previous: [9000, 9000, 9000, 9000],
      values: [10000, 12000, 14000, 16000, 4000], index: 0,
    });
    expect(oldest.change?.text).toBe('▲ 11% vs the 4 weeks before');
  });

  it('names months on the monthly ranges', () => {
    const h = chartHeadline({
      ...base, monthly: true, labels: ['Jul', 'Aug', 'Sep', 'Oct'],
      metric: 'workouts', values: [12, 14, 16, 5], index: 2,
    });
    expect(h.when).toBe('in Sep');
    expect(h.change?.text).toBe('▲ 23% vs the 2 months before');
    const now = chartHeadline({
      ...base, monthly: true, labels: ['Jul', 'Aug', 'Sep', 'Oct'],
      metric: 'workouts', values: [12, 14, 16, 5], index: 3,
    });
    expect(now.when).toBe('this month so far');
    expect(now.average).toBe('3-month average 14');
  });

  it('uses the right unit for each metric', () => {
    expect(chartHeadline({ ...base, metric: 'workouts', values: [1], index: 0 }).unit).toBe('workout');
    expect(chartHeadline({ ...base, metric: 'workouts', values: [3], index: 0 }).unit).toBe('workouts');
    expect(chartHeadline({ ...base, metric: 'sets', values: [1], index: 0 }).unit).toBe('set');
    expect(chartHeadline({ ...base, metric: 'volume', values: [1], index: 0, weightUnit: 'kg' }).unit).toBe('kg');
    const d = chartHeadline({ ...base, metric: 'distance', values: [5.25], index: 0, distanceUnit: 'km' });
    expect(d.unit).toBe('km');
    expect(d.value).toBe('5.3');
  });
});
