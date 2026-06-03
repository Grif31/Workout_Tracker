import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, PanResponder, Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayVolume, WeightUnit } from 'utils/units';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../../utils/api';

const GREETINGS = [
  'Ready to workout', 'Welcome', 'Ready to Train', "Let's Workout",
  'Crush it today', 'Train hard today', 'Make today count',
  'Stronger every day', 'Time to sweat', 'Bring your best',
];

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDailyGreeting() {
  const key = toLocalDateStr(new Date());
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 1e9;
  return GREETINGS[Math.abs(hash) % GREETINGS.length];
}


type User = { id: number; username: string; email: string; name?: string | null; active_routine_id?: number | null };
type Workout = {
  id: number; name: string; notes: string; date: Date;
  duration?: number; volume?: number; total_reps?: number;
  num_exercises?: number; muscles?: string[]; pr_count?: number;
  workout_type?: string; cardio_duration?: number; distance?: number; distance_unit?: string;
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
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week

  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);

  const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const workoutSet = new Set(workoutDates);

  const goBack = () => setWeekOffset(o => o - 1);
  const goForward = () => setWeekOffset(o => Math.min(0, o + 1));

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) goForward();
        else if (g.dx > 40) goBack();
      },
    })
  ).current;

  const weekLabel = weekOffset === 0
    ? 'This Week'
    : weekOffset === -1
    ? 'Last Week'
    : `Week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <View>
      <View style={calStyles.weekNav}>
        <TouchableOpacity onPress={goBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={calStyles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={goForward} hitSlop={8} disabled={weekOffset === 0}>
          <Ionicons name="chevron-forward" size={18} color={weekOffset === 0 ? colors.border : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={calStyles.row} {...panResponder.panHandlers}>
        {DAY_LETTERS.map((letter, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const dateStr = toLocalDateStr(d);
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
    </View>
  );
}

const createCalStyles = (colors: Colors) => StyleSheet.create({
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  weekLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
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
  letter: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  letterToday: { color: colors.save },
  letterWorkout: { color: colors.accent },
  num: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
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
  const [daysVisible, setDaysVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [dateWorkouts, setDateWorkouts] = useState<Workout[]>([]);
  const [allWorkoutDates, setAllWorkoutDates] = useState<string[]>([]);
  const [weeklyStreak, setWeeklyStreak] = useState(0);
  const [monthlyStreak, setMonthlyStreak] = useState(0);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [longestDailyStreak, setLongestDailyStreak] = useState(0);
  const [streakType, setStreakType] = useState<'weekly' | 'monthly' | 'daily'>('weekly');
  const [streakModalVisible, setStreakModalVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([fetchUser(), fetchRecentWorkouts(), fetchAllWorkoutDates(), fetchStreak()]).finally(() => setLoading(false));
  }, []));

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchUser(), fetchRecentWorkouts(), fetchAllWorkoutDates(), fetchStreak()]).finally(() => setRefreshing(false));
  };

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) return;
      const data = await res.json();
      setUser(data);
      if (data.active_routine_id) fetchActiveRoutine(data.active_routine_id);
      else setActiveRoutine(null);
    } catch {
      Alert.alert('Error', 'Failed to load user');
    }
  };

  const fetchActiveRoutine = async (routineId: number) => {
    try {
      const res = await apiFetch(`/api/routines/${routineId}`);
      if (res.ok) setActiveRoutine(await res.json());
    } catch { /* silently fail */ }
  };

  const fetchRecentWorkouts = async () => {
    try {
      const res = await apiFetch('/api/workouts/recent');
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
      const res = await apiFetch(`/api/workouts?date=${dateStr}`);
      if (res.ok) setDateWorkouts(await res.json());
      else setDateWorkouts([]);
    } catch {
      setDateWorkouts([]);
    }
  };

  const fetchAllWorkoutDates = async () => {
    try {
      const res = await apiFetch('/api/workouts/dates');
      if (res.ok) {
        const data = await res.json();
        setAllWorkoutDates(data.dates ?? []);
      }
    } catch { /* silently fail */ }
  };

  const fetchStreak = async () => {
    try {
      const goalRaw = await AsyncStorage.getItem('workout_weekly_goal');
      const weeklyGoal = goalRaw ? (parseInt(goalRaw, 10) || 3) : 3;
      const res = await apiFetch(`/api/stats/profile?weekly_goal=${weeklyGoal}`);
      if (res.ok) {
        const data = await res.json();
        const ws = data.current_streak ?? 0;
        setWeeklyStreak(ws);
        setMonthlyStreak(data.current_monthly_streak ?? 0);
        setDailyStreak(data.current_daily_streak ?? 0);
        setLongestDailyStreak(data.longest_daily_streak ?? 0);
      }
    } catch { /* silently fail */ }
  };

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
          {(() => {
            const streakDisplay = streakType === 'weekly'
              ? { emoji: '🔥', value: weeklyStreak, unit: 'w' }
              : streakType === 'monthly'
              ? { emoji: '📅', value: monthlyStreak, unit: 'mo' }
              : { emoji: '⚡', value: dailyStreak, unit: 'd' };
            return (
              <View style={styles.topbar}>
                <Text style={styles.title}>{getDailyGreeting()}, {user?.name || user?.username}</Text>
                <TouchableOpacity onPress={() => setStreakModalVisible(true)} style={styles.streakBadge}>
                  <Text style={styles.streakEmoji}>{streakDisplay.emoji}</Text>
                  <Text style={styles.streakText}>{streakDisplay.value}{streakDisplay.unit}</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          <TouchableOpacity
            style={styles.logButton}
            onPress={() => navigation.navigate('WorkoutLog', { prefill: undefined, editMode: false })}
          >
            <Text style={styles.logButtonText}>+ Log Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.trackButton}
            onPress={() => navigation.navigate('GPSCardio')}
          >
            <Ionicons name="location-outline" size={16} color={colors.accent} style={{ marginRight: 4 }} />
            <Text style={styles.trackButtonText}>Track Activity</Text>
          </TouchableOpacity>

          {/* Active Routine */}
          {activeRoutine && (
            <View style={styles.activeBlock}>
              <Text style={styles.sectionLabel}>Active Routine</Text>
              <View style={styles.activeRoutineNameRow}>
                <Text style={styles.activeRoutineName}>{activeRoutine.name}</Text>
                <TouchableOpacity
                  style={styles.toggleDaysBtn}
                  onPress={() => setDaysVisible(v => !v)}
                >
                  <Text style={[styles.toggleDaysBtnText, { color: colors.accent }]}>
                    {daysVisible ? 'Hide' : 'Show'}
                  </Text>
                  <Ionicons
                    name={daysVisible ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.accent}
                  />
                </TouchableOpacity>
              </View>
              {daysVisible && activeRoutine.days.map(day => (
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
            </View>
          )}

          {/* Week Calendar */}
          <WeekCalendar
            workoutDates={allWorkoutDates}
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
                onPress={() =>
                  item.workout_type === 'cardio'
                    ? navigation.navigate('CardioDetails', { workoutId: item.id })
                    : navigation.navigate('WorkoutDetails', { workoutId: item.id })
                }
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
                </Text>
                {item.workout_type === 'cardio' ? (
                  <View style={styles.statPills}>
                    {item.duration != null && (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{item.duration} min</Text>
                      </View>
                    )}
                    {item.distance != null && item.distance > 0 && (
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{item.distance.toFixed(2)} {item.distance_unit || 'km'}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <>
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
                  </>
                )}
              </TouchableOpacity>
            ));
          })()}
        </ScrollView>
      {/* Streak selector modal */}
      <Modal visible={streakModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.streakOverlay} activeOpacity={1} onPress={() => setStreakModalVisible(false)}>
          <View style={styles.streakModalBox}>
            <Text style={styles.streakModalTitle}>Streak Type</Text>
            {([
              { key: 'weekly' as const, emoji: '🔥', label: 'Weekly', value: weeklyStreak, unit: 'w', sub: null },
              { key: 'monthly' as const, emoji: '📅', label: 'Monthly', value: monthlyStreak, unit: 'mo', sub: null },
              { key: 'daily' as const, emoji: '⚡', label: 'Daily', value: dailyStreak, unit: 'd', sub: `longest: ${longestDailyStreak}d` },
            ] as const).map(row => (
              <TouchableOpacity
                key={row.key}
                style={[styles.streakRow, streakType === row.key && styles.streakRowActive]}
                onPress={() => setStreakType(row.key)}
              >
                <Text style={styles.streakRowEmoji}>{row.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.streakRowLabel, streakType === row.key && { color: colors.accent }]}>{row.label}</Text>
                  {row.sub && <Text style={styles.streakRowSub}>{row.sub}</Text>}
                </View>
                <Text style={[styles.streakRowValue, streakType === row.key && { color: colors.accent }]}>
                  {row.value}{row.unit}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.streakModalDone} onPress={() => setStreakModalVisible(false)}>
              <Text style={styles.streakModalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  content: { padding: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.textPrimary, flex: 1 },

  logButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  trackButtonText: { color: colors.accent, fontSize: typography.fontSize.sm, fontWeight: '600' },

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
  activeRoutineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  activeRoutineName: {
    fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1,
  },
  toggleDaysBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: spacing.sm,
  },
  toggleDaysBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
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
    backgroundColor: '#FFF3C4', borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: spacing.xs,
  },
  prBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: '#7A5800' },
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

  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakEmoji: { fontSize: typography.fontSize.sm },
  streakText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },

  streakOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  streakModalBox: {
    backgroundColor: colors.surface, borderRadius: spacing.md,
    padding: spacing.lg, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  streakModalTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  streakRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderRadius: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  streakRowActive: { backgroundColor: colors.accent + '18' },
  streakRowEmoji: { fontSize: typography.fontSize.lg, width: 28, textAlign: 'center' },
  streakRowLabel: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  streakRowSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  streakRowValue: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textSecondary, minWidth: 40, textAlign: 'right' },
  streakModalDone: {
    marginTop: spacing.md, backgroundColor: colors.save,
    borderRadius: spacing.sm, padding: spacing.sm, alignItems: 'center',
  },
  streakModalDoneText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
});
