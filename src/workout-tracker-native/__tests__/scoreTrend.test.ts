import { monthlyScoreChange, scoreChangeLabel } from '../utils/scoreTrend';

const NOW = new Date('2026-10-20T12:00:00-07:00');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('monthlyScoreChange', () => {
  it('compares against the newest snapshot at least 30 days old', () => {
    const history = [
      { date: daysAgo(60), score: 40 },
      { date: daysAgo(35), score: 58 },
      { date: daysAgo(10), score: 61 },
    ];
    expect(monthlyScoreChange(history, 62, NOW)).toBe(4);
  });

  it('reads history in any order', () => {
    const history = [
      { date: daysAgo(10), score: 61 },
      { date: daysAgo(35), score: 58 },
      { date: daysAgo(60), score: 40 },
    ];
    expect(monthlyScoreChange(history, 62, NOW)).toBe(4);
  });

  it('has no trend until a snapshot is 30 days old', () => {
    expect(monthlyScoreChange([{ date: daysAgo(29), score: 50 }], 62, NOW)).toBeNull();
  });

  it('has no trend without a current score or history', () => {
    expect(monthlyScoreChange([{ date: daysAgo(40), score: 50 }], null, NOW)).toBeNull();
    expect(monthlyScoreChange([], 62, NOW)).toBeNull();
    expect(monthlyScoreChange(undefined, 62, NOW)).toBeNull();
  });

  it('compares whole numbers, as the ring shows them', () => {
    expect(monthlyScoreChange([{ date: daysAgo(40), score: 61.6 }], 62.4, NOW)).toBe(0);
  });

  it('reports a drop as negative', () => {
    expect(monthlyScoreChange([{ date: daysAgo(40), score: 45 }], 41, NOW)).toBe(-4);
  });
});

describe('scoreChangeLabel', () => {
  it('words a rise, a drop and no change', () => {
    expect(scoreChangeLabel(4)).toBe('▲ 4 this month');
    expect(scoreChangeLabel(-3)).toBe('▼ 3 this month');
    expect(scoreChangeLabel(0)).toBe('No change this month');
  });
});
