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
import { toDisplayVolume, WeightUnit, GPS_DISTANCE_UNIT_KEY, toDisplayDistance, roundTenth, type DistanceUnit } from '../../utils/units';
import { fmtDuration } from '../../utils/cardioFormat';
import { toLocalDateStr } from '../../utils/date';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { WEEKLY_GOAL_KEY } from '../../constants/storageKeys';
import { apiFetch, isNetworkError } from '../../utils/api';
import { announceFlushResult, flushQueue, getPendingCount, onPendingCountChange } from '../../utils/offlineQueue';
import { showToast } from '../../utils/toast';
import { appCache, useRefetchGate } from '../../utils/appCache';
import { LaurelBranch } from '../../components/LaurelWreath';
import { PR_GOLD_TEXT } from '../../constants/prColors';
import { WEEKLY_SUMMARY_LAST_SHOWN_KEY } from './WeeklySummaryScreen';
import SectionRule from '../../components/SectionRule';
import PressableScale from '../../components/PressableScale';
import StreakFlame from '../../components/StreakFlame';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import { activeDayFilter, cardSize, defaultLayout, fixedHomeLayout, loadDashboardLayout, packRows, saveDashboardLayout, type DashboardLayout } from '../../utils/dashboardLayout';
import { CARD_SIZES, DASHBOARD_CARDS, HOME_CUSTOMIZATION_ENABLED, type CardSize, type DashboardCardId } from '../../constants/dashboardCards';
import WeeklyGoalCard from '../../components/dashboard/WeeklyGoalCard';
import GreekRankCard from '../../components/dashboard/GreekRankCard';
import { GREEK_RANK_CACHED_KEY } from '../../constants/storageKeys';
import type { GreekRankData } from '../../utils/greekRank';
import DraggableList from '../../components/DraggableList';
import { buildTemplatePrefill, parseProgramming, type TemplateExercise } from '../../utils/templatePrefill';

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
type RoutineDay = {
  id: number; day_order: number; label: string;
  workout_template: { id: number; name: string; exercises: TemplateExercise[]; programming_json?: string | null };
};
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };

type Props = NativeStackScreenProps<DashboardStackParamsList, 'DashboardHome'>;

const ARRANGE_ROW_HEIGHT = 64;

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
                isSelected && calStyles.cellSelected,
              ]}
            >
              <Text style={[calStyles.letter, isToday && calStyles.letterToday, isSelected && calStyles.letterSelected]}>
                {letter}
              </Text>
              <Text style={[calStyles.num, isToday && calStyles.numToday, isSelected && calStyles.numSelected]}>
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
  letter: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  letterToday: { color: colors.save },
  num: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  numToday: { color: colors.save },
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
  // Starts from the profile PreloadScreen just fetched. The refetch gate below
  // counts that preload as this screen's first /api/me, so without this seed
  // the greeting name and weight unit stayed empty until the cache went stale
  // (a minute, or the next save) and Home was revisited.
  const [user, setUser] = useState<User | undefined>(() => appCache.get<User>('me') ?? undefined);
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';
  // Non-breaking spaces inside the name mean a wrap can only happen between
  // the greeting and the name -- never mid-name -- so a long name moves to
  // the second line as a whole instead of splitting across both lines.
  // The logged-in user covers an empty cache: login already returned the name.
  const displayName = (user?.name || user?.username || authUser?.name || authUser?.username || '')
    .replace(/ /g, ' ');
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
  // Cardio: totals since Monday, plus the all-time activity count. The card is
  // only worth a slot for someone who actually logs cardio, so the all-time
  // count is what decides whether it renders at all.
  const [weekCardio, setWeekCardio] = useState({ activities: 0, distanceKm: 0, minutes: 0 });
  const [totalCardioActivities, setTotalCardioActivities] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [greekRank, setGreekRank] = useState<{ rank: string | null; score: number | null; heldByGate: boolean }>(
    { rank: null, score: null, heldByGate: false },
  );
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');
  const [streakModalVisible, setStreakModalVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(
    () => (HOME_CUSTOMIZATION_ENABLED ? defaultLayout() : fixedHomeLayout()),
  );
  // Arrange mode swaps the cards for equal-height chips in place, rather than
  // sending the user to a separate screen to arrange a copy of their Home
  const [arranging, setArranging] = useState(false);
  // Rows drag inside the page's ScrollView, which would pan under the finger
  const [dragging, setDragging] = useState(false);
  const hasLoaded = useRef(false);


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
    prefill: buildTemplatePrefill(
      day.label,
      day.workout_template.exercises,
      parseProgramming(day.workout_template.programming_json),
    ),
    editMode: false,
  });

  const expandAnim = useCollapseAnim(daysVisible);

  // Populate from preload cache instantly on mount
  useEffect(() => {
    const rw = appCache.get<Workout[]>('recent_workouts');
    const wd = appCache.get<{ dates: string[] }>('workout_dates');
    const ps = appCache.get<any>('profile_stats');
    const me = appCache.get<any>('me');
    const gr = appCache.get<GreekRankData>('greek_rank');
    if (rw) setWorkouts(rw);
    if (wd) setAllWorkoutDates(wd.dates ?? []);
    if (ps) {
      setWeeklyStreak(ps.current_streak ?? 0);
      setMonthlyStreak(ps.current_monthly_streak ?? 0);
      setDailyStreak(ps.current_daily_streak ?? 0);
      setLongestDailyStreak(ps.longest_daily_streak ?? 0);
    }
    if (gr) setGreekRank({ rank: gr.greek_rank ?? null, score: gr.greek_score ?? null, heldByGate: !!gr.held_by_gate });
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

  // Seeded from the preload so the first focus, a moment after it, doesn't
  // repeat the requests the mount effect above just painted from.
  const refetchIfStale = useRefetchGate(() => ({
    me: appCache.stampOf('me'),
    recent: appCache.stampOf('recent_workouts'),
    dates: appCache.stampOf('workout_dates'),
    greek: appCache.stampOf('greek_rank'),
  }));

  // fetchStreak is never gated: its query carries the weekly goal, which lives
  // in AsyncStorage and changes without a write that would mark data stale.
  const refreshHome = (force: boolean) => Promise.all([
    refetchIfStale('me', fetchUser, force),
    refetchIfStale('recent', fetchRecentWorkouts, force),
    refetchIfStale('week', fetchWeekWorkouts, force),
    refetchIfStale('dates', fetchAllWorkoutDates, force),
    fetchStreak(),
    ...(HOME_CUSTOMIZATION_ENABLED ? [refetchIfStale('greek', fetchGreekRank, force)] : []),
  ]);

  useFocusEffect(useCallback(() => {
    const firstLoad = !hasLoaded.current;
    if (firstLoad) setLoading(true);
    refreshHome(false).finally(() => {
      setLoading(false);
      hasLoaded.current = true;
    });
    checkWeeklySummaryPopup();
    // Re-read on focus: arrange mode saves as the user drags.
    // authUser, not the /api/me copy below, which is undefined on first render
    if (HOME_CUSTOMIZATION_ENABLED) loadDashboardLayout(authUser?.id).then(setLayout);
    if (authUser?.id != null) {
      AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${authUser.id}`)
        .then(v => { if (v === 'km' || v === 'mi') setDistanceUnit(v); })
        .catch(() => { /* keep the default */ });
    }
  }, [authUser?.id]));

  const handleRefresh = () => {
    setRefreshing(true);
    refreshHome(true).finally(() => setRefreshing(false));
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

  const fetchGreekRank = async () => {
    try {
      const cached = await AsyncStorage.getItem(GREEK_RANK_CACHED_KEY);
      if (cached) setGreekRank(prev => (prev.rank ? prev : { rank: cached, score: null, heldByGate: false }));
      const res = await apiFetch('/api/stats/greek-rank');
      if (!res.ok) return;
      const data: GreekRankData = await res.json();
      setGreekRank({
        rank: data.greek_rank ?? null,
        score: data.greek_score ?? null,
        heldByGate: !!data.held_by_gate,
      });
      if (data.greek_rank) AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, data.greek_rank).catch(() => {});
    } catch { /* silently fail — the card shows its cached or empty state */ }
  };

  const fetchStreak = async () => {
    try {
      const goalRaw = await AsyncStorage.getItem(`${WEEKLY_GOAL_KEY}_${authUser?.id}`);
      const weeklyGoal = goalRaw ? (parseInt(goalRaw, 10) || 3) : 3;
      setWeeklyGoal(weeklyGoal);
      const res = await apiFetch(`/api/stats/profile?weekly_goal=${weeklyGoal}`);
      if (res.ok) {
        const data = await res.json();
        const ws = data.current_streak ?? 0;
        setWeeklyStreak(ws);
        setMonthlyStreak(data.current_monthly_streak ?? 0);
        setDailyStreak(data.current_daily_streak ?? 0);
        setLongestDailyStreak(data.longest_daily_streak ?? 0);
        setThisWeekCount(data.this_week_count ?? 0);
        setTotalCardioActivities(data.cardio_activities ?? 0);
        setWeekCardio({
          activities: data.week_cardio_activities ?? 0,
          distanceKm: data.week_cardio_distance_km ?? 0,
          minutes: data.week_cardio_minutes ?? 0,
        });
      }
    } catch { /* silently fail */ }
  };


  if (loading) return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <ScrollView
        scrollEnabled={!dragging}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
          {(() => {
            const streakDisplay = streakType === 'weekly'
              ? { value: weeklyStreak, unit: 'wk' }
              : streakType === 'monthly'
              ? { value: monthlyStreak, unit: 'mo' }
              : { value: dailyStreak, unit: 'd' };
            return (
              <>
              {/* The streak sits on its own row above the greeting: sharing a
                  row squeezed the greeting into the width left over and cut
                  off longer names. Equal flex spacers either side keep it
                  dead centre. */}
              <View style={styles.topbar}>
                <View style={styles.topbarSide} />
                <TouchableOpacity
                  onPress={() => setStreakModalVisible(true)}
                  style={styles.streakBadge}
                  accessibilityRole="button"
                  accessibilityLabel="Change streak type"
                >
                  <StreakFlame
                    size={20}
                    active={streakDisplay.value > 0}
                    inactiveColor={colors.textSecondary}
                    testID="streak-flame"
                  />
                  <Text style={styles.streakCount}>{streakDisplay.value}{streakDisplay.unit}</Text>
                  <Text style={styles.streakLabel}>Streak</Text>
                </TouchableOpacity>
                <View style={styles.topbarSide} />
              </View>

              <View style={styles.greetingBlock}>
                {/* The name flexes and truncates so a long one shortens itself
                    rather than pushing the button off the row. */}
                <View style={styles.greetingTextBlock}>
                  <Text style={styles.greetingText} numberOfLines={1}>{getDailyGreeting()},</Text>
                  <Text style={styles.greetingName} numberOfLines={1}>{displayName}</Text>
                </View>
                {HOME_CUSTOMIZATION_ENABLED && (
                  <TouchableOpacity
                    onPress={() => setArranging(v => !v)}
                    style={styles.customizeButton}
                    accessibilityRole="button"
                    accessibilityLabel={arranging ? 'Done customizing dashboard' : 'Customize your dashboard'}
                  >
                    {arranging
                      ? <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
                      : <Ionicons name="options-outline" size={20} color={colors.textSecondary} />}
                  </TouchableOpacity>
                )}
              </View>
              </>
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
            const activeDate = activeDayFilter(layout, selectedCalDate);
            const routineCompact = cardSize(layout, 'activeRoutine') === 'half';
            const cardNodes: Record<DashboardCardId, React.ReactNode> = {
              activeRoutine: (
                <>
          {/* Active Routine */}
          {activeRoutine && (
            <PressableScale
              style={[styles.activeBlock, routineCompact && styles.cardHalf]}
              onPress={routineCompact ? undefined : toggleDaysVisible}
            >
              <View style={styles.activeRoutineNameRow}>
                <Text style={styles.activeRoutineName} numberOfLines={1}>{activeRoutine.name}</Text>
                {/* Plain View, not a TouchableOpacity: the whole card already
                    toggles via PressableScale, and nesting a touchable inside
                    it left the label stuck at its pressed opacity because the
                    outer responder swallowed the press-out. */}
                <View style={[styles.toggleDaysBtn, routineCompact && styles.hiddenControl]}>
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
                <View style={[styles.upNextRow, routineCompact && styles.upNextRowCompact]}>
                  <View style={routineCompact ? undefined : { flex: 1 }}>
                    <Text style={styles.upNextLabel}>Up Next</Text>
                    {/* Name and exercise count share a line to keep the card short */}
                    <View style={styles.upNextNameRow}>
                      <Text style={styles.upNextName} numberOfLines={1}>{nextDay.label}</Text>
                      {!routineCompact && (
                        <Text style={styles.upNextMeta}>
                          {nextDay.workout_template.exercises.length} ex
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.logNextBtn, routineCompact && styles.logNextBtnCompact]}
                    onPress={() => logRoutineDay(nextDay)}
                  >
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

              <Collapsible progress={expandAnim} expanded={daysVisible && !routineCompact}>
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
              weeklyGoal: (
                <WeeklyGoalCard done={thisWeekCount} goal={weeklyGoal} size={cardSize(layout, 'weeklyGoal')} />
              ),
              greekRank: (
                <GreekRankCard
                  rank={greekRank.rank}
                  score={greekRank.score}
                  heldByGate={greekRank.heldByGate}
                  size={cardSize(layout, 'greekRank')}
                />
              ),
              weekCardio: (
                <>
          {/* Cardio This Week — only for people who log cardio at all, so it
              doesn't sit empty on a pure lifter's Home. */}
          {totalCardioActivities > 0 && (
            <View style={[styles.weekCardioCard, cardSize(layout, 'weekCardio') === 'half' && styles.cardHalf]}>
              <View style={styles.weekCardioHeader}>
                <Ionicons name="pulse" size={14} color={colors.accent} />
                <Text style={styles.weekCardioTitle}>Cardio This Week</Text>
              </View>
              {weekCardio.activities === 0 ? (
                <Text style={styles.weekCardioEmpty}>Nothing logged since Monday</Text>
              ) : cardSize(layout, 'weekCardio') === 'half' ? (
                /* Half width can't carry three columns: lead with the number
                   that matters and demote the rest to one line. */
                <View>
                  <Text style={styles.weekCardioValue}>
                    {weekCardio.distanceKm > 0
                      ? roundTenth(toDisplayDistance(weekCardio.distanceKm, distanceUnit)).toLocaleString()
                      : fmtDuration(weekCardio.minutes)}
                  </Text>
                  <Text style={styles.weekCardioLabel}>
                    {weekCardio.distanceKm > 0 ? (distanceUnit === 'mi' ? 'miles' : 'km') : 'total time'}
                  </Text>
                  <Text style={styles.weekCardioSub} numberOfLines={1}>
                    {weekCardio.activities} {weekCardio.activities === 1 ? 'activity' : 'activities'}
                    {weekCardio.distanceKm > 0 ? ` · ${fmtDuration(weekCardio.minutes)}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={styles.weekCardioStats}>
                  {/* Machine cardio is often logged as time with no distance,
                      so distance only earns its column when there is some. */}
                  {weekCardio.distanceKm > 0 && (
                    <View style={styles.weekCardioStat}>
                      <Text style={styles.weekCardioValue}>
                        {roundTenth(toDisplayDistance(weekCardio.distanceKm, distanceUnit)).toLocaleString()}
                      </Text>
                      <Text style={styles.weekCardioLabel}>{distanceUnit === 'mi' ? 'miles' : 'km'}</Text>
                    </View>
                  )}
                  <View style={styles.weekCardioStat}>
                    <Text style={styles.weekCardioValue}>{fmtDuration(weekCardio.minutes)}</Text>
                    <Text style={styles.weekCardioLabel}>time</Text>
                  </View>
                  <View style={styles.weekCardioStat}>
                    <Text style={styles.weekCardioValue}>{weekCardio.activities}</Text>
                    <Text style={styles.weekCardioLabel}>
                      {weekCardio.activities === 1 ? 'activity' : 'activities'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
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
            label={activeDate
              ? new Date(activeDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
              : 'Recent Workouts'}
            style={{ marginBottom: spacing.sm }}
          />
          {(() => {
            const list = activeDate ? dateWorkouts : workouts;
            if (list.length === 0) return (
              <Text style={styles.emptyText}>
                {activeDate ? 'No workouts on this day' : 'No recent workouts'}
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
            if (!arranging) {
              // Two adjacent half cards share a row; a lone half keeps its
              // width and leaves the other slot empty rather than stretching.
              return packRows(layout).map(row => (
                row.size === 'full' ? (
                  <React.Fragment key={row.ids[0]}>{cardNodes[row.ids[0]]}</React.Fragment>
                ) : (
                  <View key={row.ids.join('+')} style={styles.halfRow}>
                    {row.ids.map(id => (
                      <React.Fragment key={id}>{cardNodes[id]}</React.Fragment>
                    ))}
                    {row.ids.length === 1 && <View style={styles.halfSpacer} />}
                  </View>
                )
              ));
            }

            const persistLayout = (next: DashboardLayout) => {
              setLayout(next);
              saveDashboardLayout(authUser?.id, next);
            };
            const cards = layout.order
              .map(id => DASHBOARD_CARDS.find(c => c.id === id))
              .filter((c): c is typeof DASHBOARD_CARDS[number] => !!c);

            return (
              <View style={styles.arrangePanel}>
                <View style={styles.arrangeHeader}>
                  <Text style={styles.arrangeTitle}>Customize your dashboard</Text>
                  <TouchableOpacity onPress={() => persistLayout(defaultLayout())}>
                    <Text style={[styles.arrangeReset, { color: colors.accent }]}>Reset</Text>
                  </TouchableOpacity>
                </View>
                <DraggableList
                  data={cards}
                  keyExtractor={c => c.id}
                  rowHeight={ARRANGE_ROW_HEIGHT}
                  gap={spacing.sm}
                  onDragActiveChange={setDragging}
                  onReorder={(from, to) => {
                    const order = [...layout.order];
                    const [moved] = order.splice(from, 1);
                    order.splice(to, 0, moved);
                    persistLayout({ ...layout, order });
                  }}
                  renderItem={card => {
                    const isHidden = layout.hidden.includes(card.id);
                    const allowed = CARD_SIZES[card.id] ?? ['full'];
                    const current = cardSize(layout, card.id);
                    return (
                      <View
                        style={[styles.arrangeRow, isHidden && styles.arrangeRowHidden]}
                        testID={`arrange-row-${card.id}`}
                      >
                        <Ionicons name="reorder-three" size={22} color={colors.textSecondary} />
                        <View style={styles.arrangeRowText}>
                          <Text style={styles.arrangeRowTitle}>{card.title}</Text>
                          <Text style={styles.arrangeRowDescription} numberOfLines={1}>{card.description}</Text>
                        </View>
                        {/* Only cards with a compact variant offer a width;
                            the rest would render badly in half a phone. */}
                        {allowed.length > 1 && (
                          <View style={styles.sizeToggle}>
                            {(['full', 'half'] as CardSize[]).filter(sz => allowed.includes(sz)).map(sz => {
                              const on = current === sz;
                              return (
                                <TouchableOpacity
                                  key={sz}
                                  onPress={() => persistLayout({
                                    ...layout,
                                    sizes: { ...layout.sizes, [card.id]: sz },
                                  })}
                                  style={[styles.sizeOption, on && { backgroundColor: colors.accent }]}
                                  testID={`arrange-size-${card.id}-${sz}`}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: on }}
                                  accessibilityLabel={`Show ${card.title} at ${sz === 'full' ? 'full' : 'half'} width`}
                                >
                                  <Ionicons
                                    name={sz === 'full' ? 'square-outline' : 'tablet-portrait-outline'}
                                    size={14}
                                    color={on ? colors.accentText : colors.textSecondary}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => persistLayout({
                            ...layout,
                            hidden: isHidden
                              ? layout.hidden.filter(h => h !== card.id)
                              : [...layout.hidden, card.id],
                          })}
                          style={styles.arrangeToggle}
                          accessibilityRole="button"
                          accessibilityLabel={`${isHidden ? 'Show' : 'Hide'} ${card.title} on Home`}
                        >
                          <Ionicons
                            name={isHidden ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color={isHidden ? colors.textSecondary : colors.accent}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
                <Text style={styles.arrangeHint}>
                  Press and hold a card to drag it. Tap the eye to hide one. Log Workout and Track Activity always stay at the top.
                </Text>
              </View>
            );
          })()}

        </ScrollView>
      {/* Streak selector modal */}
      <Modal visible={streakModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.streakOverlay} activeOpacity={1} onPress={() => setStreakModalVisible(false)}>
          <View style={styles.streakModalBox}>
            <Text style={styles.streakModalTitle}>Streak Type</Text>
            {([
              { key: 'weekly' as const, emoji: null, label: 'Weekly', value: weeklyStreak, unit: 'wk', sub: null },
              { key: 'monthly' as const, emoji: '📅', label: 'Monthly', value: monthlyStreak, unit: 'mo', sub: null },
              { key: 'daily' as const, emoji: '⚡', label: 'Daily', value: dailyStreak, unit: 'd', sub: `longest: ${longestDailyStreak}d` },
            ] as const).map(row => (
              <TouchableOpacity
                key={row.key}
                style={[styles.streakRow, streakType === row.key && styles.streakRowActive]}
                onPress={() => setStreakType(row.key)}
              >
                {/* Weekly is the streak the flame stands for elsewhere, so it
                    gets the drawn flame; the other two keep their emoji. */}
                {row.emoji
                  ? <Text style={styles.streakRowEmoji}>{row.emoji}</Text>
                  : <View style={styles.streakRowIcon}><StreakFlame size={20} active={row.value > 0} inactiveColor={colors.textSecondary} /></View>}
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
  topbarSide: { flex: 1 },
  doneText: { fontSize: typography.fontSize.md, fontWeight: '700' },
  arrangePanel: { gap: spacing.sm, marginBottom: spacing.md },
  arrangeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrangeTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  arrangeReset: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  arrangeRow: {
    height: ARRANGE_ROW_HEIGHT,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  arrangeRowHidden: { opacity: 0.55 },
  arrangeRowText: { flex: 1 },
  arrangeRowTitle: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  arrangeRowDescription: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  arrangeToggle: { height: '100%', justifyContent: 'center', paddingLeft: spacing.sm },
  sizeToggle: {
    flexDirection: 'row',
    borderRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sizeOption: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  arrangeHint: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  customizeButton: { padding: spacing.xs },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  greetingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  greetingTextBlock: { flex: 1 },
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
  halfRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  hiddenControl: { display: 'none' },
  upNextRowCompact: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs },
  logNextBtnCompact: { alignItems: 'center' },
  halfSpacer: { flex: 1 },
  cardHalf: { flex: 1 },
  weekCardioSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  weekCardioCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekCardioHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  weekCardioTitle: {
    fontSize: 10, fontWeight: '700', color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  weekCardioStats: { flexDirection: 'row' },
  weekCardioStat: { flex: 1 },
  weekCardioValue: {
    fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary,
  },
  weekCardioLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  weekCardioEmpty: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
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

  // Plain text, not a chip: the surface card and flame read as another
  // action competing with Log Workout
  // Sits with the greeting's first line rather than centred against the
  // two-line block, which left it floating low in the row
  // Pulled above the greeting's first line; centre-aligned so the flame sits
  // with the number rather than on the text baseline
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakCount: { fontSize: typography.fontSize.md, fontWeight: '800', color: colors.textPrimary },
  streakLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },

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
  streakRowIcon: { width: 28, alignItems: 'center' },
  streakRowLabel: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  streakRowSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  streakRowValue: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textSecondary, minWidth: 40, textAlign: 'right' },
  streakModalDone: {
    marginTop: spacing.md, backgroundColor: colors.save,
    borderRadius: spacing.sm, padding: spacing.sm, alignItems: 'center',
  },
  streakModalDoneText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
});
