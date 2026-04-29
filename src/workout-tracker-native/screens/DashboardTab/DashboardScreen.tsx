import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayVolume, WeightUnit } from 'utils/units';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SCREEN_WIDTH = Dimensions.get('window').width;

const GREETINGS = [
  'Ready to workout', 'Welcome', 'Ready to Train', "Let's Workout",
  'Crush it today', 'Train hard today', 'Make today count',
  'Stronger every day', 'Time to sweat', 'Bring your best',
];

function getDailyGreeting() {
  const key = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 1e9;
  return GREETINGS[Math.abs(hash) % GREETINGS.length];
}


type WeekStat = { label: string; volume: number; count: number };
type DashboardStats = {
  weekly: WeekStat[];
  last_7_days: { workouts: number; volume: number; sets: number };
  this_week_dates: string[];
};
type User = { id: number; username: string; email: string; active_routine_id?: number | null };
type Workout = {
  id: number; name: string; notes: string; date: Date;
  duration?: number; volume?: number; total_reps?: number;
  num_exercises?: number; muscles?: string[]; pr_count?: number;
};
type Exercise = { id: number; name: string; muscle_group: string };
type RoutineDay = {
  id: number; day_order: number; label: string;
  workout_template: { id: number; name: string; exercises: Exercise[] };
};
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };

type Props = NativeStackScreenProps<DashboardStackParamsList, 'DashboardHome'>;

// ─── This Week Calendar ──────────────────────────────────────────────────────
function WeekCalendar({
  workoutDates,
  selectedDate,
  onSelectDate,
}: {
  workoutDates: string[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const { colors } = useTheme();
  const calStyles = useMemo(() => createCalStyles(colors), [colors]);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const workoutSet = new Set(workoutDates);

  return (
    <View style={calStyles.row}>
      {DAY_LETTERS.map((letter, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const isToday = dateStr === todayStr;
        const hasWorkout = workoutSet.has(dateStr);
        const isSelected = dateStr === selectedDate;

        return (
          <TouchableOpacity
            key={i}
            onPress={() => onSelectDate(dateStr)}
            style={[
              calStyles.cell,
              isToday && calStyles.cellToday,
              hasWorkout && calStyles.cellWorkout,
              isSelected && calStyles.cellSelected,
            ]}
          >
            <Text style={[calStyles.letter, isToday && calStyles.letterToday, hasWorkout && calStyles.letterWorkout, isSelected && calStyles.letterSelected]}>
              {letter}
            </Text>
            <Text style={[calStyles.num, isToday && calStyles.numToday, hasWorkout && calStyles.numWorkout, isSelected && calStyles.numSelected]}>
              {d.getDate()}
            </Text>
            {hasWorkout && <View style={[calStyles.dot, isSelected && calStyles.dotSelected]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createCalStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: 6,
    gap: 2,
    minHeight: 54,
    justifyContent: 'center',
  },
  cellToday: { backgroundColor: colors.save + '18', borderWidth: 1, borderColor: colors.save },
  cellWorkout: { backgroundColor: colors.accent + '22' },
  letter: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  letterToday: { color: colors.save },
  letterWorkout: { color: colors.accent },
  num: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  numToday: { color: colors.save },
  numWorkout: { color: colors.accent },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent, marginTop: 1 },
  cellSelected: { backgroundColor: colors.save, borderWidth: 1, borderColor: colors.save },
  letterSelected: { color: '#fff' },
  numSelected: { color: '#fff' },
  dotSelected: { backgroundColor: '#fff' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [user, setUser] = useState<User>();
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'log' | 'progress'>('log');
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [dateWorkouts, setDateWorkouts] = useState<Workout[]>([]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([fetchUser(), fetchRecentWorkouts(), fetchDashStats()]).finally(() => setLoading(false));
  }, []));

  const fetchUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setUser(data);
      if (data.active_routine_id) fetchActiveRoutine(data.active_routine_id, token!);
      else setActiveRoutine(null);
    } catch {
      Alert.alert('Error', 'Failed to load user');
    }
  };

  const fetchActiveRoutine = async (routineId: number, token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/routines/${routineId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setActiveRoutine(await res.json());
    } catch { /* silently fail */ }
  };

  const fetchRecentWorkouts = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/workouts/recent`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setWorkouts(await res.json());
    } catch {
      Alert.alert('Error', 'Failed to load workouts');
    }
  };

  const handleCalendarSelect = async (dateStr: string) => {
    // Tapping the already-selected date deselects it
    if (dateStr === selectedCalDate) {
      setSelectedCalDate(null);
      setDateWorkouts([]);
      return;
    }
    setSelectedCalDate(dateStr);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/workouts?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDateWorkouts(await res.json());
      else setDateWorkouts([]);
    } catch {
      setDateWorkouts([]);
    }
  };

  const fetchDashStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/stats/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDashStats(await res.json());
    } catch { /* silently fail */ }
  };

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;

  const CHART_BAR_WIDTH = Math.floor((SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2 - 40) / 8) - 4;

  return (
    <View style={styles.container}>
      {/* Tab Row */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'log' && styles.tabBtnActive]}
          onPress={() => setActiveTab('log')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'log' && styles.tabBtnTextActive]}>Log</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'progress' && styles.tabBtnActive]}
          onPress={() => setActiveTab('progress')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'progress' && styles.tabBtnTextActive]}>Progress</Text>
        </TouchableOpacity>
      </View>

      {/* ── LOG TAB ── */}
      {activeTab === 'log' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topbar}>
            <Text style={styles.title}>{getDailyGreeting()}, {user?.username}</Text>
          </View>

          <TouchableOpacity
            style={styles.logButton}
            onPress={() => navigation.navigate('WorkoutLog', { prefill: undefined, editMode: false })}
          >
            <Text style={styles.logButtonText}>+ Log Workout</Text>
          </TouchableOpacity>

          {/* Active Routine */}
          <View style={styles.activeBlock}>
            <Text style={styles.sectionLabel}>Active Routine</Text>
            {activeRoutine ? (
              <>
                <Text style={styles.activeRoutineName}>{activeRoutine.name}</Text>
                {activeRoutine.days.map(day => (
                  <View key={day.id} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <TouchableOpacity
                      style={styles.logDayBtn}
                      onPress={() => navigation.navigate('WorkoutLog', {
                        prefill: {
                          name: day.label, notes: '',
                          exercises: day.workout_template.exercises.map(ex => ({
                            name: ex.name, sets: [{ reps: '', weight: '' }],
                          })),
                        },
                        editMode: false,
                      })}
                    >
                      <Text style={styles.logDayBtnText}>Log</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.noRoutineText}>No active routine — set one in the Training tab</Text>
            )}
          </View>

          {/* This Week Calendar */}
          <Text style={styles.sectionLabel}>This Week</Text>
          <WeekCalendar
            workoutDates={dashStats?.this_week_dates ?? []}
            selectedDate={selectedCalDate}
            onSelectDate={handleCalendarSelect}
          />

          {/* Workouts — filtered by selected date or recent */}
          <Text style={styles.sectionLabel}>
            {selectedCalDate
              ? new Date(selectedCalDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
              : 'Recent Workouts'}
          </Text>
          {(() => {
            const list = selectedCalDate ? dateWorkouts : workouts;
            if (list.length === 0) return (
              <Text style={styles.emptyText}>
                {selectedCalDate ? 'No workouts on this day' : 'No recent workouts'}
              </Text>
            );
            return list.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.workoutCard}
                onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.workoutName}>{item.name || 'Workout'}</Text>
                  {item.pr_count ? (
                    <View style={styles.prBadge}>
                      <Text style={styles.prBadgeText}>🏆 {item.pr_count} PR{item.pr_count > 1 ? 's' : ''}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.workoutDate}>
                  {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {item.duration ? `  ·  ${item.duration} min` : ''}
                </Text>
                <View style={styles.statPills}>
                  {item.num_exercises != null && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{item.num_exercises} exercise{item.num_exercises !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  {item.total_reps != null && item.total_reps > 0 && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{item.total_reps} reps</Text>
                    </View>
                  )}
                  {item.volume != null && item.volume > 0 && (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{toDisplayVolume(item.volume, weightUnit)}</Text>
                    </View>
                  )}
                </View>
                {item.muscles && item.muscles.length > 0 && (
                  <Text style={styles.muscles} numberOfLines={1}>{item.muscles.join('  ·  ')}</Text>
                )}
              </TouchableOpacity>
            ));
          })()}
        </ScrollView>
      )}

      {/* ── PROGRESS TAB ── */}
      {activeTab === 'progress' && (
        <ScrollView contentContainerStyle={styles.content}>
          {dashStats ? (
            <>
              {/* Last 7 Days summary */}
              <Text style={styles.sectionLabel}>Last 7 Days</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryValue}>{dashStats.last_7_days.workouts}</Text>
                  <Text style={styles.summaryLabel}>Workouts</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryValue}>{toDisplayVolume(dashStats.last_7_days.volume, weightUnit)}</Text>
                  <Text style={styles.summaryLabel}>Volume</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryValue}>{dashStats.last_7_days.sets}</Text>
                  <Text style={styles.summaryLabel}>Sets</Text>
                </View>
              </View>

              {/* Weekly Volume Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Weekly Volume (lbs)</Text>
                <BarChart
                  data={dashStats.weekly.map(w => ({
                    value: w.volume,
                    label: w.label,
                    frontColor: colors.save,
                    topLabelComponent: w.volume > 0
                      ? () => <Text style={styles.barTopLabel}>{toDisplayVolume(w.volume, weightUnit)}</Text>
                      : undefined,
                  }))}
                  barWidth={CHART_BAR_WIDTH}
                  spacing={4}
                  roundedTop
                  hideRules
                  hideYAxisText
                  xAxisLabelTextStyle={styles.axisLabel}
                  noOfSections={4}
                  maxValue={Math.max(...dashStats.weekly.map(w => w.volume), 1) * 1.25}
                  height={140}
                  barBorderRadius={3}
                  xAxisThickness={1}
                  xAxisColor={colors.border}
                  yAxisThickness={0}
                  isAnimated
                />
              </View>

              {/* Weekly Frequency Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Workouts per Week</Text>
                <BarChart
                  data={dashStats.weekly.map(w => ({
                    value: w.count,
                    label: w.label,
                    frontColor: colors.accent,
                    topLabelComponent: w.count > 0
                      ? () => <Text style={styles.barTopLabel}>{w.count}</Text>
                      : undefined,
                  }))}
                  barWidth={CHART_BAR_WIDTH}
                  spacing={4}
                  roundedTop
                  hideRules
                  hideYAxisText
                  xAxisLabelTextStyle={styles.axisLabel}
                  maxValue={Math.max(...dashStats.weekly.map(w => w.count), 1) + 1}
                  stepValue={1}
                  height={140}
                  barBorderRadius={3}
                  xAxisThickness={1}
                  xAxisColor={colors.border}
                  yAxisThickness={0}
                  isAnimated
                />
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>No stats yet — log some workouts first</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.lg + 30,
    marginBottom: 0,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: colors.save },
  tabBtnText: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textSecondary },
  tabBtnTextActive: { color: '#fff' },

  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.textPrimary },

  logButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },

  // Active Routine
  activeBlock: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  activeRoutineName: {
    fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border,
  },
  dayLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  logDayBtn: {
    backgroundColor: colors.save, borderRadius: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  logDayBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },

  // Workout cards
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  workoutName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  prBadge: {
    backgroundColor: '#FFF3CD', borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: spacing.xs,
  },
  prBadgeText: { fontSize: 11, fontWeight: '700', color: '#856404' },
  workoutDate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  statPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  pill: {
    backgroundColor: colors.background, borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  pillText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  muscles: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },

  // Progress tab
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryBox: {
    flex: 1, backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  summaryValue: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  summaryLabel: {
    fontSize: 10, color: colors.textSecondary, marginTop: 2,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  chartTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  axisLabel: { fontSize: 9, color: colors.textSecondary },
  barTopLabel: { fontSize: 9, color: colors.textSecondary, marginBottom: 2 },
});
