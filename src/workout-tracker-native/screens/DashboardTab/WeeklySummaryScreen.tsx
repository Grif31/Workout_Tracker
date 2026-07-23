import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';
import { DashboardStackParamsList, WeeklySummaryData } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

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

export default function WeeklySummaryScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<WeeklySummaryData | null>(route.params?.data ?? null);
  const [loading, setLoading] = useState(!route.params?.data);
  const [error, setError] = useState(false);
  const [viewingPastWeek, setViewingPastWeek] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const fetchWeek = useCallback(async (week?: string) => {
    setLoading(true);
    setError(false);
    try {
      const qs = week ? `?week=${week}` : '';
      const res = await apiFetch(`/api/stats/weekly-summary${qs}`);
      if (!res.ok) { setError(true); return; }
      const json: WeeklySummaryData = await res.json();
      setData(json);
      setViewingPastWeek(!!week);
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

  const trainedDayStrs = useMemo(() => new Set(data?.training_days ?? []), [data]);
  const weekDayStrs = useMemo(
    () => (data ? Array.from({ length: 7 }, (_, i) => addDaysStr(data.week_start, i)) : []),
    [data]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Summary</Text>
        <View style={{ width: 24 }} />
      </View>

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
          {viewingPastWeek && (
            <TouchableOpacity onPress={() => fetchWeek()} style={styles.backToLatestBtn}>
              <Ionicons name="arrow-back" size={14} color={colors.accent} />
              <Text style={styles.backToLatestText}>Back to This Week</Text>
            </TouchableOpacity>
          )}

          <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
            <Text style={styles.weekRange}>{fmtDateRange(data.week_start, data.week_end)}</Text>
          </Animated.View>

          {data.workouts === 0 ? (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No workouts logged</Text>
              <Text style={styles.emptySubtitle}>Nothing to recap for this week.</Text>
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.section}>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{data.workouts}</Text>
                    <Text style={styles.statLabel}>Workouts</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{data.total_volume.toLocaleString()}</Text>
                    <Text style={styles.statLabel}>Volume ({data.weight_unit})</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{data.total_reps}</Text>
                    <Text style={styles.statLabel}>Reps</Text>
                  </View>
                </View>
                <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{fmtDuration(data.total_duration_min)}</Text>
                    <Text style={styles.statLabel}>Training Time</Text>
                  </View>
                  {data.distance_km != null && (
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{data.distance_km}</Text>
                      <Text style={styles.statLabel}>km</Text>
                    </View>
                  )}
                  {data.bodyweight_change && (
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>
                        {data.bodyweight_change.end > data.bodyweight_change.start ? '+' : ''}
                        {(data.bodyweight_change.end - data.bodyweight_change.start).toFixed(1)}
                      </Text>
                      <Text style={styles.statLabel}>{data.weight_unit} Change</Text>
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

              {Object.keys(data.muscle_sets).length > 0 && (
                <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.section}>
                  <Text style={styles.sectionTitle}>Muscle Groups</Text>
                  <View style={styles.card}>
                    {Object.entries(data.muscle_sets)
                      .sort((a, b) => b[1] - a[1])
                      .map(([muscle, count], i) => (
                        <React.Fragment key={muscle}>
                          {i > 0 && <View style={styles.divider} />}
                          <View style={styles.muscleRow}>
                            <Text style={styles.muscleName}>{muscle}</Text>
                            <Text style={styles.muscleCount}>{count} set{count !== 1 ? 's' : ''}</Text>
                          </View>
                        </React.Fragment>
                      ))}
                  </View>
                </Animated.View>
              )}

              {data.prs.length > 0 && (
                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.section}>
                  <Text style={styles.sectionTitle}>Personal Records</Text>
                  <View style={styles.card}>
                    {data.prs.map((pr, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <View style={styles.divider} />}
                        <View style={styles.prRow}>
                          <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                          <Text style={styles.prLabel}>{PR_TYPE_LABELS[pr.pr_type] ?? pr.pr_type}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </Animated.View>
              )}
            </>
          )}

          {history && history.length > 0 && (
            <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.section}>
              <Text style={styles.sectionTitle}>Past Weeks</Text>
              <View style={styles.card}>
                {history.map((row, i) => (
                  <React.Fragment key={row.week_start}>
                    {i > 0 && <View style={styles.divider} />}
                    <TouchableOpacity style={styles.historyRow} onPress={() => fetchWeek(row.week_start)}>
                      <Text style={styles.historyDate}>{fmtDateRange(row.week_start, row.week_end)}</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <Text style={styles.historyStat}>{row.workouts} wk</Text>
                        <Text style={styles.historyStat}>{row.total_volume.toLocaleString()}</Text>
                      </View>
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
              </View>
            </Animated.View>
          )}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      ) : null}
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
  weekRange: { fontSize: typography.fontSize.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  backToLatestBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginBottom: spacing.sm },
  backToLatestText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.accent },
  sectionTitle: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  dayDotWrap: { alignItems: 'center', gap: 6 },
  dayDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
  dayLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  muscleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  muscleName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  muscleCount: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  prRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  prExercise: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  prLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  historyDate: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  historyStat: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
});
