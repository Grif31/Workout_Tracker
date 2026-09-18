import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Animated, ScrollView, PanResponder, Modal, RefreshControl, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayVolume, WeightUnit } from 'utils/units';
import { toLocalDateStr } from 'utils/date';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, isNetworkError } from '../../utils/api';
import { announceFlushResult, flushQueue, getPendingCount, onPendingCountChange } from '../../utils/offlineQueue';
import { showToast } from '../../utils/toast';
import { appCache } from '../../utils/appCache';
import { LaurelBranch } from '../../components/LaurelWreath';
import { PR_GOLD_TEXT } from '../../constants/prColors';
import { WEEKLY_SUMMARY_LAST_SHOWN_KEY } from './WeeklySummaryScreen';
import SectionRule from '../../components/SectionRule';
import PressableScale from '../../components/PressableScale';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import { type DashboardCardId } from '../../constants/dashboardCards';
import { defaultLayout, loadDashboardLayout, visibleCards, type DashboardLayout } from '../../utils/dashboardLayout';

const GREETINGS = [
  'Ready to workout', 'Welcome', 'Ready to Train', "Let's Workout",
  'Crush it today', 'Train hard today', 'Make today count',
  'Stronger every day', 'Time to sweat', 'Bring your best',
];

// Monday of the current week as YYYY-MM-DD, local time. Matches the Mon-start
// convention the weekly summary popup and the backend's streak math already use.
function currentWeekMondayStr() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // getDay(): 0=Sun
  return toLocalDateStr(monday);
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
type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; exercise_type?: string };
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

  const slideAnim     = useRef(new Animated.Value(0)).current;
  const prevOffsetRef = useRef(weekOffset);
  const isFirstRef    = useRef(true);

  useEffect(() => {
    if (isFirstRef.current) { isFirstRef.current = false; return; }
    const dir = weekOffset < prevOffsetRef.current ? -1 : 1;
    prevOffsetRef.current = weekOffset;
    slideAnim.setValue(dir * 50);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200, mass: 0.8 }).start();
  }, [weekOffset]);

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

      <Animated.View style={[calStyles.row, { transform: [{ translateX: slideAnim }] }]} {...panResponder.panHandlers}>
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
      </Animated.View>
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
  letterSelected: { color: colors.accentText },
  numSelected: { color: colors.accentText },
  dotSelected: { backgroundColor: colors.accentText },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }: Props) {
  const { user: authUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [user, setUser] = useState<User>();
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';
  // Non-breaking spaces inside the name mean a wrap can only happen between
  // the greeting and the name -- never mid-name -- so a long name moves to
  // the second line as a whole instead of splitting across both lines.
  const displayName = (user?.name || user?.username || '').replace(/ /g, ' ');
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingCount);
  useEffect(() => onPendingCountChange(setPendingSyncCount), []);
  const [retryingSync, setRetryingSync] = useState(false);
  // Automatic flushes only run on reconnect or login, so a workout that failed
  // while online (e.g. the server was down) would otherwise sit here until then.
  const retrySync = async () => {
    setRetryingSync(true);
    try {
      const result = await flushQueue();
      announceFlushResult(result);
      if (result.synced === 0 && getPendingCount() > 0) {
        showToast("Couldn't upload right now. It's still saved on this phone and will keep trying.");
      }
    } finally {
      setRetryingSync(false);
    }
  };
  const [daysVisible, setDaysVisible] = useState(false);
  // No animateNextLayout() here: the day list drives its own height/opacity
  // animation below. Running LayoutAnimation as well made the card's height
  // snap shut on its own schedule while the rows were still fading, which is
  // what made the collapse look broken.
  const toggleDaysVisible = () => setDaysVisible(v => !v);
  // Lowercased labels of workouts logged since Monday — drives which routine
  // day is "up next" and which rows render as already done.
  const [weekWorkoutNames, setWeekWorkoutNames] = useState<string[]>([]);
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
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);
  const hasLoaded = useRef(false);

  const streakAnim        = useRef(new Animated.Value(0)).current;
  const [displayStreakValue, setDisplayStreakValue] = useState(0);

  // ── Active routine: which day is up next ───────────────────────────────────
  const routineDays = useMemo(
    () => [...(activeRoutine?.days ?? [])].sort((a, b) => a.day_order - b.day_order),
    [activeRoutine]
  );
  const doneLabels = useMemo(() => new Set(weekWorkoutNames), [weekWorkoutNames]);
  const isDayDone = useCallback(
    (day: RoutineDay) => doneLabels.has((day.label || '').trim().toLowerCase()),
    [doneLabels]
  );
  // First day (by day_order) with no matching workout logged since Monday.
  // That single rule covers all three cases the card needs: a fresh week has
  // nothing logged so it lands on day 1 regardless of what happened last week;
  // days completed out of order still resolve to the earliest unfinished one;
  // and a fully-completed week yields null (rendered as the all-done state).
  const nextDay = useMemo(
    () => routineDays.find(d => !isDayDone(d)) ?? null,
    [routineDays, isDayDone]
  );

  const logRoutineDay = (day: RoutineDay) => navigation.navigate('WorkoutLog', {
    prefill: {
      name: day.label,
      notes: '',
      exercises: day.workout_template.exercises.map(ex => ({
        name: ex.name,
        exercise_template_id: ex.id,
        exercise_type: ex.exercise_type ?? 'strength',
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        sets: [{ reps: '', weight: '' }],
      })),
    },
    editMode: false,
  });

  const expandAnim = useCollapseAnim(daysVisible);

  // Populate from preload cache instantly on mount
  useEffect(() => {
    const rw = appCache.get<Workout[]>('recent_workouts');
    const wd = appCache.get<{ dates: string[] }>('workout_dates');
    const ps = appCache.get<any>('profile_stats');
    const me = appCache.get<any>('me');
    if (rw) setWorkouts(rw);
    if (wd) setAllWorkoutDates(wd.dates ?? []);
    if (ps) {
      setWeeklyStreak(ps.current_streak ?? 0);
      setMonthlyStreak(ps.current_monthly_streak ?? 0);
      setDailyStreak(ps.current_daily_streak ?? 0);
      setLongestDailyStreak(ps.longest_daily_streak ?? 0);
    }
    if (me?.active_routine_id) fetchActiveRoutine(me.active_routine_id);
    if (rw || me) {
      setLoading(false);
      hasLoaded.current = true;
    }
  }, []);

  // Auto-popup: at most once per week, if last week had >=1 workout. Not part
  // of the Promise.all below — this shouldn't hold up the dashboard's own
  // loading state, it's a secondary check.
  const checkWeeklySummaryPopup = async () => {
    const uid = authUser?.id;
    if (!uid) return;
    try {
      const today = new Date();
      const mondayOffset = (today.getDay() + 6) % 7; // getDay(): 0=Sun → offset back to Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - mondayOffset);
      const mondayStr = toLocalDateStr(monday);

      const key = `${WEEKLY_SUMMARY_LAST_SHOWN_KEY}_${uid}`;
      const lastShown = await AsyncStorage.getItem(key);
      if (lastShown === mondayStr) return; // already checked/shown this week

      const res = await apiFetch('/api/stats/weekly-summary');
      if (!res.ok) return;
      const data = await res.json();
      await AsyncStorage.setItem(key, mondayStr);
      if (data.workouts >= 1) {
        navigation.navigate('WeeklySummary', { data });
      }
    } catch { /* silently fail — this is a nice-to-have, not critical */ }
  };

  useFocusEffect(useCallback(() => {
    const firstLoad = !hasLoaded.current;
    if (firstLoad) setLoading(true);
    Promise.all([fetchUser(), fetchRecentWorkouts(), fetchWeekWorkouts(), fetchAllWorkoutDates(), fetchStreak()]).finally(() => {
      setLoading(false);
      hasLoaded.current = true;
    });
    checkWeeklySummaryPopup();
    // Re-read on focus: the Customize screen saves as the user drags.
    // authUser, not the /api/me copy below, which is undefined on first render
    loadDashboardLayout(authUser?.id).then(setLayout);
  }, [authUser?.id]));

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchUser(), fetchRecentWorkouts(), fetchWeekWorkouts(), fetchAllWorkoutDates(), fetchStreak()]).finally(() => setRefreshing(false));
  };

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) return;
      const data = await res.json();
      setUser(data);
      if (data.active_routine_id) fetchActiveRoutine(data.active_routine_id);
      else setActiveRoutine(null);
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Profile", 'Try again in a moment.');
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
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Workouts", 'Try again in a moment.');
    }
  };

  // Separate from fetchRecentWorkouts: /api/workouts/recent caps at 5 rows,
  // which can miss days in a heavy training week. 25 comfortably covers any
  // week, and we only need each workout's name + date.
  const fetchWeekWorkouts = async () => {
    try {
      const res = await apiFetch('/api/workouts?page=1&per_page=25');
      if (!res.ok) return;
      const data = await res.json();
      const mondayStr = currentWeekMondayStr();
      setWeekWorkoutNames(
        (data.workouts ?? [])
          // Compare as YYYY-MM-DD strings rather than Date objects — the
          // backend sends an ISO timestamp and lexical compare on the local
          // date string avoids any timezone drift at the week boundary.
          .filter((w: Workout) => toLocalDateStr(new Date(w.date)) >= mondayStr)
          .map((w: Workout) => (w.name || '').trim().toLowerCase())
      );
    } catch { /* silently fail — the card falls back to day 1 */ }
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
      const goalRaw = await AsyncStorage.getItem(`workout_weekly_goal_${authUser?.id}`);
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


  useEffect(() => {
    const target = streakType === 'weekly' ? weeklyStreak
      : streakType === 'monthly' ? monthlyStreak
      : dailyStreak;
    if (target === 0) { setDisplayStreakValue(0); return; }
    const id = streakAnim.addListener(({ value }) => setDisplayStreakValue(Math.round(target * value)));
    streakAnim.setValue(0);
    Animated.timing(streakAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
    return () => streakAnim.removeListener(id);
  }, [streakType, weeklyStreak, monthlyStreak, dailyStreak]);

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
          {(() => {
            const streakDisplay = streakType === 'weekly'
              ? { value: weeklyStreak, unit: 'w', label: 'Week Streak' }
              : streakType === 'monthly'
              ? { value: monthlyStreak, unit: 'mo', label: 'Month Streak' }
              : { value: dailyStreak, unit: 'd', label: 'Day Streak' };
            return (
              <View style={styles.topbar}>
                <View style={styles.greetingBlock}>
                  <Text style={styles.greetingText}>{getDailyGreeting()},</Text>
                  <Text style={styles.greetingName}>{displayName}</Text>
                </View>
                <View style={styles.topbarActions}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('CustomizeHome')}
                  style={styles.customizeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Customize Home"
                >
                  <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStreakModalVisible(true)} style={styles.streakBadge}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <View style={styles.streakText}>
                    <Text style={styles.streakCount}>{displayStreakValue}{streakDisplay.unit}</Text>
                    <Text style={styles.streakLabel}>{streakDisplay.label}</Text>
                  </View>
                </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <TouchableOpacity
            style={styles.logButton}
            onPress={() => navigation.navigate('WorkoutLog', { prefill: undefined, editMode: false })}
          >
            <Ionicons name="add-circle" size={20} color={colors.accentText} />
            <Text style={styles.logButtonText}>Log Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.trackButton}
            onPress={() => navigation.navigate('GPSCardio')}
          >
            <Ionicons name="location-outline" size={16} color={colors.accent} style={{ marginRight: spacing.xs }} />
            <Text style={styles.trackButtonText}>Track Activity</Text>
          </TouchableOpacity>

          {/* Explains the dot on the Home tab icon: queued workouts aren't in the list below yet */}
          {pendingSyncCount > 0 && (
            <View style={styles.pendingSyncCard} accessibilityRole="summary">
              <Ionicons name="cloud-upload-outline" size={24} color={colors.warmup} />
              <View style={styles.pendingSyncTextBlock}>
                <Text style={styles.pendingSyncTitle}>
                  {pendingSyncCount === 1 ? '1 workout waiting to upload' : `${pendingSyncCount} workouts waiting to upload`}
                </Text>
                <Text style={styles.pendingSyncBody}>
                  {pendingSyncCount === 1
                    ? "Saved on this phone while you were offline. It will upload automatically when you're back online, then show up in your history."
                    : "Saved on this phone while you were offline. They will upload automatically when you're back online, then show up in your history."}
                </Text>
                <TouchableOpacity
                  style={styles.pendingSyncButton}
                  onPress={retrySync}
                  disabled={retryingSync}
                  accessibilityRole="button"
                  accessibilityLabel="Try uploading now"
                >
                  {retryingSync
                    ? <ActivityIndicator size="small" color={colors.textPrimary} />
                    : <Text style={styles.pendingSyncButtonText}>Try Now</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Cards render in the user's saved order, hidden ones dropped
              (Customize Home). Everything above stays put. */}
          {(() => {
            const cardNodes: Record<DashboardCardId, React.ReactNode> = {
              activeRoutine: (
                <>
          {/* Active Routine */}
          {activeRoutine && (
            <PressableScale
              style={styles.activeBlock}
              onPress={toggleDaysVisible}
            >
              <View style={styles.activeRoutineNameRow}>
                <Text style={styles.activeRoutineName} numberOfLines={1}>{activeRoutine.name}</Text>
                {/* Plain View, not a TouchableOpacity: the whole card already
                    toggles via PressableScale, and nesting a touchable inside
                    it left the label stuck at its pressed opacity because the
                    outer responder swallowed the press-out. */}
                <View style={styles.toggleDaysBtn}>
                  <Text style={[styles.toggleDaysBtnText, { color: colors.accent }]}>
                    {routineDays.length} Day{routineDays.length !== 1 ? 's' : ''}
                  </Text>
                  <Animated.View
                    style={{
                      transform: [{
                        rotate: expandAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '180deg'],
                        }),
                      }],
                    }}
                  >
                    <Ionicons name="chevron-down" size={14} color={colors.accent} />
                  </Animated.View>
                </View>
              </View>

              {/* Up next — the day to train, with a one-tap Log */}
              {nextDay ? (
                <View style={styles.upNextRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upNextLabel}>Up Next</Text>
                    {/* Name and exercise count share a line to keep the card short */}
                    <View style={styles.upNextNameRow}>
                      <Text style={styles.upNextName} numberOfLines={1}>{nextDay.label}</Text>
                      <Text style={styles.upNextMeta}>
                        {nextDay.workout_template.exercises.length} ex
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.logNextBtn} onPress={() => logRoutineDay(nextDay)}>
                    <Text style={styles.logDayBtnText}>Log</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.allDoneRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.save} />
                  <Text style={styles.allDoneText}>
                    All {routineDays.length} day{routineDays.length !== 1 ? 's' : ''} done this week
                  </Text>
                </View>
              )}

              <Collapsible progress={expandAnim} expanded={daysVisible}>
                <View style={styles.daysList}>
                  {routineDays.map(day => {
                    const done = isDayDone(day);
                    return (
                      <View key={day.id} style={styles.dayRow}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.dayLabelRow}>
                            {done && <Ionicons name="checkmark-circle" size={14} color={colors.save} />}
                            <Text style={[styles.dayLabel, done && styles.dayLabelDone]} numberOfLines={1}>
                              {day.label}
                            </Text>
                          </View>
                          <Text style={styles.dayExCount}>
                            {day.workout_template.exercises.length} exercise{day.workout_template.exercises.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.logDayBtn, done && styles.logDayBtnDone]}
                          onPress={() => logRoutineDay(day)}
                        >
                          <Text style={[styles.logDayBtnText, done && { color: colors.textSecondary }]}>
                            {done ? 'Again' : 'Log'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </Collapsible>
            </PressableScale>
          )}
                </>
              ),
              weekCalendar: (
                <>
          {/* Week Calendar */}
          <WeekCalendar
            workoutDates={allWorkoutDates}
            selectedDate={selectedCalDate}
            onSelectDate={handleCalendarSelect}
          />
                </>
              ),
              workouts: (
                <>
          {/* Workouts — filtered by selected date or recent */}
          <SectionRule
            label={selectedCalDate
              ? new Date(selectedCalDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
              : 'Recent Workouts'}
            style={{ marginBottom: spacing.sm }}
          />
          {(() => {
            const list = selectedCalDate ? dateWorkouts : workouts;
            if (list.length === 0) return (
              <Text style={styles.emptyText}>
                {selectedCalDate ? 'No workouts on this day' : 'No recent workouts'}
              </Text>
            );
            return list.map((item) => {
              return (
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
                  <Ionicons
                    name={item.workout_type === 'cardio' ? 'location-outline' : 'barbell-outline'}
                    size={14}
                    color={colors.textSecondary}
                    style={{ marginRight: spacing.xs, marginTop: 1 }}
                  />
                  <Text style={styles.workoutName}>{item.name || 'Workout'}</Text>
                  {!!item.pr_count && (
                    <View style={styles.prRow}>
                      <LaurelBranch height={16} color="#FFD700" />
                      <Text style={styles.prText}>{item.pr_count} PR{item.pr_count > 1 ? 's' : ''}</Text>
                      <LaurelBranch side="right" height={16} color="#FFD700" />
                    </View>
                  )}
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
              );
            });
          })()}
                </>
              ),
            };
            return visibleCards(layout).map(id => (
              <React.Fragment key={id}>{cardNodes[id]}</React.Fragment>
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
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customizeButton: { padding: spacing.xs },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  greetingBlock: { flex: 1, marginRight: spacing.sm },
  greetingText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  greetingName: { fontSize: typography.fontSize.xl, fontWeight: '800', color: colors.textPrimary, marginTop: 1 },

  logButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.accentText + '28',
  },
  logButtonText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
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

  pendingSyncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.warmup + '1A',
    borderWidth: 1,
    borderColor: colors.warmup + '66',
    borderRadius: spacing.sm,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
  },
  pendingSyncTextBlock: { flex: 1 },
  pendingSyncTitle: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' },
  pendingSyncBody: { color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: 19, marginTop: 2 },
  pendingSyncButton: {
    alignSelf: 'flex-start',
    minWidth: 88,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warmup,
  },
  pendingSyncButtonText: { color: colors.textPrimary, fontSize: typography.fontSize.sm, fontWeight: '700' },

  // Active Routine
  activeBlock: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: colors.accent,
  },
  activeRoutineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
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
  upNextRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.accent + '14',
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  upNextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  upNextNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  upNextName: {
    fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, flexShrink: 1,
  },
  upNextMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  logNextBtn: {
    backgroundColor: colors.save, borderRadius: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  allDoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.save + '14',
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2,
  },
  allDoneText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  dayRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border,
  },
  daysList: { paddingTop: spacing.xs },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dayLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary, flexShrink: 1 },
  dayLabelDone: { color: colors.textSecondary },
  dayExCount: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  logDayBtn: {
    backgroundColor: colors.save, borderRadius: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  logDayBtnDone: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.border,
  },
  logDayBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },

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
  prRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: spacing.sm },
  prText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: PR_GOLD_TEXT },
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
    backgroundColor: colors.surface,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  streakEmoji: { fontSize: 18, lineHeight: 22 },
  streakText: { alignItems: 'flex-end' },
  streakCount: { fontSize: typography.fontSize.md, fontWeight: '800', color: colors.textPrimary },
  streakLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

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
  streakModalDoneText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
});
