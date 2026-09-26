import {
  buildGreekRank, buildRoutine, buildScores, buildWeek, emptySnapshot, isStale, mergeSnapshot,
  mondayOf, nextMondayStart, parseSnapshot, viewRoutine, viewWeek, WIDGET_STALE_AFTER_MS,
} from '../utils/widgetSnapshot';
import type { GreekRankData } from '../utils/greekRank';

// Jest runs in America/Los_Angeles (jest.globalSetup.js), so these are local
// dates on the side of UTC where a toISOString() slip would show.
const THU = new Date(2026, 8, 24, 21, 30); // Thu Sep 24 2026, 9:30pm
const SUN_NIGHT = new Date(2026, 8, 27, 23, 59);
const NEXT_MON = new Date(2026, 8, 28, 0, 1);

const weekArgs = {
  goal: 3,
  workoutCount: 2,
  allWorkoutDates: ['2026-09-18', '2026-09-21', '2026-09-23', '2026-09-23'],
  streakWeeks: 6,
  distanceGoalKm: 24,
  distanceKm: 20,
  distanceUnit: 'mi' as const,
};

describe('week dates', () => {
  it('finds Monday for any day of the week, Sunday included', () => {
    expect(mondayOf(THU)).toBe('2026-09-21');
    expect(mondayOf(SUN_NIGHT)).toBe('2026-09-21');
    expect(mondayOf(NEXT_MON)).toBe('2026-09-28');
  });

  it('rolls over at midnight at the start of the next Monday', () => {
    expect(nextMondayStart(THU)).toEqual(new Date(2026, 8, 28, 0, 0));
    expect(nextMondayStart(SUN_NIGHT)).toEqual(new Date(2026, 8, 28, 0, 0));
    // Already Monday: the next rollover is a week away, not now
    expect(nextMondayStart(NEXT_MON)).toEqual(new Date(2026, 9, 5, 0, 0));
  });
});

describe('buildWeek and viewWeek', () => {
  it('keeps only this week\'s trained days, once each', () => {
    expect(buildWeek(weekArgs, THU).trainedDates).toEqual(['2026-09-21', '2026-09-23']);
  });

  it('shows the stored week while it is still that week', () => {
    const view = viewWeek(buildWeek(weekArgs, THU), SUN_NIGHT);
    expect(view).toMatchObject({ done: 2, goal: 3, goalMet: false, streakWeeks: 6, distanceKm: 20, todayIndex: 6 });
    expect(view.trainedDays).toEqual([true, false, true, false, false, false, false]);
  });

  it('starts Monday at 0 without the app, keeping the streak and the goals', () => {
    const view = viewWeek(buildWeek(weekArgs, THU), NEXT_MON);
    expect(view).toMatchObject({ done: 0, goal: 3, goalMet: false, streakWeeks: 6, distanceKm: 0, distanceGoalKm: 24, todayIndex: 0 });
    expect(view.trainedDays.every(d => !d)).toBe(true);
  });

  it('never treats a goal below 1 as met by zero workouts', () => {
    expect(viewWeek(buildWeek({ ...weekArgs, goal: 0, workoutCount: 0 }, THU), THU).goalMet).toBe(false);
  });
});

describe('snapshot storage', () => {
  it('replaces the sections it is given and keeps the rest', () => {
    const first = mergeSnapshot(null, 7, { week: buildWeek(weekArgs, THU) }, 1000);
    const second = mergeSnapshot(first, 7, { scores: { strength: null, endurance: null } }, 2000);
    expect(second.week).toEqual(first.week);
    expect(second.scores).toEqual({ strength: null, endurance: null });
    expect(second.updatedAt).toBe(2000);
  });

  it('starts empty for a different user, so nothing of the previous account carries over', () => {
    const theirs = mergeSnapshot(null, 7, { week: buildWeek(weekArgs, THU) }, 1000);
    const mine = mergeSnapshot(theirs, 8, { accent: { dark: '#30D158', light: '#1C7F35' } }, 2000);
    expect(mine.userId).toBe(8);
    expect(mine.week).toBeNull();
  });

  it('reads back only a snapshot of the current version', () => {
    const snap = emptySnapshot(7, 1000);
    expect(parseSnapshot(JSON.stringify(snap))).toEqual(snap);
    expect(parseSnapshot(JSON.stringify({ ...snap, version: 0 }))).toBeNull();
    expect(parseSnapshot('not json')).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });

  it('is stale after a week without an update', () => {
    const snap = emptySnapshot(7, 0);
    expect(isStale(snap, WIDGET_STALE_AFTER_MS)).toBe(false);
    expect(isStale(snap, WIDGET_STALE_AFTER_MS + 1)).toBe(true);
  });
});

const rankData = (over: Partial<GreekRankData>): GreekRankData => ({
  greek_rank: 'Hero',
  greek_score: 41,
  score_rank: 'Hero',
  held_by_gate: false,
  next_gate: null,
  gates: { Titan: 50, 'Aretē': 80 },
  components: { consistency: 52, dedication: 38, volume: 29 },
  weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
  performance: { strength: 44, endurance: null, best: 44 },
  profile_missing: [],
  ...over,
});

describe('buildGreekRank', () => {
  it('gives points to the next rank the way the Greek Rank screen does', () => {
    expect(buildGreekRank(rankData({}))).toEqual({
      rank: 'Hero', score: 41, nextRank: 'Demigod', pointsToNext: 7,
      bandProgress: 0.65, heldByGate: false, gateText: null,
    });
  });

  it('shows the held rank full, with what unlocks the next one', () => {
    const rank = buildGreekRank(rankData({ greek_rank: 'Olympian', greek_score: 84, score_rank: 'Titan', held_by_gate: true }));
    expect(rank).toMatchObject({ rank: 'Olympian', nextRank: 'Titan', pointsToNext: 0, bandProgress: 1, heldByGate: true });
    expect(rank.gateText).toBe('Reach the 50th percentile in Strength or Endurance to unlock Titan');
  });

  it('has no next rank at the top', () => {
    expect(buildGreekRank(rankData({ greek_rank: 'Aretē', greek_score: 95, performance: { strength: 90, endurance: null, best: 90 } })))
      .toMatchObject({ rank: 'Aretē', nextRank: null, pointsToNext: null, gateText: null });
  });
});

describe('buildScores', () => {
  it('leaves out a score with no data, like a runner\'s Strength Score', () => {
    expect(buildScores(
      { overall: null, overall_rank: null },
      { overall: 72.6, overall_rank: { label: 'Advanced' } },
    )).toEqual({ strength: null, endurance: { percentile: 73, label: 'Advanced' } });
  });

  it('treats a failed or 422 fetch as no score', () => {
    expect(buildScores(null, undefined)).toEqual({ strength: null, endurance: null });
  });
});

describe('buildRoutine and viewRoutine', () => {
  const routine = {
    id: 3,
    name: 'Push Pull Legs',
    days: [
      { day_order: 2, label: 'Pull', workout_template: { exercises: [{ name: 'Deadlift' }] } },
      { day_order: 1, label: 'Push', workout_template: { exercises: [{ name: 'Bench Press' }] } },
      { day_order: 3, label: 'Legs', workout_template: { exercises: [{ name: 'Squat' }] } },
    ],
  };

  it('picks the first day in order not logged this week', () => {
    const view = viewRoutine(buildRoutine(routine, ['  push '], THU), THU);
    expect(view.next).toEqual({ index: 1, label: 'Pull', exercises: ['Deadlift'] });
    expect(view.dayCount).toBe(3);
  });

  it('has no next day when every day is done', () => {
    expect(viewRoutine(buildRoutine(routine, ['push', 'pull', 'legs'], THU), SUN_NIGHT).next).toBeNull();
  });

  it('goes back to day 1 on Monday without the app', () => {
    expect(viewRoutine(buildRoutine(routine, ['push', 'pull', 'legs'], THU), NEXT_MON).next?.label).toBe('Push');
  });
});
