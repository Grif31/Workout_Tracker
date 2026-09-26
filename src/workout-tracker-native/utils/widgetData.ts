import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  USER_KEY, WEEKLY_DISTANCE_GOAL_KEY, WEEKLY_GOAL_KEY, WIDGET_SNAPSHOT_KEY,
} from '../constants/storageKeys';
import { GPS_DISTANCE_UNIT_KEY } from './units';
import type { GreekRankData } from './greekRank';
import {
  buildGreekRank, buildScore, buildWeek, mergeSnapshot, parseSnapshot,
  type ScoreResponse, type WidgetScores, type WidgetSections, type WidgetSnapshot,
} from './widgetSnapshot';
import { renderWidgets } from './widgets';

// Every write is a read-merge-write of one AsyncStorage blob. Chained, so two
// screens finishing their fetches together can't both read the old blob and
// have the second write drop the first one's section.
let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task).catch(() => {});
  queue = run;
  return run;
}

type SectionsOrUpdate =
  | Partial<WidgetSections>
  | ((prev: WidgetSnapshot | null) => Partial<WidgetSections>);

/**
 * Merges `sections` into the stored snapshot and redraws every widget from it.
 * Only for the user who is logged in right now: a fetch that resolves after a
 * logout would otherwise write the old account back in after the logout's clear.
 */
export function writeWidgetSnapshot(userId: number | null | undefined, sections: SectionsOrUpdate): Promise<void> {
  if (userId == null) return Promise.resolve();
  return enqueue(async () => {
    const [[, userRaw], [, snapRaw]] = await AsyncStorage.multiGet([USER_KEY, WIDGET_SNAPSHOT_KEY]);
    if (!userRaw || JSON.parse(userRaw)?.id !== userId) return;
    const prev = parseSnapshot(snapRaw);
    const own = prev?.userId === userId ? prev : null;
    const next = mergeSnapshot(prev, userId, typeof sections === 'function' ? sections(own) : sections, Date.now());
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(next));
    renderWidgets(next);
  });
}

/** Logout and login: the next account must never see this one's rank or streak. */
export function clearWidgetSnapshot(): Promise<void> {
  return enqueue(async () => {
    await AsyncStorage.removeItem(WIDGET_SNAPSHOT_KEY);
    renderWidgets(null);
  });
}

export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  return parseSnapshot(await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY).catch(() => null));
}

/**
 * The week section, from /api/stats/profile and /api/workouts/dates. The goal,
 * distance goal and GPS unit are read here rather than passed in: they're
 * AsyncStorage settings, and every caller would otherwise read the same three keys.
 */
export async function writeWidgetWeek(userId: number | null | undefined, data: {
  profileStats: {
    this_week_count?: number;
    current_streak?: number;
    week_cardio_distance_km?: number;
  } | null;
  allWorkoutDates: string[] | null;
}): Promise<void> {
  if (userId == null || !data.profileStats || !data.allWorkoutDates) return;
  let settings: readonly (readonly [string, string | null])[];
  try {
    settings = await AsyncStorage.multiGet([
      `${WEEKLY_GOAL_KEY}_${userId}`,
      `${WEEKLY_DISTANCE_GOAL_KEY}_${userId}`,
      `${GPS_DISTANCE_UNIT_KEY}_${userId}`,
    ]);
  } catch {
    return;
  }
  const [[, goalRaw], [, distanceGoalRaw], [, unitRaw]] = settings;
  const distanceGoalKm = distanceGoalRaw ? parseFloat(distanceGoalRaw) : NaN;
  return writeWidgetSnapshot(userId, {
    week: buildWeek({
      goal: goalRaw ? (parseInt(goalRaw, 10) || 3) : 3,
      workoutCount: data.profileStats.this_week_count ?? 0,
      allWorkoutDates: data.allWorkoutDates,
      streakWeeks: data.profileStats.current_streak ?? 0,
      distanceGoalKm: distanceGoalKm > 0 ? distanceGoalKm : null,
      distanceKm: data.profileStats.week_cardio_distance_km ?? 0,
      distanceUnit: unitRaw === 'km' ? 'km' : 'mi',
    }, new Date()),
  });
}

/** Every screen that fetches /api/stats/greek-rank hands the result here. */
export function writeWidgetGreekRank(userId: number | null | undefined, data: GreekRankData | null): Promise<void> {
  if (!data?.greek_rank) return Promise.resolve();
  return writeWidgetSnapshot(userId, { greekRank: buildGreekRank(data) });
}

/** One score at a time: each score screen only fetches its own. */
export function writeWidgetScore(
  userId: number | null | undefined, which: keyof WidgetScores, res: ScoreResponse,
): Promise<void> {
  return writeWidgetSnapshot(userId, prev => ({
    scores: { strength: null, endurance: null, ...prev?.scores, [which]: buildScore(res) },
  }));
}
