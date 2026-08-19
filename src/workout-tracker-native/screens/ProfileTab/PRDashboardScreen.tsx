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
import PRShareCard from '../../components/PRShareCard';
import { loadPrPins, type PRPin } from '../../utils/prPins';
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
  fmtPrValue, fmtPrContext, fmtPrDelta, fmtRelativeDate, prTypeIcon,
  stalledUrgency, pickDefaultPrSeries, type PREventItem,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// list padding (md*2) + pin card padding (md*2) + a little breathing room
const PIN_CHART_W = SCREEN_WIDTH - spacing.md * 5;

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
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [shareEvent, setShareEvent] = useState<PREventItem | null>(null);
  const [menuEvent, setMenuEvent]   = useState<PREventItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [pins, setPins]             = useState<PRPin[]>([]);
  const [pinSeries, setPinSeries]         = useState<Record<number, PREventItem[]>>({});
  const [pinSeriesLoading, setPinSeriesLoading] = useState(false);
  const shareRef = useRef<View>(null);

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
          if (!res.ok) return [p.id, []] as const;
          const rows: PREventItem[] = await res.json();
          return [p.id, pickDefaultPrSeries(rows)] as const;
        } catch {
          return [p.id, []] as const;
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

  const openProgression = (event: { exercise_template_id: number; exercise_name?: string }) =>
    navigation.navigate('PRProgression', {
      exerciseTemplateId: event.exercise_template_id,
      exerciseName: event.exercise_name ?? '',
    });

  const stats = data?.stats;
  const bests = data?.workout_bests;
  const stalled = stats?.days_since_last_pr.slice(0, STALLED_SHOWN) ?? [];

  const SectionHeader = ({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) => (
    <View style={styles.sectionHeaderRow}>
      <Ionicons name={icon} size={14} color={PR_GOLD_TEXT} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

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
          <SectionHeader icon="ribbon-outline" title="Workout Records" />
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

  const renderStalled = () =>
    stalled.length > 0 ? (
        <View>
          <SectionHeader icon="hourglass-outline" title="Time Since Last PR" />
          <View style={[styles.trophyCard, { backgroundColor: colors.surface }]}>
            {stalled.map((row, i) => {
              const urgency = stalledUrgency(row.days_since_last_pr);
              return (
                <TouchableOpacity
                  key={row.exercise_template_id}
                  style={[styles.trophyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  onPress={() => openProgression(row)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={urgency === 'stale' ? 'alert-circle-outline' : 'time-outline'}
                    size={16}
                    color={urgency === 'stale' ? colors.warmup : colors.textSecondary}
                  />
                  <Text style={[styles.trophyRowName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {row.exercise_name}
                  </Text>
                  <Text style={[styles.trophyRowMeta, urgency === 'stale' && { color: colors.warmup, fontWeight: '700' }]}>
                    {row.days_since_last_pr === 0 ? 'Today' : `${row.days_since_last_pr}d ago`}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
    ) : null;

  const renderProgression = () => (
        <View>
          <SectionHeader icon="pin-outline" title="Pinned Progression" />
          {pins.length === 0 ? (
            <Text style={styles.pinsHint}>
              Pin lifts from their progression view to keep them here.
            </Text>
          ) : (
            <View style={styles.pinList}>
              {pins.map(p => {
                const series = pinSeries[p.id] ?? [];
                const canChart = series.length >= 2;
                const last = series[series.length - 1];
                const delta = last ? fmtPrDelta(last, unit, distanceUnit) : null;
                let chartMin = 0, chartMax = 0, chartPad = 1;
                if (canChart) {
                  chartMin = Math.min(...series.map(e => e.value));
                  chartMax = Math.max(...series.map(e => e.value));
                  chartPad = Math.max((chartMax - chartMin) * 0.15, 1);
                }
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pinCard, { backgroundColor: colors.surface }]}
                    onPress={() => navigation.navigate('PRProgression', { exerciseTemplateId: p.id, exerciseName: p.name })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pinCardHeader}>
                      <Ionicons name="pin" size={14} color={colors.accent} />
                      <Text style={[styles.pinCardName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                      {last && (
                        <Text style={[styles.pinCardValue, { color: colors.textPrimary }]}>
                          {fmtPrValue(last, unit, distanceUnit)}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                    </View>
                    {canChart ? (
                      <LineChart
                        data={series.map(e => ({ value: e.value }))}
                        width={PIN_CHART_W}
                        height={44}
                        spacing={Math.max(16, Math.floor(PIN_CHART_W / Math.max(series.length - 1, 1)))}
                        color={colors.accent}
                        thickness={2}
                        hideDataPoints
                        areaChart
                        curved
                        hideRules
                        hideYAxisText
                        yAxisThickness={0}
                        xAxisThickness={0}
                        startFillColor={colors.accent}
                        endFillColor={colors.surface}
                        startOpacity={0.14}
                        endOpacity={0}
                        maxValue={chartMax - chartMin + chartPad * 2}
                        yAxisOffset={chartMin - chartPad}
                        initialSpacing={4}
                        endSpacing={4}
                        disableScroll
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

  const feedScope = data?.recent_events_scope ?? 'week';

  const renderHeader = () => (
    <View>
      {renderHero()}
      {renderRecords()}
      {renderStalled()}
      {renderProgression()}

      {/* Feed title + filter chips */}
      <View style={styles.feedTitleRow}>
        <Text style={styles.sectionTitle}>{feedScope === 'all_time' ? 'Recent PRs' : "This Week's PRs"}</Text>
        {chipLoading && <ActivityIndicator size="small" color={colors.textSecondary} />}
      </View>
      {feedScope === 'all_time' && events.length > 0 && (
        <Text style={styles.feedScopeNote}>No new PRs this week — here's your most recent</Text>
      )}
      <View style={styles.chipRow}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, { borderColor: colors.border }, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
          ListHeaderComponent={renderHeader}
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
                  ? "You haven't set one of these yet — keep training!"
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

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
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
  bestValue: { fontSize: typography.fontSize.lg, fontWeight: '800', marginTop: 4 },
  bestMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 4 },

  trophyCard: { borderRadius: radius.md, overflow: 'hidden' },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  trophyRowName: { flex: 1, fontSize: typography.fontSize.md, fontWeight: '600' },
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
  pinCardName: { flex: 1, fontSize: typography.fontSize.md, fontWeight: '600' },
  pinCardValue: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  pinCardEmpty: { fontSize: typography.fontSize.xs, color: colors.textSecondary, paddingVertical: spacing.sm },
  pinDeltaPill: { alignSelf: 'flex-start', marginTop: spacing.xs },

  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '600' },

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
    marginTop: 4,
  },
  deltaPillText: { fontSize: typography.fontSize.xs, fontWeight: '700' },

  offscreen: { position: 'absolute', left: -9999, top: -9999 },
});
