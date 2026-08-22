import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { LaurelBranch } from '../../components/LaurelWreath';
import GoldSectionRule from '../../components/GoldSectionRule';
import PRShareCard from '../../components/PRShareCard';
import SegmentedControl from '../../components/SegmentedControl';
import { loadPrPins, pinSlotKey, type PRPin } from '../../utils/prPins';
import { PR_GOLD, PR_GOLD_TEXT, PR_GOLD_BG } from '../../constants/prColors';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { captureAndShare } from '../../utils/shareCapture';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';
import {
  fmtPrValue, fmtPrContext, fmtPrDelta, fmtRelativeDate, fmtChartDate, formatChartYLabel,
  prTypeIcon, stalledUrgency, stalledCategoryToPrType, pickDefaultPrSeries, PR_METRIC_OPTIONS,
  type PREventItem, type StalledCategory,
} from '../../utils/prFormat';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'PRDashboard'>;

type WorkoutBest = { workout_id: number; workout_name: string; date: string; value: number } | null;

type DashboardData = {
  recent_events: PREventItem[];
  // 'week' = feed is scoped to the last 7 days (the normal case). 'all_time'
  // = the week was empty, so the backend fell back to the most recent PRs
  // regardless of age — the UI must not label those as "this week".
  recent_events_scope: 'week' | 'all_time';
  page: number;
  has_more: boolean;
  workout_bests: { best_volume: WorkoutBest; best_total_reps: WorkoutBest };
  stats: {
    prs_this_month: number;
    pr_streak_weeks: number;
    total_prs: number;
    days_since_last_pr: {
      exercise_template_id: number;
      exercise_name: string;
      days_since_last_pr: number;
      last_pr_at: string;
      // Per-category breakdown (same categories as the feed's filter chips),
      // null when the exercise has never earned a PR of that type.
      by_type: Record<StalledCategory, { days_since_last_pr: number; last_pr_at: string; weight_context: number | null } | null>;
    }[];
  };
};

const FILTERS = [
  { key: null,       label: 'All'      },
  { key: 'weight',   label: 'Weight'   },
  { key: 'reps',     label: 'Reps'     },
  { key: 'time',     label: 'Time'     },
  { key: 'distance', label: 'Distance' },
] as const;

const STALLED_SHOWN = 5;

const STALLED_CATEGORY_LABELS: Record<StalledCategory, string> = {
  weight: 'Weight', reps: 'Reps', time: 'Time', distance: 'Distance',
};

/**
 * Determines which category actually produced a stalled row's displayed
 * "days ago" (needed in "All" mode, since the aggregate days_since_last_pr
 * doesn't itself say which type it came from), plus the rep record's weight
 * context when relevant. Drives both the row's subtitle text and which
 * pr_type/weight_context gets pre-selected when the row is tapped through to
 * Progression.
 */
function stalledRowCategory(
  row: { by_type?: Record<StalledCategory, { days_since_last_pr: number; last_pr_at: string; weight_context: number | null } | null> },
  filter: StalledCategory | null,
): { category: StalledCategory | null; categoryLabel: string | null; weightContext: number | null } {
  if (filter) {
    // The active chip already says which category this is — don't repeat it,
    // but still surface the weight a rep record was set at.
    const entry = row.by_type?.[filter];
    return { category: filter, categoryLabel: null, weightContext: filter === 'reps' ? (entry?.weight_context ?? null) : null };
  }
  const present = (Object.entries(row.by_type ?? {}) as [StalledCategory, { days_since_last_pr: number; weight_context: number | null } | null][])
    .filter((e): e is [StalledCategory, { days_since_last_pr: number; weight_context: number | null }] => e[1] != null);
  if (present.length === 0) return { category: null, categoryLabel: null, weightContext: null };
  const [winningCategory, winningEntry] = present.reduce((best, cur) =>
    cur[1].days_since_last_pr < best[1].days_since_last_pr ? cur : best
  );
  return {
    category: winningCategory,
    categoryLabel: STALLED_CATEGORY_LABELS[winningCategory],
    weightContext: winningCategory === 'reps' ? (winningEntry.weight_context ?? null) : null,
  };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// list padding (md*2) + pin card padding (md*2) + a little breathing room
const PIN_CHART_W = SCREEN_WIDTH - spacing.md * 5;

type PinnedProgressionSectionProps = {
  pins: PRPin[];
  pinSeries: Record<string, PREventItem[]>;
  pinSeriesLoading: boolean;
  unit: string;
  distanceUnit: 'km' | 'mi';
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
  onOpen: (pin: PRPin, last?: PREventItem) => void;
  // False after the charts' first paint (tracked in the parent, so it
  // survives even if FlatList's ListHeaderComponent remounts this section on
  // an unrelated state change) — stops the chart from replaying its entrance
  // animation on every dashboard re-render, e.g. the feed's filter switching.
  animate: boolean;
};

/**
 * Its own memoized component (not an inline render function) so it only
 * re-renders when its own props actually change — not on every unrelated
 * dashboard state change (e.g. the feed's filter switching).
 */
const PinnedProgressionSection = React.memo(function PinnedProgressionSection({
  pins, pinSeries, pinSeriesLoading, unit, distanceUnit, colors, styles, onOpen, animate,
}: PinnedProgressionSectionProps) {
  return (
    <View>
      <GoldSectionRule icon="pin-outline" label="Pinned Progression" style={styles.sectionHeaderRow} />
      {pins.length === 0 ? (
        <Text style={styles.pinsHint}>
          Pin lifts from their progression view to keep them here.
        </Text>
      ) : (
        <View style={styles.pinList}>
          {pins.map(p => {
            const series = pinSeries[pinSlotKey(p)] ?? [];
            const canChart = series.length >= 2;
            const last = series[series.length - 1];
            const delta = last ? fmtPrDelta(last, unit, distanceUnit) : null;
            const metricLabel = p.prType ? PR_METRIC_OPTIONS.find(m => m.key === p.prType)?.label : null;
            const contextLabel = p.prType === 'max_reps' && p.weightContext != null
              ? ` @ ${p.weightContext === 0 ? 'Bodyweight' : `${p.weightContext} ${unit}`}`
              : '';
            let chartMin = 0, chartMax = 0, chartPad = 1;
            if (canChart) {
              chartMin = Math.min(...series.map(e => e.value));
              chartMax = Math.max(...series.map(e => e.value));
              chartPad = Math.max((chartMax - chartMin) * 0.15, 1);
            }
            return (
              <TouchableOpacity
                key={pinSlotKey(p)}
                style={[styles.pinCard, { backgroundColor: colors.surface }]}
                onPress={() => onOpen(p, last)}
                activeOpacity={0.7}
              >
                <View style={styles.pinCardHeader}>
                  <Ionicons name="pin" size={14} color={colors.accent} />
                  <View style={styles.pinCardTitleCol}>
                    <Text style={[styles.pinCardName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                    {metricLabel && (
                      <Text style={styles.pinCardSub} numberOfLines={1}>{metricLabel}{contextLabel}</Text>
                    )}
                  </View>
                  {last && (
                    <Text style={[styles.pinCardValue, { color: colors.textPrimary }]}>
                      {fmtPrValue(last, unit, distanceUnit)}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </View>
                {canChart ? (
                  <LineChart
                    data={series.map(e => ({ value: e.value, label: fmtChartDate(e.achieved_at) }))}
                    width={PIN_CHART_W}
                    height={70}
                    spacing={Math.max(28, Math.floor(PIN_CHART_W / Math.max(series.length - 1, 1)))}
                    color={colors.accent}
                    thickness={2}
                    hideDataPoints
                    areaChart
                    curved
                    isAnimated={animate}
                    rulesType="dashed"
                    rulesColor={colors.border}
                    rulesThickness={1}
                    yAxisTextStyle={styles.chartAxisLabel}
                    yAxisLabelWidth={28}
                    yAxisThickness={1}
                    yAxisColor={colors.border}
                    xAxisLabelTextStyle={styles.chartAxisLabel}
                    xAxisTextNumberOfLines={1}
                    xAxisThickness={1}
                    xAxisColor={colors.border}
                    noOfSections={2}
                    startFillColor={colors.accent}
                    endFillColor={colors.surface}
                    startOpacity={0.14}
                    endOpacity={0}
                    maxValue={chartMax - chartMin + chartPad * 2}
                    yAxisOffset={chartMin - chartPad}
                    roundToDigits={0}
                    formatYLabel={formatChartYLabel}
                    initialSpacing={12}
                    endSpacing={12}
                  />
                ) : (
                  <Text style={styles.pinCardEmpty}>
                    {pinSeriesLoading ? 'Loading…' : series.length === 1 ? 'Log another PR to see a trend' : 'No PR history yet'}
                  </Text>
                )}
                {delta && (
                  <View style={[styles.deltaPill, styles.pinDeltaPill, { backgroundColor: PR_GOLD_BG }]}>
                    <Ionicons name="trending-up" size={10} color={PR_GOLD_TEXT} />
                    <Text style={[styles.deltaPillText, { color: PR_GOLD_TEXT }]}>{delta}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
});

export default function PRDashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [data, setData]             = useState<DashboardData | null>(null);
  const [events, setEvents]         = useState<PREventItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chipLoading, setChipLoading] = useState(false);
  const [filter, setFilter]         = useState<typeof FILTERS[number]['key']>(null);
  // Independent of the feed's `filter` above — switches which PR type
  // "Time Since Last PR" is scoped to, using the by_type breakdown already
  // in the response (no extra fetch needed).
  const [stalledFilter, setStalledFilter] = useState<StalledCategory | null>(null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [shareEvent, setShareEvent] = useState<PREventItem | null>(null);
  const [menuEvent, setMenuEvent]   = useState<PREventItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [pins, setPins]             = useState<PRPin[]>([]);
  const [pinSeries, setPinSeries]         = useState<Record<string, PREventItem[]>>({});
  const [pinSeriesLoading, setPinSeriesLoading] = useState(false);
  const shareRef = useRef<View>(null);
  // Flips true after the pinned charts' first paint with real data — read
  // during render (not state) so flipping it doesn't itself trigger a
  // re-render; it just makes every render *after* the first one pass
  // isAnimated={false} to the charts, whether or not FlatList's
  // ListHeaderComponent happens to remount that section along the way.
  const pinsAnimatedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  const fetchPage = useCallback(async (page: number, type: typeof filter) => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (type) params.set('type', type);
    const res = await apiFetch(`/api/personal-records/dashboard?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  }, []);

  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Fetches and stores a filter's first page. Deliberately doesn't touch any
  // loading flag itself — callers decide which indicator (full-screen on
  // first mount, small inline one on a filter switch) applies.
  const loadFirstPage = useCallback(async (type: typeof filter, isAlive: () => boolean) => {
    try {
      const d = await fetchPage(1, type);
      if (d && isAlive()) {
        setData(d);
        setEvents(d.recent_events);
      }
    } catch {}
  }, [fetchPage]);

  // Fetches a mini progression series per pinned exercise, for the dashboard's
  // sparkline cards. Cheap — pins are capped at MAX_PR_PINS.
  const loadPinSeries = useCallback(async (pinList: PRPin[], isAlive: () => boolean) => {
    if (pinList.length === 0) {
      if (isAlive()) setPinSeries({});
      return;
    }
    setPinSeriesLoading(true);
    try {
      const results = await Promise.all(pinList.map(async p => {
        try {
          const res = await apiFetch(`/api/personal-records/history?exercise_template_id=${p.id}`);
          if (!res.ok) return [pinSlotKey(p), []] as const;
          const rows: PREventItem[] = await res.json();
          // A pin created before per-type pinning shipped has no prType — keep
          // its old auto-pick behavior. A type-specific pin shows exactly the
          // series it was pinned for.
          const series = p.prType
            ? rows.filter(e => e.pr_type === p.prType && (p.weightContext == null || e.weight_context === p.weightContext))
            : pickDefaultPrSeries(rows);
          return [pinSlotKey(p), series] as const;
        } catch {
          return [pinSlotKey(p), []] as const;
        }
      }));
      if (isAlive()) setPinSeries(Object.fromEntries(results));
    } finally {
      if (isAlive()) setPinSeriesLoading(false);
    }
  }, []);

  // Refresh on focus with whatever filter is active (PRs can change after
  // editing/deleting a workout reached from this screen)
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      await loadFirstPage(filterRef.current, () => alive);
      if (alive) setLoading(false);
    })();
    // Pins are toggled on PRProgressionScreen — refresh them, and their
    // charts, on the way back
    if (user?.id) {
      loadPrPins(user.id).then(p => {
        if (!alive) return;
        setPins(p);
        loadPinSeries(p, () => alive);
      });
    }
    return () => { alive = false; };
  }, [loadFirstPage, loadPinSeries, user?.id]));

  // Marks the pinned charts as having already appeared once real data has
  // loaded — every render from here on passes isAnimated={false} to them.
  useEffect(() => {
    if (Object.keys(pinSeries).length > 0) {
      pinsAnimatedRef.current = true;
    }
  }, [pinSeries]);

  // Switching filters re-filters the feed in place — the header (hero/records/
  // stalled/pins) and the list itself stay mounted; only a small inline
  // spinner near the chips shows while the new page loads. Skip the first
  // run — the focus effect above already covers the initial mount.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    let alive = true;
    setChipLoading(true);
    (async () => {
      await loadFirstPage(filter, () => alive);
      if (alive) setChipLoading(false);
    })();
    return () => { alive = false; };
  }, [filter, loadFirstPage]);

  const loadMore = async () => {
    if (!data?.has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(data.page + 1, filter);
      if (d) {
        setData(d);
        setEvents(prev => [...prev, ...d.recent_events]);
      }
    } catch {}
    setLoadingMore(false);
  };

  const openEventMenu = (event: PREventItem, e: any) => {
    const { pageX, pageY } = e.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    setMenuPosition({ top: pageY + 8, right: screenWidth - pageX - 4 });
    setMenuEvent(event);
  };

  const sharePr = (event: PREventItem) => {
    setShareEvent(event);
    // Let the off-screen card render before capturing it
    setTimeout(async () => {
      try {
        await captureAndShare(shareRef, 'Share your PR');
      } catch {}
      setShareEvent(null);
    }, 100);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const openWorkout = (workoutId: number) => navigation.navigate('WorkoutDetails', { workoutId });

  // useCallback (stable across re-renders) so it can be passed to the
  // memoized PinnedProgressionSection without invalidating its memo.
  const openProgression = useCallback((event: {
    exercise_template_id: number;
    exercise_name?: string;
    pr_type?: PREventItem['pr_type'];
    weight_context?: number | null;
  }) =>
    navigation.navigate('PRProgression', {
      exerciseTemplateId: event.exercise_template_id,
      exerciseName: event.exercise_name ?? '',
      prType: event.pr_type,
      weightContext: event.weight_context,
    }), [navigation]);

  // A pin already knows its own exact type/context; `last` (its most recent
  // event) is only a fallback for legacy pins that don't.
  const openPinnedProgression = useCallback((pin: PRPin, last?: PREventItem) => {
    openProgression({
      exercise_template_id: pin.id,
      exercise_name: pin.name,
      pr_type: pin.prType ?? last?.pr_type,
      weight_context: pin.weightContext ?? last?.weight_context,
    });
  }, [openProgression]);

  const stats = data?.stats;
  const bests = data?.workout_bests;
  const stalled = useMemo(() => {
    const rows = stats?.days_since_last_pr ?? [];
    if (!stalledFilter) return rows.slice(0, STALLED_SHOWN);
    // Re-derive from each row's own by_type entry — exercises that have
    // never earned a PR of this type drop out rather than showing a
    // misleading "stalled since forever". `by_type` may be absent if the API
    // hasn't deployed this field yet — treat that the same as "no match"
    // rather than throwing.
    return rows
      .filter(r => r.by_type?.[stalledFilter] != null)
      .map(r => ({ ...r, ...r.by_type[stalledFilter]! }))
      .sort((a, b) => b.days_since_last_pr - a.days_since_last_pr)
      .slice(0, STALLED_SHOWN);
  }, [stats, stalledFilter]);

  const renderHero = () =>
    stats ? (
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: PR_GOLD }]}>
          <View style={styles.heroStreakRow}>
            <LaurelBranch height={30} color={PR_GOLD} />
            <View style={styles.heroStreakCenter}>
              <Text style={[styles.heroStreakValue, { color: PR_GOLD_TEXT }]}>{stats.pr_streak_weeks}</Text>
              <Text style={styles.heroStreakLabel}>week PR streak</Text>
            </View>
            <LaurelBranch side="right" height={30} color={PR_GOLD} />
          </View>
          <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCol}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{stats.prs_this_month}</Text>
              <Text style={styles.heroStatLabel}>this month</Text>
            </View>
            <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.heroStatCol}>
              <Ionicons name="trophy-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{stats.total_prs}</Text>
              <Text style={styles.heroStatLabel}>total PRs</Text>
            </View>
          </View>
        </View>
    ) : null;

  const renderRecords = () =>
    bests && (bests.best_volume || bests.best_total_reps) ? (
        <View>
          <GoldSectionRule icon="ribbon-outline" label="Workout Records" style={styles.sectionHeaderRow} />
          <View style={styles.bestsRow}>
            {bests.best_volume && (
              <TouchableOpacity
                style={[styles.bestCard, { backgroundColor: colors.surface }]}
                onPress={() => openWorkout(bests.best_volume!.workout_id)}
                activeOpacity={0.7}
              >
                <View style={[styles.bestIconBadge, { backgroundColor: PR_GOLD_BG }]}>
                  <Ionicons name="barbell-outline" size={16} color={PR_GOLD_TEXT} />
                </View>
                <Text style={styles.bestLabel}>Most Volume</Text>
                <Text style={[styles.bestValue, { color: colors.textPrimary }]}>
                  {bests.best_volume.value.toLocaleString()} lbs
                </Text>
                <Text style={styles.bestMeta} numberOfLines={1}>
                  {bests.best_volume.workout_name} · {fmtRelativeDate(bests.best_volume.date)}
                </Text>
              </TouchableOpacity>
            )}
            {bests.best_total_reps && (
              <TouchableOpacity
                style={[styles.bestCard, { backgroundColor: colors.surface }]}
                onPress={() => openWorkout(bests.best_total_reps!.workout_id)}
                activeOpacity={0.7}
              >
                <View style={[styles.bestIconBadge, { backgroundColor: PR_GOLD_BG }]}>
                  <Ionicons name="repeat-outline" size={16} color={PR_GOLD_TEXT} />
                </View>
                <Text style={styles.bestLabel}>Most Reps</Text>
                <Text style={[styles.bestValue, { color: colors.textPrimary }]}>
                  {bests.best_total_reps.value.toLocaleString()} reps
                </Text>
                <Text style={styles.bestMeta} numberOfLines={1}>
                  {bests.best_total_reps.workout_name} · {fmtRelativeDate(bests.best_total_reps.date)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
    ) : null;

  // Gate the whole section on whether there's any stalled data at all — a
  // type filter that happens to match nothing still keeps the section (and
  // its chips) visible, just with an inline empty message, so switching
  // back to another type stays reachable.
  const hasStalledData = (stats?.days_since_last_pr.length ?? 0) > 0;

  const renderStalled = () =>
    hasStalledData ? (
        <View>
          <GoldSectionRule icon="hourglass-outline" label="Time Since Last PR" style={styles.sectionHeaderRow} />
          <SegmentedControl options={FILTERS} value={stalledFilter} onChange={setStalledFilter} style={styles.segmentedSpacing} />
          {stalled.length > 0 ? (
            <View style={[styles.trophyCard, { backgroundColor: colors.surface }]}>
              {stalled.map((row, i) => {
                const urgency = stalledUrgency(row.days_since_last_pr);
                const { category, categoryLabel, weightContext } = stalledRowCategory(row, stalledFilter);
                const subtitleParts: string[] = [];
                if (categoryLabel) subtitleParts.push(categoryLabel);
                if (weightContext != null) subtitleParts.push(weightContext === 0 ? 'Bodyweight' : `@ ${weightContext} ${unit}`);
                const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : null;
                return (
                  <TouchableOpacity
                    key={row.exercise_template_id}
                    style={[styles.trophyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                    onPress={() => openProgression({ ...row, pr_type: stalledCategoryToPrType(category), weight_context: weightContext })}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={urgency === 'stale' ? 'alert-circle-outline' : 'time-outline'}
                      size={16}
                      color={urgency === 'stale' ? colors.warmup : colors.textSecondary}
                    />
                    <View style={styles.trophyRowInfo}>
                      <Text style={[styles.trophyRowName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {row.exercise_name}
                      </Text>
                      {subtitle && (
                        <Text style={styles.trophyRowSub} numberOfLines={1}>{subtitle}</Text>
                      )}
                    </View>
                    <Text style={[styles.trophyRowMeta, urgency === 'stale' && { color: colors.warmup, fontWeight: '700' }]}>
                      {row.days_since_last_pr === 0 ? 'Today' : `${row.days_since_last_pr}d ago`}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.pinsHint}>No PRs of this type yet for your most-trained exercises.</Text>
          )}
        </View>
    ) : null;

  const feedScope = data?.recent_events_scope ?? 'week';

  const renderHeader = () => (
    <View>
      {renderHero()}
      {renderRecords()}
      <PinnedProgressionSection
        pins={pins}
        pinSeries={pinSeries}
        pinSeriesLoading={pinSeriesLoading}
        unit={unit}
        distanceUnit={distanceUnit}
        colors={colors}
        styles={styles}
        onOpen={openPinnedProgression}
        animate={!pinsAnimatedRef.current}
      />
      {renderStalled()}

      {/* Feed title + filter picker */}
      <GoldSectionRule
        icon="trophy-outline"
        label={feedScope === 'all_time' ? 'Recent PRs' : "This Week's PRs"}
        right={chipLoading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : undefined}
        style={styles.feedTitleRow}
      />
      {feedScope === 'all_time' && events.length > 0 && (
        <Text style={styles.feedScopeNote}>No new PRs this week. Here's your most recent</Text>
      )}
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} style={styles.segmentedSpacing} />
    </View>
  );

  const renderEvent = ({ item }: { item: PREventItem }) => {
    const context = fmtPrContext(item, unit);
    const delta = fmtPrDelta(item, unit, distanceUnit);
    return (
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: colors.surface }]}
        onPress={() => openWorkout(item.workout_id)}
        activeOpacity={0.7}
      >
        <View style={[styles.eventIconBadge, { backgroundColor: PR_GOLD_BG }]}>
          <Ionicons name={prTypeIcon(item.pr_type) as keyof typeof Ionicons.glyphMap} size={18} color={PR_GOLD_TEXT} />
        </View>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.exercise_name}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {item.pr_label}{context ? ` ${context}` : ''} · {fmtRelativeDate(item.achieved_at)}
          </Text>
        </View>
        <View style={styles.eventRight}>
          <Text style={[styles.eventValue, { color: colors.textPrimary }]}>
            {fmtPrValue(item, unit, distanceUnit)}
          </Text>
          {delta && (
            <View style={[styles.deltaPill, { backgroundColor: PR_GOLD_BG }]}>
              <Ionicons name="trending-up" size={10} color={PR_GOLD_TEXT} />
              <Text style={[styles.deltaPillText, { color: PR_GOLD_TEXT }]}>{delta}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={e => openEventMenu(item, e)}
          hitSlop={8}
          accessibilityLabel="PR actions"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PR Dashboard</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('PersonalRecords')}
          style={styles.viewAllBtn}
          hitSlop={8}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          // Pass an already-built element, not the bare `renderHeader`
          // function — a fresh function reference every render makes
          // FlatList treat it as a new component type and remount the whole
          // header subtree (discarding PinnedProgressionSection's memo and
          // replaying its chart's entrance animation) instead of just
          // re-rendering it in place.
          ListHeaderComponent={renderHeader()}
          ListEmptyComponent={
            // The backend already falls back to all-time history when the
            // week is empty, so an empty list here means zero PRs of this
            // (filtered) type have ever been recorded — not just none recently.
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter ? 'No PRs of this type yet' : 'No PRs yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {stats && stats.total_prs > 0
                  ? "You haven't set one of these yet. Keep training!"
                  : 'Log some workouts to start your history.'}
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} /> : null}
          renderItem={renderEvent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* PR card 3-dot menu — View Chart / Share */}
      <Modal
        visible={menuEvent !== null}
        transparent
        animationType="none"
        onRequestClose={() => setMenuEvent(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setMenuEvent(null)}
        />
        {menuEvent && (
          <View style={[styles.eventMenu, { top: menuPosition.top, right: menuPosition.right, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.eventMenuItem}
              onPress={() => {
                const event = menuEvent;
                setMenuEvent(null);
                openProgression(event);
              }}
            >
              <Ionicons name="stats-chart-outline" size={16} color={colors.textPrimary} />
              <Text style={[styles.eventMenuText, { color: colors.textPrimary }]}>View Chart</Text>
            </TouchableOpacity>
            <View style={[styles.eventMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.eventMenuItem}
              onPress={() => {
                const event = menuEvent;
                setMenuEvent(null);
                sharePr(event);
              }}
            >
              <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
              <Text style={[styles.eventMenuText, { color: colors.textPrimary }]}>Share PR</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {/* Off-screen share card */}
      {shareEvent && (
        <View ref={shareRef} style={styles.offscreen} collapsable={false}>
          <PRShareCard
            exerciseName={shareEvent.exercise_name ?? ''}
            prLabel={shareEvent.pr_label ?? 'PR'}
            value={fmtPrValue(shareEvent, unit, distanceUnit)}
            delta={fmtPrDelta(shareEvent, unit, distanceUnit)}
            date={fmtDate(shareEvent.achieved_at)}
            accentColor={colors.accent}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  viewAllBtn: {
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  viewAllText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.accent,
  },
  list: { padding: spacing.md, gap: spacing.sm },

  emptyState: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.xs },
  emptyTitle: { fontSize: typography.fontSize.md, fontWeight: '700' },
  emptySubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  // Hero — the trophy-case centerpiece
  heroCard: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  heroStreakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  heroStreakCenter: { alignItems: 'center', minWidth: 64 },
  heroStreakValue: { fontSize: 42, fontWeight: '800', letterSpacing: -0.5, lineHeight: 46 },
  heroStreakLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  heroStatCol: { alignItems: 'center', gap: 2 },
  heroStatValue: { fontSize: typography.fontSize.lg, fontWeight: '800' },
  heroStatLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  heroStatDivider: { width: StyleSheet.hairlineWidth, height: 28 },

  // Margins only — row layout, gap, icon, and label styling all live in the
  // shared GoldSectionRule component now.
  sectionHeaderRow: { marginTop: spacing.md, marginBottom: spacing.sm },
  feedTitleRow: { marginTop: spacing.md, marginBottom: spacing.sm },
  feedScopeNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },

  bestsRow: { flexDirection: 'row', gap: spacing.sm },
  bestCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bestIconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  bestLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  bestValue: { fontSize: typography.fontSize.lg, fontWeight: '800', marginTop: spacing.xs },
  bestMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },

  trophyCard: { borderRadius: radius.md, overflow: 'hidden' },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  trophyRowInfo: { flex: 1 },
  trophyRowName: { fontSize: typography.fontSize.md, fontWeight: '600' },
  trophyRowSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  trophyRowMeta: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  pinsHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  pinList: { gap: spacing.sm },
  pinCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    overflow: 'hidden',
  },
  pinCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  pinCardTitleCol: { flex: 1 },
  pinCardName: { fontSize: typography.fontSize.md, fontWeight: '600' },
  pinCardSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  pinCardValue: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  pinCardEmpty: { fontSize: typography.fontSize.xs, color: colors.textSecondary, paddingVertical: spacing.sm },
  pinDeltaPill: { alignSelf: 'flex-start', marginTop: spacing.xs },
  chartAxisLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

  segmentedSpacing: { marginBottom: spacing.xs },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  eventIconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: { flex: 1 },
  eventName: { fontSize: typography.fontSize.md, fontWeight: '700', marginBottom: 2 },
  eventMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  eventRight: { alignItems: 'flex-end' },
  eventValue: { fontSize: typography.fontSize.md, fontWeight: '700' },
  eventMenu: {
    position: 'absolute',
    width: 170,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  eventMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  eventMenuText: { fontSize: typography.fontSize.sm, fontWeight: '500' },
  eventMenuDivider: { height: 1 },

  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  deltaPillText: { fontSize: typography.fontSize.xs, fontWeight: '700' },

  offscreen: { position: 'absolute', left: -9999, top: -9999 },
});
