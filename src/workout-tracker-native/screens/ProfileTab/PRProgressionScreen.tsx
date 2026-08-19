import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-gifted-charts';
import { LaurelBranch } from '../../components/LaurelWreath';
import GoldSectionRule from '../../components/GoldSectionRule';
import { PR_GOLD, PR_GOLD_TEXT } from '../../constants/prColors';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';
import { fmtPrValue, fmtPrDelta, PR_METRIC_OPTIONS, type PREventItem } from '../../utils/prFormat';
import { loadPrPins, togglePrPin, MAX_PR_PINS } from '../../utils/prPins';
import { showToast } from '../../utils/toast';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'PRProgression'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - spacing.md * 4;

export default function PRProgressionScreen({ navigation, route }: Props) {
  const { exerciseTemplateId, exerciseName } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [events, setEvents]   = useState<PREventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric]   = useState<PREventItem['pr_type'] | null>(null);
  const [context, setContext] = useState<number | null>(null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [pinned, setPinned]   = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadPrPins(user.id).then(pins => {
      setPinned(pins.some(p => p.id === exerciseTemplateId));
    });
  }, [user?.id, exerciseTemplateId]);

  const onTogglePin = async () => {
    if (!user?.id) return;
    const next = await togglePrPin(user.id, { id: exerciseTemplateId, name: exerciseName });
    if (next === null) {
      showToast(`You can pin up to ${MAX_PR_PINS} exercises. Unpin one first.`);
      return;
    }
    setPinned(next.some(p => p.id === exerciseTemplateId));
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
          const firstMetric = PR_METRIC_OPTIONS.find(m => rows.some(e => e.pr_type === m.key));
          if (firstMetric) setMetric(firstMetric.key);
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
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [events, metric, unit]);

  // Reset context when the metric changes; default to the most recent series
  useEffect(() => {
    if (contexts.length > 0) {
      setContext(prev => (prev != null && contexts.some(c => c.value === prev) ? prev : contexts[0].value));
    } else {
      setContext(null);
    }
  }, [contexts]);

  const series = useMemo(
    () => events.filter(e =>
      e.pr_type === metric && (context == null || e.weight_context === context)
    ),
    [events, metric, context],
  );

  const chartData = useMemo(
    () => series.map(e => ({ value: e.value })),
    [series],
  );
  const chartMin = Math.min(...series.map(e => e.value));
  const chartMax = Math.max(...series.map(e => e.value));
  // Pad the y-range so a flat-ish series doesn't hug the chart edges
  const chartPad = Math.max((chartMax - chartMin) * 0.15, 1);

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
          <View style={styles.chipRow}>
            {availableMetrics.map(m => {
              const active = metric === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, { borderColor: colors.border }, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
                  onPress={() => setMetric(m.key)}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Context selector (rep weights / cardio milestones) */}
          {contexts.length > 1 && (
            <View style={styles.chipRow}>
              {contexts.map(c => {
                const active = context === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.contextChip, active && { backgroundColor: colors.accent + '20' }]}
                    onPress={() => setContext(c.value)}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <GoldSectionRule icon="stats-chart-outline" label="Progression" style={styles.sectionHeaderRow} />

          {/* Sparkline — shape at a glance; the table below carries exact numbers */}
          {series.length >= 2 && (
            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              <LineChart
                data={chartData}
                width={CHART_W}
                height={100}
                spacing={Math.max(24, Math.floor(CHART_W / Math.max(chartData.length - 1, 1)))}
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
                hideRules
                hideYAxisText
                yAxisThickness={0}
                xAxisThickness={0}
                maxValue={chartMax - chartMin + chartPad * 2}
                yAxisOffset={chartMin - chartPad}
                initialSpacing={12}
                endSpacing={12}
                disableScroll
              />
            </View>
          )}

          {/* Progression table */}
          <View style={[styles.table, { backgroundColor: colors.surface }]}>
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.thDate, styles.th]}>Date</Text>
              <Text style={[styles.thValue, styles.th]}>Value</Text>
              <Text style={[styles.thDelta, styles.th]}>Δ</Text>
              <Text style={[styles.thWorkout, styles.th]}>Workout</Text>
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

  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  sectionHeaderRow: { marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  contextChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
  },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '600' },

  chartCard: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },

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
