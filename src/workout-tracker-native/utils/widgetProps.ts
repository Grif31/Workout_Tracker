import { ACCENT_PRESETS } from '../context/ThemeContext';
import { GREEK_RANK_COLORS, GREEK_RANK_TEXT_COLORS, GREEK_RANKS } from '../constants/greekRanks';
import { distanceGoalProgress, formatDistanceValue } from './weeklyDistanceGoal';
import { isStale, nextMondayStart, viewRoutine, viewWeek, WIDGET_STALE_AFTER_MS, type WidgetSnapshot } from './widgetSnapshot';

// What each iOS widget draws at one moment, worked out in the app. The layout
// functions in widgets/ run in the widget extension's own JS runtime and can't
// import anything, so every label, count and color is decided here and the
// layout only picks the light or dark value and arranges it for its size.
// Pure, so the wording and the week rollover are tested in Jest.

export const WIDGET_LINKS = {
  home: 'aretefitness://widget/home',
  greekRank: 'aretefitness://widget/greek-rank',
  coach: 'aretefitness://widget/coach',
  upNext: 'aretefitness://widget/up-next',
} as const;

/** Up Next's Start: a new workout with this routine day filled in. */
export function upNextStartLink(routineId: number, dayIndex: number): string {
  return `${WIDGET_LINKS.upNext}?routine=${routineId}&day=${dayIndex}`;
}

export type WidgetRoute =
  | { tab: 'DashboardTab' }
  | { tab: 'ProfileTab'; screen: 'GreekRank' }
  | { tab: 'TrainingTab' }
  | { tab: 'DashboardTab'; start: { routineId: number; dayIndex: number } };

// By hand: React Native's URLSearchParams throws "not implemented" on get()
function queryNumber(url: string, name: string): number | null {
  const m = url.match(new RegExp(`[?&]${name}=(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

/** Where a widget tap lands, or null for a link that isn't a widget's. */
export function widgetRouteFor(url: string | null | undefined): WidgetRoute | null {
  const link = url?.split(/[?#]/)[0].replace(/\/+$/, '');
  if (link === WIDGET_LINKS.home) return { tab: 'DashboardTab' };
  if (link === WIDGET_LINKS.greekRank) return { tab: 'ProfileTab', screen: 'GreekRank' };
  if (link === WIDGET_LINKS.coach) return { tab: 'TrainingTab' };
  if (link === WIDGET_LINKS.upNext) {
    const routineId = queryNumber(url!, 'routine');
    const dayIndex = queryNumber(url!, 'day');
    return routineId != null && dayIndex != null
      ? { tab: 'DashboardTab', start: { routineId, dayIndex } }
      : { tab: 'DashboardTab' };
  }
  return null;
}

/** Images the app has copied into the App Group for the extension to read. */
export type WidgetImages = {
  logoDark: string | null;
  logoLight: string | null;
  /** Rendered muscle diagrams by diagramKey, for Up Next on iOS. */
  diagrams?: Record<string, { dark: string; light: string }>;
};

/** One file per set of muscles and highlight colors, so a new accent or a changed day renders anew. */
export function diagramKey(muscles: string[], accentDark: string, accentLight: string): string {
  const text = [...muscles].sort().join(',') + '|' + accentDark + accentLight;
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export type UpNextProps = Shared & {
  state: 'next' | 'allDone' | 'noRoutine';
  routineName: string;
  /** "Day 2 · Pull" */
  dayTitle: string;
  /** "Deadlift, Pull-ups, Barbell Row and 2 more" */
  exercisesLine: string;
  /** Every day done: "All 3 Days Complete", under "Great Job!" */
  doneLine: string;
  /** "Day 1 · Push is up on Monday" */
  mondayLine: string;
  /** The next day's muscle groups; Android draws its own diagram from them. */
  muscles: string[];
  /** iOS: the rendered diagram's file, if the app has made it yet. */
  diagramDark?: string;
  diagramLight?: string;
};

function exercisesLine(names: string[]): string {
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export function upNextProps(snapshot: WidgetSnapshot | null, date: Date, images: WidgetImages): UpNextProps {
  const routine = snapshot?.routine ?? null;
  const view = routine ? viewRoutine(routine, date) : null;
  const next = view?.next ?? null;
  const base = shared(snapshot, date, images, !routine ? WIDGET_LINKS.coach
    : next ? upNextStartLink(routine.id, next.index) : WIDGET_LINKS.home);
  const diagram = next ? images.diagrams?.[diagramKey(next.muscles, base.accentDark, base.accentLight)] : undefined;
  const days = view?.dayCount ?? 0;
  return {
    ...base,
    state: !routine ? 'noRoutine' : next ? 'next' : 'allDone',
    routineName: routine?.name ?? '',
    dayTitle: next ? `Day ${next.index + 1} · ${next.label}` : '',
    exercisesLine: next ? exercisesLine(next.exercises) : '',
    doneLine: `All ${days} Day${days === 1 ? '' : 's'} Complete`,
    mondayLine: routine?.days[0] ? `Day 1 · ${routine.days[0].label} is up on Monday` : '',
    muscles: next?.muscles ?? [],
    diagramDark: diagram?.dark,
    diagramLight: diagram?.light,
  };
}

type Shared = WidgetImages & {
  loggedIn: boolean;
  stale: boolean;
  staleLabel: string;
  accentDark: string;
  accentLight: string;
  /** Text on an accent fill (a Start button), per background. */
  onAccentDark: string;
  onAccentLight: string;
  url: string;
};

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The stored accent, or the default green, with the text color each preset uses on it. */
export function widgetAccent(snapshot: WidgetSnapshot | null) {
  const dark = snapshot?.accent?.dark ?? ACCENT_PRESETS[0].value;
  const light = snapshot?.accent?.light ?? ACCENT_PRESETS[0].light;
  const preset = ACCENT_PRESETS.find(a => a.value === dark && a.light === light) ?? ACCENT_PRESETS[0];
  return { dark, light, onDark: preset.text, onLight: preset.lightText };
}

function shared(snapshot: WidgetSnapshot | null, date: Date, images: WidgetImages, url: string): Shared {
  const updated = snapshot ? new Date(snapshot.updatedAt) : null;
  const accent = widgetAccent(snapshot);
  return {
    ...images,
    loggedIn: snapshot != null,
    stale: snapshot != null && isStale(snapshot, date.getTime()),
    staleLabel: updated ? `Open Aretē to update. Last updated ${MONTHS[updated.getMonth()]} ${updated.getDate()}.` : '',
    accentDark: accent.dark,
    accentLight: accent.light,
    onAccentDark: accent.onDark,
    onAccentLight: accent.onLight,
    url,
  };
}

export type WeeklyGoalProps = Shared & {
  hasWeek: boolean;
  done: number;
  goal: number;
  goalMet: boolean;
  days: { letter: string; trained: boolean; today: boolean }[];
  streakWeeks: number;
  /** "1 to go", or "Goal met". */
  remainingLabel: string;
  /** Lock screen, beside the date: "2 of 3 workouts this week". */
  inlineLabel: string;
  /** Null without a distance goal. */
  distance: { label: string; fill: number } | null;
};

export function weeklyGoalProps(snapshot: WidgetSnapshot | null, date: Date, images: WidgetImages): WeeklyGoalProps {
  const base = shared(snapshot, date, images, WIDGET_LINKS.home);
  const week = snapshot?.week ? viewWeek(snapshot.week, date) : null;
  if (!week) {
    return {
      ...base, hasWeek: false, done: 0, goal: 3, goalMet: false,
      days: DAY_LETTERS.map((letter, i) => ({ letter, trained: false, today: i === (date.getDay() + 6) % 7 })),
      streakWeeks: 0, remainingLabel: '', inlineLabel: 'Open Aretē to see your week', distance: null,
    };
  }
  const remaining = week.goal - week.done;
  const distance = week.distanceGoalKm != null
    ? distanceGoalProgress(week.distanceKm, week.distanceGoalKm, week.distanceUnit)
    : null;
  return {
    ...base,
    hasWeek: true,
    done: week.done,
    goal: week.goal,
    goalMet: week.goalMet,
    days: DAY_LETTERS.map((letter, i) => ({ letter, trained: week.trainedDays[i], today: i === week.todayIndex })),
    streakWeeks: week.streakWeeks,
    remainingLabel: week.goalMet ? 'Goal met' : `${remaining} to go`,
    inlineLabel: `${week.done} of ${week.goal} workout${week.goal === 1 ? '' : 's'} this week`,
    distance: distance && {
      label: `${formatDistanceValue(distance.done)} / ${formatDistanceValue(distance.goal)} ${week.distanceUnit}`,
      fill: distance.fill,
    },
  };
}

export type GreekRankProps = Shared & {
  hasRank: boolean;
  rank: string;
  letter: string;
  /** Badge and bar. */
  color: string;
  /** The rank name as text, per background. */
  textDark: string;
  textLight: string;
  isTop: boolean;
  heldByGate: boolean;
  /** "41 points", or "84 points, enough for Titan" when a gate holds it back. */
  pointsLabel: string;
  progress: number;
  /** One short line: points to the next rank, the gate, or "Excellence" at the top. */
  smallCaption: string;
  /** Medium: the full gate requirement and where the user stands, when a gate is in the way. */
  gateDetail: string | null;
  bandLowLabel: string;
  bandHighLabel: string;
  components: { label: string; value: number }[];
  /** Lock screen rectangle: "Hero · 41". */
  headline: string;
};

export function greekRankProps(snapshot: WidgetSnapshot | null, date: Date, images: WidgetImages): GreekRankProps {
  const base = shared(snapshot, date, images, WIDGET_LINKS.greekRank);
  const r = snapshot?.greekRank ?? null;
  const band = GREEK_RANKS.find(g => g.name === r?.rank) ?? GREEK_RANKS[0];
  const next = GREEK_RANKS[GREEK_RANKS.indexOf(band) + 1] ?? null;
  const isTop = next == null;
  const smallCaption = !r ? ''
    : isTop ? 'Excellence'
    : r.heldByGate ? 'Unlock by logging a Strength or Endurance Score'
    : r.pointsToNext && r.pointsToNext > 0
      ? `${r.pointsToNext} point${r.pointsToNext === 1 ? '' : 's'} to ${next.name}`
      : r.gateText ?? `Keep training to reach ${next.name}`;
  return {
    ...base,
    hasRank: r != null,
    rank: band.name,
    letter: band.icon,
    color: GREEK_RANK_COLORS[band.name],
    textDark: GREEK_RANK_TEXT_COLORS.dark[band.name],
    textLight: GREEK_RANK_TEXT_COLORS.light[band.name],
    isTop,
    heldByGate: !!r?.heldByGate,
    pointsLabel: !r ? ''
      : r.heldByGate && r.earnedRank !== r.rank ? `${r.score} points, enough for ${r.earnedRank}`
      : `${r.score} point${r.score === 1 ? '' : 's'}`,
    progress: r ? r.bandProgress : 0,
    smallCaption,
    gateDetail: r?.gateText && !isTop
      ? `${r.gateText}.${r.bestPercentile != null ? ` You're at the ${ordinal(r.bestPercentile)}.` : ''}`
      : null,
    bandLowLabel: `${band.name} ${band.low}`,
    bandHighLabel: next ? `${next.name} ${next.low}` : '',
    components: r ? [
      { label: 'Consistency', value: r.components.consistency },
      { label: 'Dedication', value: r.components.dedication },
      { label: 'Volume', value: r.components.volume },
    ] : [],
    headline: r ? `${band.name} · ${r.score}` : 'Greek Rank',
  };
}

/**
 * `props` with every null or undefined value left out, at any depth.
 * expo-widgets saves an iOS timeline to UserDefaults, which takes only
 * property-list values: a JS null arrives as NSNull, and one anywhere in the
 * props makes iOS refuse the whole timeline, so the widget never gets past its
 * greyed-out placeholder. The layouts read a missing field the same as null.
 */
export function withoutNulls<T>(props: T): T {
  if (Array.isArray(props)) return props.filter(v => v != null).map(withoutNulls) as T;
  if (props && typeof props === 'object') {
    return Object.fromEntries(
      Object.entries(props).filter(([, v]) => v != null).map(([k, v]) => [k, withoutNulls(v)]),
    ) as T;
  }
  return props;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * When a widget's picture next changes with no new data: the Monday rollover,
 * and the moment the snapshot turns stale. The first entry is always now.
 */
export function widgetTimelineDates(snapshot: WidgetSnapshot | null, now: Date): Date[] {
  const dates = [now];
  if (snapshot) {
    const later = [nextMondayStart(now).getTime(), snapshot.updatedAt + WIDGET_STALE_AFTER_MS + 1]
      .filter(t => t > now.getTime())
      .sort((a, b) => a - b);
    for (const t of later) dates.push(new Date(t));
  }
  return dates;
}
