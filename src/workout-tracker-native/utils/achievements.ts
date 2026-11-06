import { apiFetch } from './api';
import { appCache } from './appCache';
import { fmtOrdinal } from './prFormat';
import { elevationLabel, toDisplayElevation, type DistanceUnit } from './units';
import { badgeLook } from '../constants/achievements';

// GET /api/achievements (src/utils/achievements.py, achievements_payload)
export interface EarnedState {
  earned: boolean;
  earned_at: string | null;
  workout_id: number | null;
  workout_name: string | null;
  workout_cardio: boolean;
  seen: boolean;
}
export interface LadderBadge extends EarnedState { key: string; rung: number; title: string; threshold: number }
export interface Track {
  track: string;
  label: string;
  group: string | null;
  /** 'any' for counts, hours and metres; else the user's weight or distance unit */
  unit: string;
  value: number;
  visible: boolean;
  earned_count: number;
  total: number;
  badges: LadderBadge[];
  next: { key: string; title: string; threshold: number; remaining: number } | null;
}
export interface OneOff extends EarnedState { key: string; title: string; visible?: boolean }
export interface AchievementsData {
  weight_unit: string;
  distance_unit: DistanceUnit;
  earned_count: number;
  total_count: number;
  tracks: Track[];
  feats: OneOff[];
  hidden: OneOff[];
  hidden_remaining: number;
  unseen: string[];
}
/** One item of a save's `new_achievements` */
export interface NewAchievement {
  key: string;
  kind: 'ladder' | 'feat' | 'hidden';
  title: string;
  earned_at: string;
  workout_id: number | null;
  track?: string;
  rung?: number;
  of?: number;
  threshold?: number;
  unit?: string;
  next?: { title: string; threshold: number } | null;
}

export const ACHIEVEMENTS_CACHE_KEY = 'achievements';

export async function fetchAchievements(): Promise<AchievementsData | null> {
  try {
    const res = await apiFetch('/api/achievements');
    if (!res.ok) return null;
    const data: AchievementsData = await res.json();
    appCache.set(ACHIEVEMENTS_CACHE_KEY, data);
    return data;
  } catch {
    return null;
  }
}

/** Fire and forget: the dots only need to be gone next time */
export function markAchievementsSeen(keys: string[]): void {
  if (!keys.length) return;
  apiFetch('/api/achievements/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  }).catch(() => {});
}

const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

const PLATE_LIFTS: Record<string, string> = { plates_bench: 'bench', plates_squat: 'squat', plates_deadlift: 'deadlift' };

/** An amount in the track's own terms: "250 workouts", "500,000 lbs", "2,457 ft" */
export function amountText(track: string, amount: number, unit: string, distanceUnit: DistanceUnit): string {
  switch (track) {
    case 'workouts': return `${n(amount)} workout${amount === 1 ? '' : 's'}`;
    case 'hours': return `${n(amount)} hour${amount === 1 ? '' : 's'}`;
    case 'streak': return `${n(amount)} week${amount === 1 ? '' : 's'}`;
    case 'prs': return `${n(amount)} PR${amount === 1 ? '' : 's'}`;
    case 'explorer': return `${n(amount)} exercise${amount === 1 ? '' : 's'}`;
    case 'elevation': return `${n(Math.round(toDisplayElevation(amount, distanceUnit)))} ${elevationLabel(distanceUnit)}`;
    default: return `${n(amount)} ${unit}`;
  }
}

/** The plain threshold, for a ladder row or a locked back: "250 workouts", "26 weeks in a row" */
export function goalText(track: string, threshold: number, unit: string, distanceUnit: DistanceUnit): string {
  if (track === 'streak') return `${n(threshold)} weeks in a row`;
  if (PLATE_LIFTS[track]) return `${n(threshold)} ${unit} ${PLATE_LIFTS[track]}`;
  return amountText(track, threshold, unit, distanceUnit);
}

const ONE_OFF_LINES: Record<string, (d: { distanceUnit: DistanceUnit }) => string> = {
  feat_bw_bench: () => 'Benched your bodyweight',
  feat_2xbw_deadlift: () => 'Deadlifted twice your bodyweight',
  feat_1000_club: () => 'Squat, bench and deadlift together',
  feat_first_5k: () => 'Your first 5K',
  feat_sub25_5k: () => 'A 5K in under 25 minutes',
  feat_marathon: () => 'A marathon in one run',
  feat_century: ({ distanceUnit }) => `100 ${distanceUnit} in one ride`,
  feat_nostos: () => 'Back at it.',
  hidden_neomenia: () => 'A workout on New Year’s Day',
  hidden_embolimos: () => 'A workout on February 29',
  hidden_three_hundred: () => 'Your 300th workout',
  hidden_eos: () => 'A workout before 6 AM',
  hidden_kairos: () => 'A faster second half',
  hidden_triad: () => 'PRs on bench, squat and deadlift in one week',
  hidden_eniautos: () => 'A year to the day from your first',
  hidden_pi: () => 'A 3.14 run on Pi Day',
};

/** What it took, for the back, the unlock sheet and Recently earned: "Your 100th workout" */
export function earnedLine(key: string, threshold: number | undefined, unit: string, distanceUnit: DistanceUnit): string {
  const oneOff = ONE_OFF_LINES[key];
  if (oneOff) return oneOff({ distanceUnit });
  const track = key.slice(0, key.lastIndexOf('_'));
  if (threshold == null) return '';
  switch (track) {
    case 'workouts': return threshold === 1 ? 'Your first workout' : `Your ${fmtOrdinal(threshold)} workout`;
    case 'prs': return threshold === 1 ? 'Your first PR' : `Your ${fmtOrdinal(threshold)} PR`;
    case 'hours': return `${n(threshold)} hours trained`;
    case 'volume': return `${n(threshold)} ${unit} lifted, all time`;
    case 'streak': return `${n(threshold)} weeks in a row`;
    case 'running': return `${n(threshold)} ${unit} run, all time`;
    case 'ride': return `${n(threshold)} ${unit} ridden, all time`;
    case 'elevation': return `${amountText(track, threshold, unit, distanceUnit)} climbed`;
    case 'explorer': return `${n(threshold)} different exercises`;
    default: return PLATE_LIFTS[track] ? `${n(threshold)} ${unit} ${PLATE_LIFTS[track]}` : '';
  }
}

/** "Sep 28, 2026" from the server's naive datetime, on the workout's own day */
export function badgeDate(earnedAt: string, withYear = true): string {
  const [y, m, d] = earnedAt.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

/** Progress through the current rung, 0 to 1 */
export function rungProgress(track: Track): number {
  if (!track.next) return 1;
  const i = track.badges.findIndex(b => b.key === track.next!.key);
  const floor = i > 0 ? track.badges[i - 1].threshold : 0;
  const span = track.next.threshold - floor;
  return span > 0 ? Math.max(0, Math.min(1, (track.value - floor) / span)) : 0;
}

/** The badges closest to earned, by progress through their rung */
export function almostThere(data: AchievementsData, count = 3): Track[] {
  return data.tracks
    .filter(t => t.visible && t.next && t.value > 0)
    .sort((a, b) => rungProgress(b) - rungProgress(a))
    .slice(0, count);
}

export interface MilestoneTile {
  /** A track, or 'plates' for the three lifts together */
  id: string;
  label: string;
  badge: LadderBadge;
  locked: boolean;
  earned: number;
  total: number;
  unit: string;
}

const METAL_RANK = { locked: 0, bronze: 1, silver: 2, gold: 3, marble: 4 } as const;

/** One tile per visible track, the three lifts as one Plates tile, each showing its latest badge */
export function milestoneTiles(data: AchievementsData): MilestoneTile[] {
  const tiles: MilestoneTile[] = [];
  const plates = data.tracks.filter(t => t.group === 'plates' && t.visible);
  for (const t of data.tracks) {
    if (!t.visible || t.group === 'plates') continue;
    const latest = [...t.badges].reverse().find(b => b.earned);
    tiles.push({ id: t.track, label: t.label, badge: latest ?? t.badges[0], locked: !latest, earned: t.earned_count, total: t.total, unit: t.unit });
  }
  if (plates.length) {
    // The most plates on any lift, the newest of those
    const earned = plates.flatMap(t => t.badges.filter(b => b.earned).map(b => ({ b, t })));
    earned.sort((x, y) => y.b.rung - x.b.rung || (y.b.earned_at ?? '').localeCompare(x.b.earned_at ?? ''));
    const top = earned[0];
    tiles.push({
      id: 'plates', label: 'Plates',
      badge: top ? top.b : plates[0].badges[0], locked: !top,
      earned: plates.reduce((s, t) => s + t.earned_count, 0),
      total: plates.reduce((s, t) => s + t.total, 0),
      unit: plates[0].unit,
    });
  }
  return tiles;
}

const NOT_YET_SHOWN: Record<string, string> = {
  volume: 'Volume appears after your first lifting workout.',
  running: 'Running distance appears after your first run.',
  ride: 'Ride distance appears after your first ride.',
  elevation: 'Elevation appears after your first GPS activity with a climb.',
};

/** A line for each track the user doesn't train yet, so its absence isn't a mystery */
export function notYetShownLines(data: AchievementsData): string[] {
  return data.tracks.filter(t => !t.visible && NOT_YET_SHOWN[t.track]).map(t => NOT_YET_SHOWN[t.track]);
}

export interface EarnedItem { key: string; title: string; threshold?: number; unit: string; state: EarnedState }

/** Every earned badge, newest first */
export function earnedBadges(data: AchievementsData): EarnedItem[] {
  const items: EarnedItem[] = [
    ...data.tracks.flatMap(t => t.badges.filter(b => b.earned).map(b => ({ key: b.key, title: b.title, threshold: b.threshold, unit: t.unit, state: b }))),
    ...[...data.feats, ...data.hidden].filter(f => f.earned).map(f => ({ key: f.key, title: f.title, unit: data.distance_unit, state: f })),
  ];
  return items.sort((a, b) => (b.state.earned_at ?? '').localeCompare(a.state.earned_at ?? ''));
}

/** The three finest earned badges (metal, then newest), until pinning (TODO §27 Phase 4) */
export function topBadges(data: AchievementsData, count = 3): EarnedItem[] {
  const rank = (item: EarnedItem) => {
    const look = badgeLook(item.key, { threshold: item.threshold });
    return METAL_RANK[look.metal] + (look.top ? 1 : 0);
  };
  return earnedBadges(data)
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .slice(0, count)
    .map(x => x.item);
}

