import { muscleTrend, fatigueBanner, pplBalance, longBelowMev } from '../utils/muscleTrends';

describe('muscleTrend', () => {
  it('compares the last two weeks with the first two', () => {
    expect(muscleTrend([6, 8, 12, 14])).toBe('up');
    expect(muscleTrend([14, 12, 8, 6])).toBe('down');
    expect(muscleTrend([10, 10, 11, 10])).toBe('flat');
  });

  it('treats a change of 15% or less as flat', () => {
    expect(muscleTrend([10, 10, 11.5, 11.5])).toBe('flat');
    expect(muscleTrend([10, 10, 11.6, 11.6])).toBe('up');
  });

  it('calls a muscle that started from nothing up', () => {
    expect(muscleTrend([0, 0, 6, 8])).toBe('up');
  });

  it('gives no direction from fewer than two trained weeks or missing data', () => {
    expect(muscleTrend([0, 0, 0, 8])).toBeNull();
    expect(muscleTrend([0, 0, 0, 0])).toBeNull();
    expect(muscleTrend([1, 2])).toBeNull();
    expect(muscleTrend(undefined)).toBeNull();
  });
});

describe('fatigueBanner', () => {
  it('stays quiet without a real baseline', () => {
    expect(fatigueBanner(10, 7)).toBeNull();
    expect(fatigueBanner(0, 0)).toBeNull();
  });

  it('names a big jump', () => {
    expect(fatigueBanner(41, 30)).toMatchObject({ kind: 'spike', pct: 37 });
    expect(fatigueBanner(37, 30)).toMatchObject({ kind: 'high', pct: 23 });
  });

  it('uses 20 and 35 percent as the edges', () => {
    expect(fatigueBanner(36, 30)?.kind).toBe('ok'); // exactly +20%
    expect(fatigueBanner(37, 30)?.kind).toBe('high');
    expect(fatigueBanner(40.5, 30)?.kind).toBe('high'); // exactly +35%
    expect(fatigueBanner(41, 30)?.kind).toBe('spike');
  });

  it('is on track at or near last week, and says which way', () => {
    expect(fatigueBanner(32, 30)).toMatchObject({ kind: 'ok', title: 'On track, up 7% on last week' });
    expect(fatigueBanner(27, 30)).toMatchObject({ kind: 'ok', title: 'On track, 10% below last week' });
  });

  it('flags well under last week, from 40% of it down', () => {
    expect(fatigueBanner(11, 30)).toMatchObject({ kind: 'drop', pct: -63 });
    expect(fatigueBanner(12, 30)?.kind).toBe('ok');
  });

  it('has no em dashes or exclamation marks in its copy', () => {
    for (const [a, b] of [[41, 30], [37, 30], [11, 30], [30, 30]]) {
      const banner = fatigueBanner(a, b)!;
      expect(banner.title + banner.detail).not.toMatch(/[—!]/);
    }
  });
});

describe('pplBalance', () => {
  it('sums sets into push, pull, legs and core', () => {
    const b = pplBalance({ Chest: 6, Triceps: 3, Back: 9, Biceps: 3, Quads: 8, Core: 2 })!;
    expect(b.groups).toEqual({ Push: 9, Pull: 12, Legs: 8, Core: 2 });
    expect(b.total).toBe(31);
  });

  it('rates the pull:push ratio', () => {
    expect(pplBalance({ Chest: 6, Back: 9 })).toMatchObject({ ratio: 1.5, tone: 'good' });
    expect(pplBalance({ Chest: 10, Back: 8 })).toMatchObject({ ratio: 0.8, tone: 'watch' });
    expect(pplBalance({ Chest: 10, Back: 6 })).toMatchObject({ ratio: 0.6, tone: 'low' });
    expect(pplBalance({ Chest: 6, Back: 6 })).toMatchObject({ ratio: 1, tone: 'good' });
  });

  it('gives no ratio until both push and pull have been trained', () => {
    expect(pplBalance({ Chest: 8, Quads: 4 })).toMatchObject({ ratio: null, tone: null });
  });

  it('waits for a few sets before judging a week', () => {
    expect(pplBalance({ Chest: 2, Back: 2 })).toBeNull();
    expect(pplBalance({})).toBeNull();
  });
});

describe('longBelowMev', () => {
  it('finds a muscle under its minimum for both of the last two weeks', () => {
    expect(longBelowMev({ Chest: [10, 12, 5, 6], Back: [12, 12, 12, 12] })).toBe('Chest');
  });

  it('picks the one furthest below', () => {
    expect(longBelowMev({ Chest: [0, 0, 6, 7], Triceps: [0, 0, 1, 2] })).toBe('Triceps');
  });

  it('ignores a muscle at zero, which can be a choice, and one that recovered', () => {
    expect(longBelowMev({ Calves: [0, 0, 0, 0], Chest: [4, 4, 4, 9], Back: [4, 4, 0, 4] })).toBeNull();
  });

  it('copes with no data or an unknown muscle', () => {
    expect(longBelowMev(undefined)).toBeNull();
    expect(longBelowMev({ Wings: [1, 1, 1, 1] })).toBeNull();
  });
});
