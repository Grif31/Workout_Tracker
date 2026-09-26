import { GREEK_RANKS } from '../constants/greekRanks';
import { gateRequirementText, type GreekRankData } from './greekRank';
import { toLocalDateStr } from './date';

// The one blob every home screen widget renders from (TODO.md section 19,
// Phase 1). Widgets can't call the API, so the app writes this whenever it
// already has fresh data, and each widget reads it on its own schedule, often
// days later with the app closed. So everything week-bound carries the Monday
// it was written in, and the view helpers below recompute "this week" from the
// widget's own clock rather than trusting counts that were true on write.
//
// Pure: no native imports, so it runs in Jest and inside Android's headless
// widget task. iOS widget layouts can't import it (see CLAUDE.md, Home screen
// widgets) and repeat the week check inline.

export const WIDGET_SNAPSHOT_VERSION = 1;
export const WIDGET_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type WidgetWeek = {
  /** Monday (YYYY-MM-DD) of the week the counts below belong to. */
  weekStart: string;
  goal: number;
  /** Workouts logged that week; a day with two workouts counts twice, as the goal does. */
  workoutCount: number;
  /** Days trained that week, for the day dots. */
  trainedDates: string[];
  streakWeeks: number;
  distanceGoalKm: number | null;
  distanceKm: number;
  distanceUnit: 'km' | 'mi';
};

export type WidgetRank = {
  rank: string;
  score: number;
  nextRank: string | null;
  /** Null at the top rank. 0 when the score has earned the next rank and a gate holds it. */
  pointsToNext: number | null;
  /** 0-1 through the held rank's band. */
  bandProgress: number;
  heldByGate: boolean;
  /** What unlocks the next rank, in the app's own words, when a gate is in the way. */
  gateText: string | null;
};

export type WidgetScore = { percentile: number; label: string };
export type WidgetScores = { strength: WidgetScore | null; endurance: WidgetScore | null };

export type WidgetRoutine = {
  id: number;
  name: string;
  /** Monday of the week doneLabels belongs to. */
  weekStart: string;
  days: { label: string; exercises: string[] }[];
  /** Lower-cased names of workouts logged that week; a day is done when its label is here. */
  doneLabels: string[];
};

export type WidgetAccent = { dark: string; light: string };

export type WidgetSections = {
  week: WidgetWeek | null;
  greekRank: WidgetRank | null;
  scores: WidgetScores | null;
  routine: WidgetRoutine | null;
  accent: WidgetAccent | null;
};

export type WidgetSnapshot = WidgetSections & {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  updatedAt: number;
  userId: number;
};

export function mondayOf(d: Date): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay(): 0=Sun
  return toLocalDateStr(monday);
}

/** Midnight at the start of the Monday after `d`, local time: when a widget's week rolls over. */
export function nextMondayStart(d: Date): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + (7 - ((d.getDay() + 6) % 7)));
  return next;
}

export function emptySnapshot(userId: number, now: number): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION, updatedAt: now, userId,
    week: null, greekRank: null, scores: null, routine: null, accent: null,
  };
}

/** A stored snapshot the current code can read, or null for anything else. */
export function parseSnapshot(raw: string | null): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.version === WIDGET_SNAPSHOT_VERSION && typeof s.userId === 'number' ? s : null;
  } catch {
    return null;
  }
}

/**
 * Section by section: a section passed in replaces the stored one, a section
 * left out keeps it. A different user starts from empty, so nothing of the
 * previous account survives even if a logout's clear was missed.
 */
export function mergeSnapshot(
  prev: WidgetSnapshot | null, userId: number, sections: Partial<WidgetSections>, now: number,
): WidgetSnapshot {
  const base = prev && prev.userId === userId ? prev : emptySnapshot(userId, now);
  return { ...base, ...sections, updatedAt: now };
}

export function isStale(snapshot: WidgetSnapshot, now: number): boolean {
  return now - snapshot.updatedAt > WIDGET_STALE_AFTER_MS;
}

export function buildWeek(args: {
  goal: number;
  workoutCount: number;
  allWorkoutDates: string[];
  streakWeeks: number;
  distanceGoalKm: number | null;
  distanceKm: number;
  distanceUnit: 'km' | 'mi';
}, today: Date): WidgetWeek {
  const weekStart = mondayOf(today);
  return {
    weekStart,
    goal: Math.max(1, args.goal),
    workoutCount: args.workoutCount,
    trainedDates: [...new Set(args.allWorkoutDates.filter(d => d >= weekStart))].sort(),
    streakWeeks: args.streakWeeks,
    distanceGoalKm: args.distanceGoalKm,
    distanceKm: args.distanceKm,
    distanceUnit: args.distanceUnit,
  };
}

export type WeekView = {
  done: number;
  goal: number;
  goalMet: boolean;
  /** Monday first. */
  trainedDays: boolean[];
  /** 0 = Monday. */
  todayIndex: number;
  streakWeeks: number;
  distanceKm: number;
  distanceGoalKm: number | null;
  distanceUnit: 'km' | 'mi';
};

/**
 * The week as of `today`. Once the stored week is over, its counts belong to
 * last week, so a widget redrawn on Monday shows 0 of 3 rather than last
 * week's 3 of 3. The streak carries over: whether last week extended it is the
 * server's call, and the app corrects it the next time it's opened.
 */
export function viewWeek(week: WidgetWeek, today: Date): WeekView {
  const monday = mondayOf(today);
  const current = week.weekStart === monday;
  const trained = new Set(current ? week.trainedDates : []);
  const trainedDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - ((today.getDay() + 6) % 7) + i);
    return trained.has(toLocalDateStr(d));
  });
  const done = current ? week.workoutCount : 0;
  return {
    done,
    goal: week.goal,
    goalMet: done >= week.goal,
    trainedDays,
    todayIndex: (today.getDay() + 6) % 7,
    streakWeeks: week.streakWeeks,
    distanceKm: current ? week.distanceKm : 0,
    distanceGoalKm: week.distanceGoalKm,
    distanceUnit: week.distanceUnit,
  };
}

/** Same numbers and wording as the Greek Rank screen: held rank, not raw score. */
export function buildGreekRank(data: GreekRankData): WidgetRank {
  const idx = Math.max(0, GREEK_RANKS.findIndex(r => r.name === data.greek_rank));
  const held = GREEK_RANKS[idx];
  const next = GREEK_RANKS[idx + 1] ?? null;
  const score = data.greek_score;
  const span = held.high - held.low;
  return {
    rank: held.name,
    score: Math.round(score),
    nextRank: next?.name ?? null,
    pointsToNext: next ? Math.max(0, Math.ceil(next.low - score)) : null,
    bandProgress: data.held_by_gate ? 1 : Math.min(1, Math.max(0, (score - held.low) / span)),
    heldByGate: !!data.held_by_gate,
    gateText: next ? gateRequirementText(data, next.name) : null,
  };
}

export type ScoreResponse = { overall?: number | null; overall_rank?: { label?: string } | null } | null | undefined;

/** A score screen's response as a widget score, or null when that score has no data yet. */
export function buildScore(res: ScoreResponse): WidgetScore | null {
  if (res?.overall == null || !res.overall_rank?.label) return null;
  return { percentile: Math.round(res.overall), label: res.overall_rank.label };
}

/** Each score is null on its own when it has no data (a runner has no Strength Score). */
export function buildScores(strength: ScoreResponse, endurance: ScoreResponse): WidgetScores {
  return { strength: buildScore(strength), endurance: buildScore(endurance) };
}

type RoutineInput = {
  id: number;
  name: string;
  days: { day_order: number; label: string; workout_template: { exercises: { name: string }[] } }[];
};

export function buildRoutine(routine: RoutineInput, weekWorkoutNames: string[], today: Date): WidgetRoutine {
  return {
    id: routine.id,
    name: routine.name,
    weekStart: mondayOf(today),
    days: [...routine.days]
      .sort((a, b) => a.day_order - b.day_order)
      .map(d => ({ label: d.label, exercises: d.workout_template.exercises.map(e => e.name) })),
    doneLabels: weekWorkoutNames.map(n => n.trim().toLowerCase()),
  };
}

export type RoutineView = {
  name: string;
  /** Null when every day is done this week. */
  next: { index: number; label: string; exercises: string[] } | null;
  dayCount: number;
};

/**
 * Home's Active Routine rule: the first day, in order, with no workout of that
 * name logged since Monday. A new week has nothing logged, so it lands back on
 * day 1 without the app being opened.
 */
export function viewRoutine(routine: WidgetRoutine, today: Date): RoutineView {
  const done = new Set(routine.weekStart === mondayOf(today) ? routine.doneLabels : []);
  const index = routine.days.findIndex(d => !done.has(d.label.trim().toLowerCase()));
  return {
    name: routine.name,
    next: index === -1 ? null : { index, ...routine.days[index] },
    dayCount: routine.days.length,
  };
}
