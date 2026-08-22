import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-gifted-charts';
import { LaurelBranch } from '../../components/LaurelWreath';
import GoldSectionRule from '../../components/GoldSectionRule';
import SegmentedControl from '../../components/SegmentedControl';
import { PR_GOLD, PR_GOLD_TEXT } from '../../constants/prColors';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';
import { fmtPrValue, fmtPrDelta, fmtChartDate, formatChartYLabel, computeChartYAxisRange, PR_METRIC_OPTIONS, type PREventItem } from '../../utils/prFormat';
import { loadPrPins, togglePrPin, pinMatches, MAX_PR_PINS } from '../../utils/prPins';
import { showToast } from '../../utils/toast';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'PRProgression'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - spacing.md * 4;
const CHART_Y_SECTIONS = 4;
// Weight/milestone context picker — a horizontal snapping list with the
// selected item centered, rather than a wrapping row of chips.
const CONTEXT_ITEM_W = 88;
const CONTEXT_LIST_W = SCREEN_WIDTH - spacing.md * 2;

export default function PRProgressionScreen({ navigation, route }: Props) {
  const { exerciseTemplateId, exerciseName, prType, weightContext } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [events, setEvents]   = useState<PREventItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Pre-seeded from the row/card that was actually tapped (e.g. a Max Reps
  // entry opens on Max Reps, not whatever metric has top priority) — the
  // fetch effect below only overrides these if they turn out invalid for
  // this exercise's actual history.
  const [metric, setMetric]   = useState<PREventItem['pr_type'] | null>(prType ?? null);
  const [context, setContext] = useState<number | null>(weightContext ?? null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [pinned, setPinned]   = useState(false);
  const contextListRef = useRef<ScrollView>(null);

  // Pinning is per (exercise, PR type, context) now — any metric shown on
  // this screen can be pinned independently, not just whichever the
  // exercise's single pin used to default to.
  useEffect(() => {
    if (!user?.id || !metric) { setPinned(false); return; }
    loadPrPins(user.id).then(pins => {
      setPinned(pins.some(p => pinMatches(p, { id: exerciseTemplateId, prType: metric, weightContext: context })));
    });
  }, [user?.id, exerciseTemplateId, metric, context]);

  const onTogglePin = async () => {
    if (!user?.id || !metric) return;
    const next = await togglePrPin(user.id, { id: exerciseTemplateId, name: exerciseName, prType: metric, weightContext: context });
    if (next === null) {
      showToast(`You can pin up to ${MAX_PR_PINS} PRs. Unpin one first.`);
      return;
    }
    setPinned(next.some(p => pinMatches(p, { id: exerciseTemplateId, prType: metric, weightContext: context })));
  };

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/personal-records/history?exercise_template_id=${exerciseTemplateId}`);
        if (res.ok && alive) {
          const rows: PREventItem[] = await res.json();
          setEvents(rows);
          setMetric(prev => {
            if (prev && rows.some(e => e.pr_type === prev)) return prev; // honor the tapped type
            const firstMetric = PR_METRIC_OPTIONS.find(m => rows.some(e => e.pr_type === m.key));
            return firstMetric ? firstMetric.key : null;
          });
        }
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [exerciseTemplateId]);

  const availableMetrics = useMemo(
    () => PR_METRIC_OPTIONS.filter(m => events.some(e => e.pr_type === m.key)),
    [events],
  );

  // Distinct weight contexts for the selected metric (rep records per weight,
  // cardio bests per milestone). Single-context metrics skip the chip row.
  const contexts = useMemo(() => {
    if (!metric) return [];
    const seen = new Map<number, string>();
    events
      .filter(e => e.pr_type === metric && e.weight_context != null)
      .forEach(e => {
        if (!seen.has(e.weight_context!)) {
          let label = e.pr_label ?? String(e.weight_context);
          if (metric === 'max_reps') {
            label = e.weight_context === 0 ? 'Bodyweight' : `${e.weight_context} ${unit}`;
          } else {
            label = label.replace(' Best Time', '').replace(' Best Distance', '');
          }
          seen.set(e.weight_context!, label);
        }
      });
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.value - b.value); // smallest to largest, independent of default-selection below
  }, [events, metric, unit]);

  // The context to fall back to when the current one becomes invalid (metric
  // switch, or nothing seeded) — the first one ever recorded for this
  // metric, chronologically. Computed separately from `contexts` above so
  // sorting that list for display doesn't change which value defaults in.
  const firstSeenContext = useMemo(() => {
    if (!metric) return null;
    const first = events.find(e => e.pr_type === metric && e.weight_context != null);
    return first ? first.weight_context! : null;
  }, [events, metric]);

  // Reset context when the metric changes; default to the first-ever context
  useEffect(() => {
    if (contexts.length > 0) {
      setContext(prev => (prev != null && contexts.some(c => c.value === prev) ? prev : (firstSeenContext ?? contexts[0].value)));
    } else {
      setContext(null);
    }
  }, [contexts, firstSeenContext]);

  // Keeps the horizontal context list positioned on the selected item when
  // it changes for a reason other than the user's own scroll (metric switch,
  // or the initial route-seeded weight). A no-op when the user's own scroll
  // already left it there.
  useEffect(() => {
    if (context == null) return;
    const idx = contexts.findIndex(c => c.value === context);
    if (idx < 0) return;
    contextListRef.current?.scrollTo({ x: idx * CONTEXT_ITEM_W, animated: false });
  }, [contexts, context]);

  const handleContextScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CONTEXT_ITEM_W);
    const picked = contexts[Math.max(0, Math.min(contexts.length - 1, idx))];
    if (picked) setContext(picked.value);
  };

  const series = useMemo(
    () => events.filter(e =>
      e.pr_type === metric && (context == null || e.weight_context === context)
    ),
    [events, metric, context],
  );

  const chartData = useMemo(
    () => series.map(e => ({ value: e.value, label: fmtChartDate(e.achieved_at) })),
    [series],
  );
  const { maxValue: chartMaxValue, yAxisOffset: chartYAxisOffset } = useMemo(
    () => computeChartYAxisRange(series.map(e => e.value), CHART_Y_SECTIONS),
    [series],
  );

  // Total improvement across the whole visible series, formatted by piggybacking
  // on fmtPrDelta's unit-aware formatting (which already handles the best_time
  // "lower is better" inversion via improved_by's sign convention).
  const totalDelta = useMemo(() => {
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const diff = metric === 'best_time' ? first.value - last.value : last.value - first.value;
    if (diff <= 0) return null;
    return fmtPrDelta({ ...last, previous_value: first.value, improved_by: diff }, unit, distanceUnit);
  }, [series, metric, unit, distanceUnit]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

  const fmtTableDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{exerciseName || 'Progression'}</Text>
        <TouchableOpacity
          onPress={onTogglePin}
          style={styles.pinBtn}
          hitSlop={8}
          disabled={!metric}
          accessibilityLabel={pinned ? 'Unpin from PR Dashboard' : 'Pin to PR Dashboard'}
        >
          <Ionicons
            name={pinned ? 'pin' : 'pin-outline'}
            size={20}
            color={pinned ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No PR history yet</Text>
          <Text style={styles.emptySubtitle}>Log a PR for this exercise to start tracking it.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* Hero — current best, laurel-flanked, with total improvement */}
          {series.length > 0 && (
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: PR_GOLD }]}>
              <View style={styles.heroRow}>
                <LaurelBranch height={24} color={PR_GOLD} />
                <View style={styles.heroCenter}>
                  <Text style={[styles.heroValue, { color: PR_GOLD_TEXT }]}>
                    {fmtPrValue(series[series.length - 1], unit, distanceUnit)}
                  </Text>
                  <Text style={styles.heroCaption}>current best</Text>
                </View>
                <LaurelBranch side="right" height={24} color={PR_GOLD} />
              </View>
              {totalDelta && (
                <Text style={styles.heroImprovement}>
                  {totalDelta} since {fmtDate(series[0].achieved_at)}
                </Text>
              )}
            </View>
          )}

          {/* Metric selector */}
          <SegmentedControl options={availableMetrics} value={metric} onChange={setMetric} style={styles.metricSegmented} />

          {/* Context selector (rep weights / cardio milestones) — a horizontal
              snapping list with the selected value centered under the marker,
              instead of a wrapping row of chips. */}
          {contexts.length > 1 && (
            <View style={styles.contextPickerWrap}>
              <ScrollView
                ref={contextListRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CONTEXT_ITEM_W}
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: (CONTEXT_LIST_W - CONTEXT_ITEM_W) / 2 }}
                onMomentumScrollEnd={handleContextScrollEnd}
              >
                {contexts.map((c, idx) => {
                  const active = context === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.contextItem, { width: CONTEXT_ITEM_W }]}
                      onPress={() => {
                        setContext(c.value);
                        contextListRef.current?.scrollTo({ x: idx * CONTEXT_ITEM_W, animated: true });
                      }}
                    >
                      <Text
                        style={[
                          styles.contextItemText,
                          { color: active ? colors.textPrimary : colors.textSecondary },
                          active && styles.contextItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View pointerEvents="none" style={[styles.contextCenterMarker, { borderColor: colors.accent }]} />
            </View>
          )}

          <GoldSectionRule icon="stats-chart-outline" label="Progression" style={styles.sectionHeaderRow} />

          {/* Chart — shape at a glance, with real axes now; the table below still carries exact numbers */}
          {series.length >= 2 && (
            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              <LineChart
                data={chartData}
                width={CHART_W}
                height={140}
                // Floor of 40 (not just enough to fit the points) so an "M/D" x-axis
                // label always has room — LineChart scrolls horizontally on its own
                // once content exceeds CHART_W, so a long history just becomes
                // swipeable instead of squeezing labels until they collide.
                spacing={Math.max(40, Math.floor(CHART_W / Math.max(chartData.length - 1, 1)))}
                color={colors.accent}
                thickness={2}
                dataPointsColor={colors.accent}
                dataPointsRadius={3}
                startFillColor={colors.accent}
                endFillColor={colors.surface}
                startOpacity={0.16}
                endOpacity={0}
                areaChart
                curved
                isAnimated
                rulesType="dashed"
                rulesColor={colors.border}
                rulesThickness={1}
                yAxisTextStyle={styles.chartAxisLabel}
                yAxisLabelWidth={36}
                yAxisThickness={1}
                yAxisColor={colors.border}
                xAxisLabelTextStyle={styles.chartAxisLabel}
                xAxisTextNumberOfLines={1}
                xAxisThickness={1}
                xAxisColor={colors.border}
                noOfSections={CHART_Y_SECTIONS}
                maxValue={chartMaxValue}
                yAxisOffset={chartYAxisOffset}
                roundToDigits={0}
                formatYLabel={formatChartYLabel}
                initialSpacing={24}
                endSpacing={24}
              />
            </View>
          )}

          {/* Progression table */}
          <View style={[styles.table, { backgroundColor: colors.surface }]}>
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.thDate, styles.th]}>Date</Text>
              <Text style={[styles.thValue, styles.th]}>Value</Text>
              <Text style={[styles.thDelta, styles.th]}>Δ</Text>
              <Text style={[styles.thWorkout, styles.th]} numberOfLines={1}>Workout</Text>
            </View>
            {[...series].reverse().map((e, i) => {
              const delta = fmtPrDelta(e, unit, distanceUnit);
              const isCurrent = i === 0;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.tableRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  onPress={() => navigation.navigate('WorkoutDetails', { workoutId: e.workout_id })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.thDate, styles.dateCell]}>
                    {isCurrent && <Ionicons name="trophy" size={11} color={PR_GOLD_TEXT} />}
                    <Text style={[styles.td, { color: colors.textSecondary }]}>{fmtTableDate(e.achieved_at)}</Text>
                  </View>
                  <Text style={[styles.thValue, styles.td, styles.tdValue, { color: colors.textPrimary }]}>
                    {fmtPrValue(e, unit, distanceUnit)}
                  </Text>
                  <Text style={[styles.thDelta, styles.td, { color: delta ? colors.save : colors.textSecondary }]}>
                    {delta ?? '—'}
                  </Text>
                  <Text style={[styles.thWorkout, styles.td, { color: colors.textSecondary }]} numberOfLines={1}>
                    {e.workout_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
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
  pinBtn: { width: 40, alignItems: 'flex-end' },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: { padding: spacing.md, gap: spacing.sm },

  emptyState: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.xs, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: typography.fontSize.md, fontWeight: '700' },
  emptySubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  heroCard: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  heroCenter: { alignItems: 'center', minWidth: 100 },
  heroValue: { fontSize: typography.fontSize.xxl, fontWeight: '800', letterSpacing: -0.5 },
  heroCaption: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroImprovement: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },

  sectionHeaderRow: { marginTop: spacing.sm },
  metricSegmented: { marginTop: spacing.xs },

  contextPickerWrap: { height: 52, justifyContent: 'center' },
  contextItem: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  contextItemText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  contextItemTextActive: { fontSize: typography.fontSize.md, fontWeight: '800' },
  contextCenterMarker: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: '50%',
    width: CONTEXT_ITEM_W,
    marginLeft: -CONTEXT_ITEM_W / 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },

  chartCard: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  chartAxisLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

  table: { borderRadius: radius.md, overflow: 'hidden' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  tableHeader: { borderBottomWidth: 1 },
  th: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: { fontSize: typography.fontSize.sm },
  tdValue: { fontWeight: '700' },
  dateCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  thDate: { width: 88 },
  thValue: { width: 84 },
  thDelta: { width: 74 },
  thWorkout: { flex: 1 },
});
