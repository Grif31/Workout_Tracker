import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import { DashboardStackParamsList, WeeklySummaryData } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { PR_GOLD, PR_GOLD_TEXT, PR_GOLD_BG } from '../../constants/prColors';
import { fmtHold, RPE_KEY } from '../../components/workout/types';
import { LaurelBranch } from '../../components/LaurelWreath';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WeeklySummary'>;

// Per-user suffix applied by every consumer, matching the established
// convention (see COACH_PROFILE_KEY in CoachProfileModal.tsx).
export const WEEKLY_SUMMARY_LAST_SHOWN_KEY = 'weekly_summary_last_shown';

const PR_TYPE_LABELS: Record<string, string> = {
  max_weight: 'Max Weight', max_reps: 'Rep Record', max_duration: 'Longest Hold',
  best_time: 'Best Time', best_distance: 'Best Distance',
};

type HistoryRow = { week_start: string; week_end: string; workouts: number; total_volume: number };

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Categorical data-viz palette (CVD-validated), NOT a themed UI color — chart
// series need fixed, checked hues rather than the accent-derived theme
// tokens. "Other" (the folded-tail bucket) gets muted gray instead of a 6th
// hue since it isn't a real distinct entity worth a scarce categorical slot.
const MUSCLE_PIE_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  otherLight: '#898781',
  otherDark: '#898781',
};
const MAX_MUSCLE_SLICES = 5;

// Parse a "YYYY-MM-DD" string via local Y/M/D components — never via
// `new Date(isoString)`, which parses date-only strings as UTC midnight and
// can shift the displayed day in negative-UTC-offset timezones (the same
// class of bug CLAUDE.md's `toISOString()` rule guards against, just in the
// parsing direction instead of the formatting direction).
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysStr(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateRange(startIso: string, endIsoExclusive: string): string {
  const start = parseLocalDate(startIso);
  const end = parseLocalDate(endIsoExclusive);
  end.setDate(end.getDate() - 1); // week_end from the API is exclusive
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(mins: number): string {
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// weight_context is a sentinel -1 (not null) on this endpoint's raw query for
// pr_types that don't use it (max_weight, estimated_1rm) — treat <0 as absent,
// matching PersonalRecord.to_dict()'s convention everywhere else in the app.
function formatPrValue(pr: { pr_type: string; value: number; weight_context?: number }, weightUnit: string): string {
  const ctx = pr.weight_context != null && pr.weight_context >= 0 ? pr.weight_context : null;
  switch (pr.pr_type) {
    case 'max_weight':
      return `${pr.value} ${weightUnit}`;
    case 'max_reps':
      return ctx != null
        ? `${pr.value} reps @ ${ctx === 0 ? 'BW' : `${ctx} ${weightUnit}`}`
        : `${pr.value} reps`;
    case 'best_time':
      return ctx != null ? `${fmtTime(pr.value)} / ${ctx}km` : fmtTime(pr.value);
    case 'best_distance':
      return ctx != null ? `${pr.value.toFixed(2)}km / ${ctx}min` : `${pr.value.toFixed(2)}km`;
    case 'max_duration':
      return fmtHold(pr.value);
    default:
      return `${pr.value}`;
  }
}

export default function WeeklySummaryScreen({ navigation, route }: Props) {
  const { colors, mode } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<WeeklySummaryData | null>(route.params?.data ?? null);
  const [loading, setLoading] = useState(!route.params?.data);
  const [error, setError] = useState(false);
  const [latestWeekStart, setLatestWeekStart] = useState<string | null>(route.params?.data?.week_start ?? null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedMuscleIdx, setSelectedMuscleIdx] = useState<number | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [rpeEnabled, setRpeEnabled] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);

  const fetchWeek = useCallback(async (week?: string) => {
    setLoading(true);
    setError(false);
    setSelectedMuscleIdx(null);
    try {
      const qs = week ? `?week=${week}` : '';
      const res = await apiFetch(`/api/stats/weekly-summary${qs}`);
      if (!res.ok) { setError(true); return; }
      const json: WeeklySummaryData = await res.json();
      setData(json);
      if (!week) setLatestWeekStart(json.week_start);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!route.params?.data) fetchWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiFetch('/api/stats/weekly-summary/history')
      .then(res => (res.ok ? res.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.multiGet([`workout_weekly_goal_${user.id}`, `${RPE_KEY}_${user.id}`]).then(pairs => {
      const [goalRaw, rpeRaw] = pairs.map(p => p[1]);
      const goal = goalRaw ? parseInt(goalRaw, 10) : 3;
      setWeeklyGoal(Number.isFinite(goal) && goal > 0 ? goal : 3);
      setRpeEnabled(rpeRaw === 'true');
    });
  }, [user?.id]);

  useEffect(() => {
    apiFetch(`/api/stats/profile?weekly_goal=${weeklyGoal}`)
      .then(res => (res.ok ? res.json() : null))
      .then(ps => setStreak(ps?.current_streak ?? null))
      .catch(() => setStreak(null));
  }, [weeklyGoal]);

  const isAtLatest = !!data && data.week_start === latestWeekStart;
  const goToWeek = (week: string) => fetchWeek(week);
  const goPrevWeek = () => data && goToWeek(addDaysStr(data.week_start, -7));
  const goNextWeek = () => data && !isAtLatest && goToWeek(addDaysStr(data.week_start, 7));

  const trainedDayStrs = useMemo(() => new Set(data?.training_days ?? []), [data]);
  const weekDayStrs = useMemo(
    () => (data ? Array.from({ length: 7 }, (_, i) => addDaysStr(data.week_start, i)) : []),
    [data]
  );

  const muscleSlices = useMemo(() => {
    if (!data) return [];
    const sorted = Object.entries(data.muscle_sets).sort((a, b) => b[1] - a[1]);
    const palette = mode === 'dark' ? MUSCLE_PIE_COLORS.dark : MUSCLE_PIE_COLORS.light;
    const otherColor = mode === 'dark' ? MUSCLE_PIE_COLORS.otherDark : MUSCLE_PIE_COLORS.otherLight;
    const top = sorted.slice(0, MAX_MUSCLE_SLICES).map(([muscle, count], i) => ({
      muscle, count, color: palette[i],
    }));
    const rest = sorted.slice(MAX_MUSCLE_SLICES);
    if (rest.length > 0) {
      top.push({ muscle: 'Other', count: rest.reduce((sum, [, c]) => sum + c, 0), color: otherColor });
    }
    return top;
  }, [data, mode]);
  const totalMuscleSets = useMemo(() => muscleSlices.reduce((sum, s) => sum + s.count, 0), [muscleSlices]);
  const toggleMuscleSlice = (i: number) => setSelectedMuscleIdx(prev => (prev === i ? null : i));

  // Top muscle by raw (unsliced) count — separate from `muscleSlices`, which
  // folds anything past the top 5 into "Other" for the pie chart. Using the
  // raw data here means this callout never names "Other" as the focus.
  const topMuscle = useMemo(() => {
    if (!data) return null;
    const sorted = Object.entries(data.muscle_sets).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }, [data]);

  // Delta vs. the week before — omitted entirely when there's nothing to
  // compare (both weeks zero) or no change; "New" when starting from zero
  // avoids a divide-by-zero / infinite percentage.
  const renderStatDelta = (current: number, prev: number) => {
    if (prev === 0 && current === 0) return null;
    if (prev === 0) {
      return (
        <View style={styles.deltaRow}>
          <Ionicons name="trending-up" size={11} color={colors.save} />
          <Text style={[styles.deltaText, { color: colors.save }]}>New</Text>
        </View>
      );
    }
    const pct = Math.round(((current - prev) / prev) * 100);
    if (pct === 0) return null;
    const up = pct > 0;
    const deltaColor = up ? colors.save : colors.danger;
    return (
      <View style={styles.deltaRow}>
        <Ionicons name={up ? 'trending-up' : 'trending-down'} size={11} color={deltaColor} />
        <Text style={[styles.deltaText, { color: deltaColor }]}>{up ? '+' : ''}{pct}%</Text>
      </View>
    );
  };

  // 4-week rolling average, shown alongside the vs.-last-week delta above so
  // a spike/dip reads against a stable baseline rather than just one prior week.
  const renderRollingAvg = (avg: number, isVolume: boolean) => {
    if (avg === 0) return null;
    return (
      <Text style={styles.avgCaption}>
        avg {isVolume ? Math.round(avg).toLocaleString() : avg}
      </Text>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Summary</Text>
        <View style={{ width: 24 }} />
      </View>

      {data && (
        <View style={styles.weekNavRow}>
          <TouchableOpacity onPress={goPrevWeek} style={styles.weekNavArrow} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPickerVisible(true)} style={styles.weekNavLabel}>
            <Text style={styles.weekRange}>{fmtDateRange(data.week_start, data.week_end)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNextWeek}
            disabled={isAtLatest}
            style={styles.weekNavArrow}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={20} color={isAtLatest ? colors.border : colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Couldn't load summary</Text>
          <Text style={styles.emptySubtitle}>Check your connection and try again</Text>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {data.workouts === 0 ? (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No workouts logged</Text>
              <Text style={styles.emptySubtitle}>Nothing to recap for this week.</Text>
            </Animated.View>
          ) : (
            <>
              {streak != null && streak >= 1 && (
                <Animated.View entering={FadeInDown.duration(400)} style={styles.streakRow}>
                  <Text style={styles.streakText}>🔥 {streak} week streak</Text>
                </Animated.View>
              )}

              <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, data.workouts >= weeklyGoal && { color: colors.save }]}>
                      {data.workouts}/{weeklyGoal}
                    </Text>
                    <Text style={styles.statLabel}>Workouts</Text>
                    {renderStatDelta(data.workouts, data.prev_week_workouts)}
                    {renderRollingAvg(data.rolling_avg_workouts, false)}
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{data.total_volume.toLocaleString()}</Text>
                    <Text style={styles.statLabel}>Volume ({data.weight_unit})</Text>
                    {renderStatDelta(data.total_volume, data.prev_week_volume)}
                    {renderRollingAvg(data.rolling_avg_volume, true)}
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{data.total_reps}</Text>
                    <Text style={styles.statLabel}>Reps</Text>
                  </View>
                </View>
                <View style={[styles.statsRow, styles.statsRowWrap, { marginTop: spacing.sm }]}>
                  <View style={[styles.statBox, styles.statBoxWrap]}>
                    <Text style={styles.statValue}>{fmtDuration(data.total_duration_min)}</Text>
                    <Text style={styles.statLabel}>Training Time</Text>
                  </View>
                  {data.distance_km != null && (
                    <View style={[styles.statBox, styles.statBoxWrap]}>
                      <Text style={styles.statValue}>{data.distance_km}</Text>
                      <Text style={styles.statLabel}>km</Text>
                    </View>
                  )}
                  {data.bodyweight_change && (
                    <View style={[styles.statBox, styles.statBoxWrap]}>
                      <Text style={styles.statValue}>
                        {data.bodyweight_change.end > data.bodyweight_change.start ? '+' : ''}
                        {(data.bodyweight_change.end - data.bodyweight_change.start).toFixed(1)}
                      </Text>
                      <Text style={styles.statLabel}>{data.weight_unit} Change</Text>
                    </View>
                  )}
                  {data.avg_rpe != null && rpeEnabled && (
                    <View style={[styles.statBox, styles.statBoxWrap]}>
                      <Text style={styles.statValue}>{data.avg_rpe}</Text>
                      <Text style={styles.statLabel}>Avg RPE</Text>
                    </View>
                  )}
                  {data.calories_burned != null && (
                    <View style={[styles.statBox, styles.statBoxWrap]}>
                      <Text style={styles.statValue}>{data.calories_burned.toLocaleString()}</Text>
                      <Text style={styles.statLabel}>Calories</Text>
                    </View>
                  )}
                </View>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.section}>
                <Text style={styles.sectionTitle}>Training Days</Text>
                <View style={styles.dayRow}>
                  {WEEKDAY_LABELS.map((label, i) => {
                    const trained = trainedDayStrs.has(weekDayStrs[i]);
                    return (
                      <View key={i} style={styles.dayDotWrap}>
                        <View style={[styles.dayDot, trained && { backgroundColor: colors.accent }]} />
                        <Text style={styles.dayLabel}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>

              {muscleSlices.length > 0 && (
                <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.section}>
                  <Text style={styles.sectionTitle}>Muscle Groups</Text>
                  {topMuscle && topMuscle !== 'Other' && (
                    <Text style={styles.focusLine}>{topMuscle} was your focus this week</Text>
                  )}
                  <View style={[styles.card, styles.pieCard]}>
                    <PieChart
                      data={muscleSlices.map((s, i) => ({
                        value: s.count, color: s.color,
                        focused: selectedMuscleIdx === i,
                      }))}
                      donut
                      radius={72}
                      innerRadius={44}
                      innerCircleColor={colors.surface}
                      strokeWidth={2}
                      strokeColor={colors.surface}
                      focusOnPress
                      extraRadius={6}
                      onPress={(_item: unknown, index: number) => toggleMuscleSlice(index)}
                      centerLabelComponent={() => {
                        const sel = selectedMuscleIdx != null ? muscleSlices[selectedMuscleIdx] : null;
                        return (
                          <View style={{ alignItems: 'center' }}>
                            <Text style={styles.pieCenterValue}>{sel ? sel.count : totalMuscleSets}</Text>
                            <Text style={styles.pieCenterLabel} numberOfLines={1}>
                              {sel ? `${sel.muscle} set${sel.count !== 1 ? 's' : ''}` : 'sets'}
                            </Text>
                          </View>
                        );
                      }}
                    />
                    <View style={styles.pieLegend}>
                      {muscleSlices.map((s, i) => {
                        const selected = selectedMuscleIdx === i;
                        return (
                          <TouchableOpacity
                            key={s.muscle}
                            style={[styles.legendRow, selected && { backgroundColor: s.color + '22' }]}
                            onPress={() => toggleMuscleSlice(i)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                            <Text style={[styles.muscleName, selected && { fontWeight: '800' }]} numberOfLines={1}>
                              {s.muscle}
                            </Text>
                            <Text style={styles.muscleCount}>
                              {selected ? `${s.count} set${s.count !== 1 ? 's' : ''}` : `${Math.round((s.count / totalMuscleSets) * 100)}%`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              )}

              {data.most_improved_lift && (
                <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.section}>
                  <View style={[styles.card, styles.milCard]}>
                    <Ionicons name="trending-up" size={20} color={colors.accent} />
                    <Text style={styles.milText}>
                      <Text style={styles.milExercise}>{data.most_improved_lift.exercise_name}</Text>
                      {': Est. 1RM up to '}
                      <Text style={styles.milExercise}>{data.most_improved_lift.this_best} {data.weight_unit}</Text>
                      {' (+'}{data.most_improved_lift.gain}{')'}
                    </Text>
                  </View>
                </Animated.View>
              )}

              {data.prs.length > 0 && (
                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.section}>
                  <View style={styles.prSectionTitleRow}>
                    <LaurelBranch height={16} color={PR_GOLD} />
                    <Text style={[styles.sectionTitle, { color: PR_GOLD_TEXT }]}>
                      Personal Records ({data.prs.length})
                    </Text>
                    <LaurelBranch side="right" height={16} color={PR_GOLD} />
                  </View>
                  <View style={styles.prCard}>
                    {data.prs.map((pr, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <View style={styles.prDivider} />}
                        <View style={styles.prRow}>
                          <View style={styles.prInfo}>
                            <Text style={styles.prExercise} numberOfLines={1}>{pr.exercise_name}</Text>
                            <Text style={styles.prTypeLabel}>{PR_TYPE_LABELS[pr.pr_type] ?? pr.pr_type}</Text>
                          </View>
                          <View style={styles.topValueRow}>
                            <LaurelBranch height={18} color={PR_GOLD} />
                            <Text style={styles.prValue}>{formatPrValue(pr, data.weight_unit)}</Text>
                            <LaurelBranch side="right" height={18} color={PR_GOLD} />
                          </View>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </Animated.View>
              )}
            </>
          )}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      ) : null}

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={[styles.pickerCard, { marginTop: insets.top + 96 }]} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Past Weeks</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(history ?? []).map((row, i) => (
                <React.Fragment key={row.week_start}>
                  {i > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.historyRow}
                    onPress={() => { goToWeek(row.week_start); setPickerVisible(false); }}
                  >
                    <Text style={styles.historyDate}>{fmtDateRange(row.week_start, row.week_end)}</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      <Text style={styles.historyStat}>{row.workouts} wk</Text>
                      <Text style={styles.historyStat}>{row.total_volume.toLocaleString()}</Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
              {history && history.length === 0 && (
                <Text style={styles.emptySubtitle}>No past weeks yet</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  scroll: { padding: spacing.md, gap: spacing.md },
  section: { gap: spacing.sm },
  weekNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  weekNavArrow: { padding: spacing.sm },
  weekNavLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' },
  weekRange: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  sectionTitle: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  streakRow: { alignItems: 'center' },
  streakText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  statsRow: { flexDirection: 'row', gap: 10 },
  statsRowWrap: { flexWrap: 'wrap' },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  statBoxWrap: { flexBasis: '30%', flexGrow: 1 },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  deltaText: { fontSize: 11, fontWeight: '700' },
  avgCaption: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  dayDotWrap: { alignItems: 'center', gap: 6 },
  dayDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
  dayLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  focusLine: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  milCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
  },
  milText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  milExercise: { fontWeight: '700' },
  pieCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, overflow: 'visible',
  },
  pieCenterValue: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  pieCenterLabel: { fontSize: 11, color: colors.textSecondary, maxWidth: 76, textAlign: 'center' },
  pieLegend: { flex: 1, gap: spacing.xs },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  muscleName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  muscleCount: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  prSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prCard: { backgroundColor: PR_GOLD_BG, borderRadius: 14, overflow: 'hidden' },
  prDivider: { height: 1, backgroundColor: PR_GOLD, opacity: 0.35, marginHorizontal: spacing.md },
  prRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  topValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prInfo: { flex: 1 },
  prExercise: { fontSize: typography.fontSize.md, fontWeight: '700', color: PR_GOLD_TEXT },
  prTypeLabel: {
    fontSize: 12, color: PR_GOLD_TEXT, opacity: 0.75, textTransform: 'uppercase',
    letterSpacing: 0.4, marginTop: 1,
  },
  prValue: { fontSize: typography.fontSize.md, fontWeight: '800', color: PR_GOLD_TEXT },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  historyDate: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  historyStat: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' },
  pickerCard: {
    width: '88%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
  },
  pickerTitle: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs,
  },
});
