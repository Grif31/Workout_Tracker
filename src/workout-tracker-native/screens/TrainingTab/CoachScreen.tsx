import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Dimensions, Animated, ActivityIndicator, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { usePurchase } from '../../context/PurchaseContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { WeightUnit, GPS_DISTANCE_UNIT_KEY, roundTenth, toDisplayDistance } from '../../utils/units';
import { toLocalDateStr } from '../../utils/date';
import { COACH_INSIGHTS_KEY, WEEKLY_DISTANCE_GOAL_KEY, WEEKLY_GOAL_KEY } from '../../constants/storageKeys';
import { apiFetch, isNetworkError } from '../../utils/api';
import { appCache, useRefetchGate } from '../../utils/appCache';
import { buildTemplatePrefill, parseProgramming, type TemplateExercise } from '../../utils/templatePrefill';
import { TrainingStackParamsList } from '../../navigation/types';
import { muscleGroups } from '../../constants/muscleGroups';
import { SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../../constants/strengthRanks';
import CoachProfileModal, { CoachProfile, COACH_PROFILE_KEY, DEFAULT_PROFILE } from '../../components/coach/CoachProfileModal';
import SectionRule from '../../components/SectionRule';
import PressableScale from '../../components/PressableScale';
import { GREEK_RANK_COLORS, GREEK_RANKS } from '../../constants/greekRanks';
import type { GreekRankData } from '../../utils/greekRank';
import WeeklyGoalModal from '../../components/coach/WeeklyGoalModal';
import WorkingSetsInfoModal from '../../components/coach/WorkingSetsInfoModal';
import RangePickerModal, { type ChartRange, type MenuAnchor } from '../../components/coach/RangePickerModal';
import { hasLoggedNothing, visibleChartMetrics, type ChartMetric, type MetricsLogged } from '../../utils/progressMetrics';
import {
  displayToGoalKm, distanceGoalProgress, formatDistanceValue, goalKmToDisplay,
} from '../../utils/weeklyDistanceGoal';
import RoutinePickerModal from '../../components/coach/RoutinePickerModal';
import MusclePickerModal from '../../components/coach/MusclePickerModal';

const MINI_RING_SIZE = 44;
const MINI_RING_STROKE = 4;
const MINI_RING_R = (MINI_RING_SIZE - MINI_RING_STROKE) / 2;
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_RING_R;

type Props = NativeStackScreenProps<TrainingStackParamsList, 'TrainingHome'>;

type ProgressBucket = { label: string; volume: number; sets: number; count: number; distance_km?: number };
type ProgressResponse = { buckets?: ProgressBucket[]; metrics_logged?: MetricsLogged };
type Exercise = TemplateExercise;
type MuscleVolumeData = {
  muscle_sets: Record<string, number>;
  last_trained: Record<string, string>;
  total_sets: number;
  last_week_total: number;
  week_start: string;
};
type WeeklySummaryPreview = {
  week_start: string;
  workouts: number;
  total_volume: number;
  distance_km?: number;
  weight_unit: string;
};
type WorkoutTemplate = { id: number; name: string; exercises: Exercise[]; programming_json?: string | null };
type RoutineDay = {
  id: number; day_order: number; label: string;
  workout_template: { id: number; name: string; exercises: Exercise[] };
};
type Routine = { id: number; name: string; description?: string; day_count: number };
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };
type Insight = { type: string; title: string; body: string; priority: 'high' | 'medium' | 'low' };
type InsightsCache = { insights: Insight[]; fetchedAt: string };

const MUSCLE_STANDARDS: Record<string, { mev: number; mav: number; mrv: number }> = {
  Chest:      { mev: 8,  mav: 16, mrv: 20 },
  Back:       { mev: 10, mav: 22, mrv: 25 },
  Shoulders:  { mev: 8,  mav: 22, mrv: 26 },
  Biceps:     { mev: 8,  mav: 20, mrv: 26 },
  Triceps:    { mev: 6,  mav: 14, mrv: 20 },
  Forearms:   { mev: 4,  mav: 14, mrv: 20 },
  Quads:      { mev: 8,  mav: 18, mrv: 20 },
  Hamstrings: { mev: 6,  mav: 16, mrv: 20 },
  Glutes:     { mev: 4,  mav: 12, mrv: 16 },
  Calves:     { mev: 8,  mav: 20, mrv: 30 },
  Core:       { mev: 6,  mav: 20, mrv: 25 },
};


const INSIGHT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  deload:      'battery-half-outline',
  rest:        'moon-outline',
  frequency:   'repeat-outline',
  routine:     'calendar-outline',
  achievement: 'trophy-outline',
  suggestion:  'bulb-outline',
};

// Human-readable labels for the coach-profile summary chips in the hero.
// Values mirror the option lists in CoachProfileModal.
const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hypertrophy', strength: 'Strength', endurance: 'Endurance', general: 'General',
};
const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};
const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Full Gym', home_barbell: 'Home Gym', dumbbells: 'Dumbbells', bodyweight: 'Bodyweight',
};
const AVOID_LABELS: Record<string, string> = {
  lower_back: 'Lower Back', knees: 'Knees', shoulders: 'Shoulders',
};

// Black or white text for a solid hex fill — keeps the rank badge letter
// readable on the light rank colors (Athlete blue, Aretē gold).
function onColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a1a1a' : '#fff';
}

function daysAgoStr(iso: string | undefined): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function CoachScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const { isPremium } = usePurchase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<'training' | 'progress' | 'coach'>('progress');
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  const metricAnimRef = useRef(new Animated.Value(0)).current;
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const METRIC_BAR_WIDTH = SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2;

  // ── Tab animations ──────────────────────────────────────────────────────────
  const TAB_NAMES = ['training', 'progress', 'coach'] as const;
  const TAB_W = (SCREEN_WIDTH - spacing.md * 2) / 3;
  const SLIDER_W = TAB_W * 0.5;
  const tabIndexAnim = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const insightAnimsRef = useRef<Animated.Value[]>([]);

  
  // Mutable refs so the stable PanResponder can read current values without stale closure
  const activeTabRef = useRef<typeof TAB_NAMES[number]>('progress');
  const handleTabChangeRef = useRef<(tab: typeof TAB_NAMES[number]) => void>(() => {});

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.8,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, { dx, vx }) => {
        const idx = TAB_NAMES.indexOf(activeTabRef.current);
        if ((dx < -50 || vx < -0.5) && idx < TAB_NAMES.length - 1) {
          handleTabChangeRef.current(TAB_NAMES[idx + 1]);
        } else if ((dx > 50 || vx > 0.5) && idx > 0) {
          handleTabChangeRef.current(TAB_NAMES[idx - 1]);
        }
      },
    })
  ).current;

  const tabSliderX = tabIndexAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      (TAB_W - SLIDER_W) / 2,
      TAB_W + (TAB_W - SLIDER_W) / 2,
      TAB_W * 2 + (TAB_W - SLIDER_W) / 2,
    ],
  });

  const handleTabChange = (tab: typeof TAB_NAMES[number]) => {
    Animated.spring(tabIndexAnim, {
      toValue: TAB_NAMES.indexOf(tab),
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.6,
    }).start();
    Animated.timing(contentOpacity, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      Animated.timing(contentOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  // Keep mutable refs in sync so PanResponder always reads current values
  activeTabRef.current = activeTab;
  handleTabChangeRef.current = handleTabChange;

  const handleMetricChange = (m: ChartMetric) => {
    const idx = visibleMetrics.indexOf(m);
    Animated.timing(metricAnimRef, { toValue: idx, duration: 200, useNativeDriver: true }).start();
    setChartMetric(m);
    setSelectedBarIndex(null);
  };

  // ── Progress tab state ──────────────────────────────────────────────────────
  const [progressData, setProgressData] = useState<ProgressBucket[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('volume');
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  // Optional, in km; null until the user turns a distance goal on.
  const [weeklyDistanceGoalKm, setWeeklyDistanceGoalKm] = useState<number | null>(null);
  const [thisWeekDistanceKm, setThisWeekDistanceKm] = useState(0);
  // All-time, from the progress endpoint; null until it answers (or from a
  // backend that predates it). Decides which metric tabs the chart offers.
  const [metricsLogged, setMetricsLogged] = useState<MetricsLogged | null>(null);
  const [strengthPercentile, setStrengthPercentile] = useState<number | null>(null);
  const [strengthRankLabel, setStrengthRankLabel] = useState<string | null>(null);
  const [endurancePercentile, setEndurancePercentile] = useState<number | null>(null);
  const [enduranceRankLabel, setEnduranceRankLabel] = useState<string | null>(null);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeData | null>(null);
  const [weeklySummaryPreview, setWeeklySummaryPreview] = useState<WeeklySummaryPreview | null>(null);
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<MenuAnchor | null>(null);
  const rangeButtonRef = useRef<View>(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [workingSetsInfoVisible, setWorkingSetsInfoVisible] = useState(false);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // ── Training tab state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  // Muscle picker for creating blank templates (existing feature)
  const [musclePickerVisible, setMusclePickerVisible] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // ── Coach tab state ─────────────────────────────────────────────────────────
  const [greekRank, setGreekRank] = useState<string>('Neophyte');
  const [coachProfile, setCoachProfile] = useState<CoachProfile>(DEFAULT_PROFILE);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // AI generate muscle picker
  const [aiMusclePickerVisible, setAiMusclePickerVisible] = useState(false);
  const [aiSelectedMuscles, setAiSelectedMuscles] = useState<string[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  // Routine generate loading
  const [routineGenerating, setRoutineGenerating] = useState(false);

  // ── Initialization ──────────────────────────────────────────────────────────
  // Keyed on user.id: it can be undefined on first mount while auth hydrates,
  // and a `_undefined` key would just read back the defaults.
  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.multiGet([
      `${COACH_PROFILE_KEY}_${user.id}`, `${WEEKLY_GOAL_KEY}_${user.id}`, `${WEEKLY_DISTANCE_GOAL_KEY}_${user.id}`,
    ]).then(([profileRaw, goalRaw, distanceGoalRaw]) => {
      if (profileRaw[1]) {
        try { setCoachProfile({ ...DEFAULT_PROFILE, ...JSON.parse(profileRaw[1]) }); } catch { }
      }
      if (goalRaw[1]) setWeeklyGoal(parseInt(goalRaw[1], 10) || 3);
      const goalKm = distanceGoalRaw[1] ? parseFloat(distanceGoalRaw[1]) : NaN;
      setWeeklyDistanceGoalKm(goalKm > 0 ? goalKm : null);
    });
  }, [user?.id]);

  useEffect(() => {
    // Load cached insights
    AsyncStorage.getItem(COACH_INSIGHTS_KEY).then(raw => {
      if (!raw) return;
      try {
        const cache: InsightsCache = JSON.parse(raw);
        const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
        if (ageMs < 3_600_000 && cache.insights?.length) setInsights(cache.insights);
      } catch { }
    });
  }, []);

  const updateWeeklyGoal = (delta: number) => {
    const next = Math.max(1, Math.min(7, weeklyGoal + delta));
    setWeeklyGoal(next);
    AsyncStorage.setItem(`${WEEKLY_GOAL_KEY}_${user?.id}`, String(next));
  };

  // `value` is in the display unit; null turns the goal off.
  const updateWeeklyDistanceGoal = (value: number | null) => {
    const key = `${WEEKLY_DISTANCE_GOAL_KEY}_${user?.id}`;
    if (value == null) {
      setWeeklyDistanceGoalKm(null);
      AsyncStorage.removeItem(key);
      return;
    }
    const km = displayToGoalKm(value, distanceUnit);
    setWeeklyDistanceGoalKm(km);
    AsyncStorage.setItem(key, String(km));
  };

  // This week is the newest 30d bucket, the same source as thisWeekCount.
  const applyThisWeek = (data: ProgressResponse) => {
    const buckets = data.buckets ?? [];
    const thisWeek = buckets[buckets.length - 1];
    setThisWeekCount(thisWeek?.count ?? 0);
    setThisWeekDistanceKm(thisWeek?.distance_km ?? 0);
    if (data.metrics_logged) setMetricsLogged(data.metrics_logged);
  };

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    const tmpl = appCache.get<WorkoutTemplate[]>('templates');
    const rout = appCache.get<Routine[]>('routines');
    const prog = appCache.get<{ buckets: ProgressBucket[] }>('progress');
    const score = appCache.get<any>('strength_score');
    if (tmpl) setTemplates(tmpl);
    if (rout) setRoutines(rout);
    if (prog) setProgressData(prog.buckets ?? []);
    if (score?.overall != null) setStrengthPercentile(score.overall);
    if (score?.overall_rank?.label) setStrengthRankLabel(score.overall_rank.label);
    const endurance = appCache.get<any>('endurance_score');
    if (endurance?.overall != null) setEndurancePercentile(endurance.overall);
    if (endurance?.overall_rank?.label) setEnduranceRankLabel(endurance.overall_rank.label);
    const greek = appCache.get<GreekRankData>('greek_rank');
    if (greek?.greek_rank) setGreekRank(greek.greek_rank);
    const mv = appCache.get<MuscleVolumeData>('muscle_volume');
    if (mv) setMuscleVolume(mv);
    const wsp = appCache.get<WeeklySummaryPreview>('weekly_summary_preview');
    if (wsp) setWeeklySummaryPreview(wsp);
    const prog30 = appCache.get<ProgressResponse>('progress');
    if (prog30) applyThisWeek(prog30);
  }, []);

  useEffect(() => {
    if (insights.length === 0) return;
    while (insightAnimsRef.current.length < insights.length) {
      insightAnimsRef.current.push(new Animated.Value(0));
    }
    const anims = insightAnimsRef.current.slice(0, insights.length);
    anims.forEach(a => a.setValue(0));
    Animated.stagger(60, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 280, useNativeDriver: true })
    )).start();
  }, [insights]);

  const fetchProgressData = async (range: ChartRange) => {
    try {
      const res = await apiFetch(`/api/stats/progress?range=${range}`);
      if (res.ok) {
        const data: ProgressResponse = await res.json();
        setProgressData(data.buckets ?? []);
        if (data.metrics_logged) setMetricsLogged(data.metrics_logged);
      }
    } catch { }
  };

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (res.ok) setTemplates(await res.json());
    } catch { }
  };

  const fetchRoutines = async () => {
    try {
      const res = await apiFetch('/api/routines');
      if (res.ok) setRoutines(await res.json());
    } catch { }
  };

  const fetchActiveRoutine = async () => {
    if (!user?.active_routine_id) { setActiveRoutine(null); return; }
    try {
      const res = await apiFetch(`/api/routines/${user.active_routine_id}`);
      if (res.ok) setActiveRoutine(await res.json());
    } catch { }
  };

  const fetchStrengthScore = async () => {
    try {
      const res = await apiFetch('/api/stats/strength-score');
      if (res.ok) {
        const data = await res.json();
        setStrengthPercentile(data.overall ?? null);
        if (data.overall_rank?.label) setStrengthRankLabel(data.overall_rank.label);
      }
    } catch { }
  };

  // Separate from strength-score, which needs gender: the rank doesn't
  const fetchGreekRank = async () => {
    try {
      const res = await apiFetch('/api/stats/greek-rank');
      if (res.ok) {
        const data: GreekRankData = await res.json();
        setGreekRank(data.greek_rank);
        appCache.set('greek_rank', data);
      }
    } catch { }
  };

  const fetchEnduranceScore = async () => {
    try {
      const res = await apiFetch('/api/stats/endurance-score');
      if (res.ok) {
        const data = await res.json();
        setEndurancePercentile(data.overall ?? null);
        setEnduranceRankLabel(data.overall_rank?.label ?? null);
        appCache.set('endurance_score', data);
      }
    } catch { }
  };

  const fetchThisWeekCount = async () => {
    try {
      const res = await apiFetch('/api/stats/progress?range=30d');
      if (res.ok) applyThisWeek(await res.json());
    } catch { }
  };

  const fetchMuscleGroupData = async () => {
    try {
      const now = new Date();
      const localDate = toLocalDateStr(now);
      const res = await apiFetch(`/api/stats/muscle-volume?local_date=${localDate}`);
      if (res.ok) {
        const data = await res.json();
        setMuscleVolume(data);
        appCache.set('muscle_volume', data);
      }
    } catch { }
  };

  const fetchWeeklySummaryPreview = async () => {
    try {
      const res = await apiFetch('/api/stats/weekly-summary');
      if (res.ok) {
        const data = await res.json();
        const preview: WeeklySummaryPreview = {
          week_start: data.week_start, workouts: data.workouts, total_volume: data.total_volume,
          distance_km: data.distance_km, weight_unit: data.weight_unit,
        };
        setWeeklySummaryPreview(preview);
        appCache.set('weekly_summary_preview', preview);
      }
    } catch { }
  };

  // Seeded from the preload so the data the mount effect above just painted
  // counts as fetched. Progress was preloaded at 30d, the initial chartRange.
  const refetchIfStale = useRefetchGate(() => ({
    progress: appCache.stampOf('progress'),
    thisWeek: appCache.stampOf('progress'),
    templates: appCache.stampOf('templates'),
    routines: appCache.stampOf('routines'),
    strength: appCache.stampOf('strength_score'),
    endurance: appCache.stampOf('endurance_score'),
    greek: appCache.stampOf('greek_rank'),
    muscleVolume: appCache.stampOf('muscle_volume'),
    weeklySummary: appCache.stampOf('weekly_summary_preview'),
  }));

  // Read through a ref so a range change doesn't re-run the whole focus
  // refetch; handleRangeChange fetches the new range itself.
  const chartRangeRef = useRef(chartRange);
  chartRangeRef.current = chartRange;

  useFocusEffect(useCallback(() => {
    refetchIfStale('progress', () => fetchProgressData(chartRangeRef.current));
    refetchIfStale('templates', fetchTemplates);
    refetchIfStale('routines', fetchRoutines);
    // Keyed on the id so switching routines is never answered from the old one
    refetchIfStale(`routine:${user?.active_routine_id}`, fetchActiveRoutine);
    refetchIfStale('strength', fetchStrengthScore);
    refetchIfStale('endurance', fetchEnduranceScore);
    refetchIfStale('greek', fetchGreekRank);
    refetchIfStale('muscleVolume', fetchMuscleGroupData);
    refetchIfStale('thisWeek', fetchThisWeekCount);
    refetchIfStale('weeklySummary', fetchWeeklySummaryPreview);
  }, [user?.active_routine_id]));

  // ── Coach tab handlers ──────────────────────────────────────────────────────
  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await apiFetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experience: coachProfile.experience,
          goal: coachProfile.goal,
          avoid: coachProfile.avoid[0] ?? 'none',
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Couldn't Load Insights", data.message || 'Try again in a moment.'); return; }
      setInsights(data.insights ?? []);
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify({
        insights: data.insights,
        fetchedAt: data.generated_at || new Date().toISOString(),
      }));
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Insights", 'Try again in a moment.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleGenerateTemplate = async () => {
    const muscles = aiSelectedMuscles;
    setAiMusclePickerVisible(false);
    setAiGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachProfile.days_per_week,
          goal: coachProfile.goal,
          experience: coachProfile.experience,
          equipment: coachProfile.equipment,
          session_length_min: coachProfile.session_length_min,
          avoid: coachProfile.avoid[0] ?? 'none',
          generate_type: 'template',
          muscles,
          notes: coachProfile.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Couldn't Generate Workout", data.message || 'Try again in a moment.'); return; }
      navigation.navigate('AIWorkoutPreview', {
        generateType: data.type,
        name: data.name,
        description: data.description,
        exercises: data.exercises,
        days: data.days,
        coachDays: coachProfile.days_per_week,
        coachGoal: coachProfile.goal,
        coachExp: coachProfile.experience,
        coachEquipment: coachProfile.equipment,
        coachSessionLength: String(coachProfile.session_length_min),
        coachAvoid: coachProfile.avoid[0] ?? 'none',
        coachNotes: coachProfile.notes,
      });
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Generate Workout", 'Try again in a moment.');
    } finally {
      setAiGenerating(false);
      setAiSelectedMuscles([]);
    }
  };

  const handleGenerateRoutine = async () => {
    setRoutineGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachProfile.days_per_week,
          goal: coachProfile.goal,
          experience: coachProfile.experience,
          equipment: coachProfile.equipment,
          session_length_min: coachProfile.session_length_min,
          avoid: coachProfile.avoid[0] ?? 'none',
          generate_type: 'routine',
          notes: coachProfile.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Couldn't Generate Routine", data.message || 'Try again in a moment.'); return; }
      navigation.navigate('AIWorkoutPreview', {
        generateType: data.type,
        name: data.name,
        description: data.description,
        exercises: data.exercises,
        days: data.days,
        coachDays: coachProfile.days_per_week,
        coachGoal: coachProfile.goal,
        coachExp: coachProfile.experience,
        coachEquipment: coachProfile.equipment,
        coachSessionLength: String(coachProfile.session_length_min),
        coachAvoid: coachProfile.avoid[0] ?? 'none',
        coachNotes: coachProfile.notes,
      });
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Generate Routine", 'Try again in a moment.');
    } finally {
      setRoutineGenerating(false);
    }
  };

  // ── Training tab handlers ───────────────────────────────────────────────────
  const activateRoutine = async (routineId: number) => {
    try {
      const res = await apiFetch(`/api/routines/${routineId}/activate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        updateUser({ active_routine_id: data.active_routine_id });
        setSelectModalVisible(false);
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Set Active Routine", 'Try again in a moment.');
    }
  };

  const handleActiveBlockPress = () => {
    if (routines.length === 0) navigation.navigate('CreateRoutine');
    else setSelectModalVisible(true);
  };

  const createTemplate = () => {
    setSelectedMuscles([]);
    setMusclePickerVisible(true);
  };

  const handleCreateTemplateWithMuscles = () => {
    setMusclePickerVisible(false);
    // No template id: TemplateDetail creates the template on its first save, so
    // backing out without saving doesn't leave an empty template behind.
    navigation.navigate('TemplateDetail', {
      muscleGroups: selectedMuscles.length > 0 ? selectedMuscles : undefined,
    });
  };

  const visibleMetrics = useMemo(() => visibleChartMetrics(metricsLogged), [metricsLogged]);
  // Falling back here rather than resetting state keeps the user's pick for
  // when that metric's tab comes back.
  const activeMetric: ChartMetric = visibleMetrics.includes(chartMetric)
    ? chartMetric
    : (visibleMetrics[0] ?? 'workouts');
  const metricSlideWidth = METRIC_BAR_WIDTH / Math.max(1, visibleMetrics.length);
  const visibleMetricsKey = visibleMetrics.join(',');
  useEffect(() => {
    // Tabs were added or removed under the slider; put it back on the active one.
    metricAnimRef.setValue(Math.max(0, visibleMetrics.indexOf(activeMetric)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMetricsKey]);

  // Opens straight away; the menu stays invisible for the frame until the
  // button's position comes back, so the tap never waits on the measurement.
  const openRangePicker = () => {
    setRangeAnchor(null);
    setRangePickerVisible(true);
    rangeButtonRef.current?.measureInWindow((x, y, width, height) => {
      setRangeAnchor({ x, y, width, height });
    });
  };

  const handleRangeChange = (newRange: ChartRange) => {
    setProgressData([]);
    setSelectedBarIndex(null);
    setChartRange(newRange);
    refetchIfStale('progress', () => fetchProgressData(newRange), true);
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const rankColor = GREEK_RANK_COLORS[greekRank] ?? colors.accent;
  const rankIcon = GREEK_RANKS.find(r => r.name === greekRank)?.icon ?? greekRank.charAt(0);

  const renderInsightCard = (ins: Insight, idx: number) => {
    const icon = INSIGHT_ICONS[ins.type] ?? 'bulb-outline';
    const priorityColor = ins.type === 'achievement' ? colors.save : ins.priority === 'high' ? colors.danger : ins.priority === 'medium' ? colors.warmup : colors.accent;
    const anim = insightAnimsRef.current[idx] ?? new Animated.Value(1);
    return (
      <Animated.View
        key={idx}
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <View style={[styles.insightCard, { borderLeftWidth: 3, borderLeftColor: priorityColor }]}>
          <View style={styles.insightIconWrap}>
            <Ionicons name={icon} size={20} color={priorityColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightTitle}>{ins.title}</Text>
            <Text style={styles.insightBody}>{ins.body}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderLockedInsightPlaceholder = (idx: number) => (
    <View key={idx} style={[styles.insightCard, styles.insightCardLocked]}>
      <View style={styles.insightIconWrap}>
        <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={[styles.insightPlaceholderLine, { width: '60%' }]} />
        <View style={[styles.insightPlaceholderLine, { width: '90%', marginTop: 6 }]} />
        <View style={[styles.insightPlaceholderLine, { width: '75%', marginTop: spacing.xs }]} />
      </View>
    </View>
  );

  const weeklySummarySubtitle = () => {
    const p = weeklySummaryPreview;
    if (!p) return 'Workouts, volume, and PRs from last week';
    const dateRange = weekRangeLabel(p.week_start);
    if (p.workouts === 0) return `${dateRange} · No workouts logged`;
    const workoutsStr = `${p.workouts} workout${p.workouts !== 1 ? 's' : ''}`;
    if (p.total_volume > 0) return `${dateRange} · ${workoutsStr} · ${p.total_volume.toLocaleString()} ${p.weight_unit}`;
    if (p.distance_km != null) {
      const dist = toDisplayDistance(p.distance_km, distanceUnit);
      return `${dateRange} · ${workoutsStr} · ${dist.toFixed(2)}${distanceUnit}`;
    }
    return `${dateRange} · ${workoutsStr}`;
  };

  const renderMuscleVolumeCard = () => {
    if (!muscleVolume) return null;
    const allMuscles = Object.keys(MUSCLE_STANDARDS);
    const trained = allMuscles.filter(m => (muscleVolume.muscle_sets[m] ?? 0) > 0)
      .sort((a, b) => (muscleVolume.muscle_sets[b] ?? 0) - (muscleVolume.muscle_sets[a] ?? 0));
    const untrained = allMuscles.filter(m => !(muscleVolume.muscle_sets[m] ?? 0));
    const maxSets = Math.max(1, ...trained.map(m => muscleVolume.muscle_sets[m] ?? 0));

    const renderMvRow = (muscle: string) => {
      const sets = muscleVolume.muscle_sets[muscle] ?? 0;
      const std = MUSCLE_STANDARDS[muscle];
      const lastDate = muscleVolume.last_trained[muscle];
      const isTrained = sets > 0;
      const freeFillPct = (sets / maxSets) * 100;
      const zoneColor = sets >= std.mrv ? colors.danger
        : sets > std.mav ? colors.warmup
        : sets >= std.mev ? colors.accent
        : sets > 0 ? colors.textSecondary
        : colors.border;
      const premiumFillPct = Math.min((sets / std.mrv) * 100, 100);
      const mevPct = (std.mev / std.mrv) * 100;
      const mavPct = (std.mav / std.mrv) * 100;
      const zoneLabel = sets > std.mrv ? 'Overreaching'
        : sets > std.mav ? 'High'
        : sets >= std.mev ? 'On track'
        : sets > 0 ? 'Below target'
        : '';

      return (
        <View key={muscle} style={styles.mvRow}>
          <Text style={[styles.mvMuscle, !isTrained && { color: colors.textSecondary }]} numberOfLines={1}>
            {muscle}
          </Text>
          <View style={styles.mvBarArea}>
            {isPremium ? (
              <View style={styles.mvPremiumTrack}>
                <View style={[styles.mvPremiumFill, { width: `${premiumFillPct}%` as any, backgroundColor: zoneColor }]} />
                <View style={[styles.mvTick, { left: `${mevPct}%` as any }]} />
                <View style={[styles.mvTick, { left: `${mavPct}%` as any }]} />
              </View>
            ) : (
              <View style={styles.mvFreeTrack}>
                <View style={[styles.mvFreeFill, { width: `${freeFillPct}%` as any, backgroundColor: isTrained ? colors.accent : colors.border }]} />
              </View>
            )}
          </View>
          <Text style={[styles.mvCount, !isTrained && { color: colors.textSecondary }]} numberOfLines={1}>
            {isTrained ? sets : '–'}
          </Text>
          {isPremium && zoneLabel ? (
            <Text style={[styles.mvZoneLabel, { color: zoneColor }]} numberOfLines={1}>{zoneLabel}</Text>
          ) : (
            <Text style={styles.mvLastTrained} numberOfLines={1}>
              {isTrained ? daysAgoStr(lastDate) : lastDate ? daysAgoStr(lastDate) : ''}
            </Text>
          )}
        </View>
      );
    };

    return (
      <View style={styles.mvCard}>
        <View style={styles.mvHeader}>
          <View>
            <Text style={styles.scoreCardTitle}>This Week</Text>
            <Text style={styles.mvWeekRange}>{weekRangeLabel(muscleVolume.week_start)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={styles.mvTotalText}>{muscleVolume.total_sets} working sets</Text>
            <TouchableOpacity onPress={() => setWorkingSetsInfoVisible(true)}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {isPremium && (
          <View style={styles.mvColLabels}>
            <View style={{ width: 88 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mvColLabel}>MEV → MAV → MRV</Text>
            </View>
          </View>
        )}

        {trained.map(renderMvRow)}
        {untrained.length > 0 && (
          <>
            <View style={styles.mvDivider}>
              <Text style={styles.mvDividerText}>Not trained this week</Text>
            </View>
            {untrained.map(renderMvRow)}
          </>
        )}

        {!isPremium && (
          <TouchableOpacity
            style={styles.mvPremiumTeaser}
            onPress={() => (navigation as any).navigate('Paywall', { source: 'muscle_volume' })}
          >
            <Ionicons name="lock-closed-outline" size={14} color={colors.accent} />
            <Text style={[styles.mvTotalText, { color: colors.accent }]}>
              Unlock MEV · MAV · MRV zone bars
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* 3-tab row */}
      <View style={styles.tabRow}>
        {TAB_NAMES.map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tabBtn}
            onPress={() => handleTabChange(tab)}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <Animated.View
          style={[styles.tabSlider, { width: SLIDER_W, transform: [{ translateX: tabSliderX }] }]}
        />
      </View>

      <Animated.View style={{ flex: 1, opacity: contentOpacity }} {...swipeResponder.panHandlers}>
      {/* ── TRAINING TAB ── */}
      {activeTab === 'training' && (
        <ScrollView style={styles.trainingScroll} contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          {/* Active Routine */}
          <PressableScale
            style={styles.activeBlock}
            onPress={activeRoutine
              ? () => navigation.navigate('RoutineDetail', { routineId: activeRoutine.id, routineName: activeRoutine.name })
              : handleActiveBlockPress}
          >
            <Text style={styles.activeRoutineLabel}>Active Routine</Text>
            {activeRoutine ? (
              <View style={styles.activeRoutineNameRow}>
                <Text style={styles.activeRoutineName} numberOfLines={1}>{activeRoutine.name}</Text>
                {/* Plain View, not a TouchableOpacity: the card itself is the
                    tap target, and nesting a touchable inside PressableScale
                    left the label stuck at its pressed opacity because the
                    outer responder swallowed the press-out. */}
                <View style={styles.toggleDaysBtn}>
                  <Text style={[styles.toggleDaysBtnText, { color: colors.accent }]}>
                    {activeRoutine.days.length} Day{activeRoutine.days.length !== 1 ? 's' : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </View>
              </View>
            ) : (
              <Text style={styles.noRoutineText}>
                {routines.length === 0 ? 'No routines yet. Tap to create one' : 'No active routine. Tap to select one'}
              </Text>
            )}
          </PressableScale>

          {/* Templates */}
          <View style={styles.sectionHeaderRow}>
            <SectionRule label="Templates" style={{ flex: 1, marginBottom: 0 }} />
            <TouchableOpacity
              onPress={!isPremium && templates.length >= 5
                ? () => (navigation as any).navigate('Paywall', { source: 'templates' })
                : createTemplate
              }
              style={styles.newTemplateBtn}
            >
              <Ionicons name={!isPremium && templates.length >= 5 ? 'lock-closed-outline' : 'add'} size={16} color={colors.save} />
              <Text style={styles.newTemplateBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          {templates.length === 0 ? (
            <Text style={styles.emptyText}>No templates yet. Save a workout as a template to reuse it.</Text>
          ) : (
            (showAllTemplates ? templates : templates.slice(0, 5)).map(t => (
              <TouchableOpacity
                key={t.id}
                style={styles.card}
                onPress={() => navigation.navigate('TemplateDetail', { templateId: t.id })}
              >
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{t.name}</Text>
                    <Text style={styles.cardSub}>{t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}</Text>
                    {(() => {
                      const muscles = [...new Set(
                        t.exercises.flatMap(ex => ex.muscle_group ? ex.muscle_group.split(',').map(m => m.trim()) : []).filter(Boolean)
                      )].slice(0, 3);
                      return muscles.length > 0 ? (
                        <View style={styles.muscleChipRow}>
                          {muscles.map(m => (
                            <View key={m} style={styles.templateMuscleChip}>
                              <Text style={styles.templateMuscleChipText}>{m}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null;
                    })()}
                  </View>
                  <TouchableOpacity
                    style={styles.logInlineBtn}
                    onPress={() => (navigation as any).navigate('DashboardTab', {
                      screen: 'WorkoutLog',
                      initial: false,
                      params: {
                        prefill: buildTemplatePrefill(t.name, t.exercises, parseProgramming(t.programming_json)),
                      },
                    })}
                  >
                    <Text style={styles.logInlineBtnText}>Log</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
          {templates.length > 5 && (
            <TouchableOpacity
              style={styles.showAllBtn}
              onPress={() => setShowAllTemplates(v => !v)}
            >
              <Text style={[styles.showAllBtnText, { color: colors.accent }]}>
                {showAllTemplates ? 'Show Less' : `Show All (${templates.length})`}
              </Text>
              <Ionicons
                name={showAllTemplates ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.accent}
              />
            </TouchableOpacity>
          )}

          {/* Routines */}
          <View style={[styles.sectionHeaderRow, { marginTop: spacing.md }]}>
            <SectionRule label="Routines" style={{ flex: 1, marginBottom: 0 }} />
            <TouchableOpacity
              onPress={!isPremium && routines.length >= 2
                ? () => (navigation as any).navigate('Paywall', { source: 'routines' })
                : () => navigation.navigate('CreateRoutine')
              }
              style={styles.newTemplateBtn}
            >
              <Ionicons name={!isPremium && routines.length >= 2 ? 'lock-closed-outline' : 'add'} size={16} color={colors.save} />
              <Text style={styles.newTemplateBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          {routines.length === 0 ? (
            <Text style={styles.emptyText}>No routines yet</Text>
          ) : (
            <View style={styles.routineGrid}>
              {routines.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.routineCard}
                  onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id, routineName: item.name })}
                >
                  <Text style={styles.routineCardName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.routineCardSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── COACH TAB ── */}
      {activeTab === 'coach' && (
        <ScrollView contentContainerStyle={styles.coachContent}>
          {/* Coach-profile summary — the whole card opens the profile modal */}
          <PressableScale
            style={[styles.coachHero, { backgroundColor: rankColor + '18', borderColor: rankColor + '40' }]}
            onPress={() => setProfileModalVisible(true)}
          >
            <View style={styles.coachHeroTopRow}>
              <TouchableOpacity
                style={[styles.rankPill, { borderColor: rankColor + '55' }]}
                onPress={() => isPremium
                  ? navigation.navigate('StrengthScore')
                  : (navigation as any).navigate('Paywall', { source: 'strength_score' })
                }
              >
                <View style={[styles.rankPillIcon, { backgroundColor: rankColor }]}>
                  <Text style={[styles.rankPillIconText, { color: onColor(rankColor) }]}>{rankIcon}</Text>
                </View>
                <Text style={[styles.rankPillText, { color: rankColor }]}>{greekRank}</Text>
              </TouchableOpacity>
              <Ionicons name="create-outline" size={16} color={colors.accent} />
            </View>

            <View style={styles.coachSummaryRow}>
              <Text style={styles.coachSummaryLabel}>Goal</Text>
              <Text style={styles.coachSummaryValue} numberOfLines={1}>
                {GOAL_LABELS[coachProfile.goal] ?? coachProfile.goal}
                {'  ·  '}{EXPERIENCE_LABELS[coachProfile.experience] ?? coachProfile.experience}
              </Text>
            </View>
            <View style={styles.coachSummaryRow}>
              <Text style={styles.coachSummaryLabel}>Setup</Text>
              <Text style={styles.coachSummaryValue} numberOfLines={1}>
                {EQUIPMENT_LABELS[coachProfile.equipment] ?? coachProfile.equipment}
                {'  ·  '}{coachProfile.days_per_week} days/wk
                {'  ·  '}{coachProfile.session_length_min} min
              </Text>
            </View>
            {coachProfile.avoid.length > 0 && (
              <View style={styles.coachSummaryRow}>
                <Ionicons name="alert-circle-outline" size={13} color={colors.danger} style={styles.coachAvoidIcon} />
                <Text style={[styles.coachSummaryValue, { color: colors.danger }]} numberOfLines={1}>
                  Avoid {coachProfile.avoid.map(a => AVOID_LABELS[a] ?? a).join(', ')}
                </Text>
              </View>
            )}
          </PressableScale>

          {/* AI Coach card — Generate + Insights unified */}
          <View style={styles.aiCoachCard}>
            <SectionRule label="Generate" style={{ marginBottom: spacing.sm }} />
            <View style={styles.generateBtnRow}>
              <TouchableOpacity
                style={[styles.generateBtn, aiGenerating && { opacity: 0.6 }]}
                disabled={aiGenerating || routineGenerating}
                onPress={isPremium
                  ? () => { setAiSelectedMuscles([]); setAiMusclePickerVisible(true); }
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
              >
                <Ionicons
                  name={isPremium ? (aiGenerating ? 'hourglass-outline' : 'list-outline') : 'lock-closed-outline'}
                  size={16} color={colors.accentText}
                />
                <Text style={styles.generateBtnText}>
                  {aiGenerating ? 'Generating…' : 'Template'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.generateBtnOutline, routineGenerating && { opacity: 0.6 }]}
                disabled={aiGenerating || routineGenerating}
                onPress={isPremium
                  ? handleGenerateRoutine
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
              >
                <Ionicons
                  name={isPremium ? (routineGenerating ? 'hourglass-outline' : 'calendar-outline') : 'lock-closed-outline'}
                  size={16} color={colors.save}
                />
                <Text style={styles.generateBtnOutlineText}>
                  {routineGenerating ? 'Generating…' : 'Routine'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.insightsSectionHeader}>
              <SectionRule label="Insights" style={{ flex: 1, marginBottom: 0 }} />
              {isPremium && (
                <TouchableOpacity onPress={fetchInsights} disabled={insightsLoading} style={styles.refreshBtn}>
                  {insightsLoading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name="refresh-outline" size={18} color={colors.accent} />
                  }
                </TouchableOpacity>
              )}
            </View>

            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {isPremium ? (
                insights.length > 0
                  ? insights.map(renderInsightCard)
                  : (
                    <View style={styles.insightsEmpty}>
                      <Ionicons name="sparkles-outline" size={32} color={colors.textSecondary} />
                      <Text style={styles.insightsEmptyText}>
                        Personalized coaching based on your recent training.
                      </Text>
                      <TouchableOpacity
                        style={[styles.generateInsightsBtn, { backgroundColor: colors.accent }, insightsLoading && { opacity: 0.6 }]}
                        onPress={fetchInsights}
                        disabled={insightsLoading}
                      >
                        {insightsLoading ? (
                          <ActivityIndicator size="small" color={colors.accentText} />
                        ) : (
                          <>
                            <Ionicons name="sparkles" size={16} color={colors.accentText} />
                            <Text style={[styles.generateInsightsBtnText, { color: colors.accentText }]}>
                              Generate Insights
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )
              ) : (
                <>
                  {[0, 1, 2].map(renderLockedInsightPlaceholder)}
                  <TouchableOpacity
                    style={styles.upgradeBanner}
                    onPress={() => (navigation as any).navigate('Paywall', { source: 'ai_coach' })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.upgradeBannerTitle}>Unlock AI Coach</Text>
                      <Text style={styles.upgradeBannerSub}>
                        Personalized insights, deload recommendations, smart generation & more.
                      </Text>
                    </View>
                    <View style={styles.upgradeBannerCTA}>
                      <Text style={styles.upgradeBannerCTAText}>Upgrade</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── PROGRESS TAB ── */}
      {activeTab === 'progress' && (
        <ScrollView contentContainerStyle={styles.content}>
          {(() => {
            const getValue = (b: ProgressBucket) =>
              activeMetric === 'volume' ? b.volume
                : activeMetric === 'sets' ? b.sets
                : activeMetric === 'distance' ? roundTenth(toDisplayDistance(b.distance_km ?? 0, distanceUnit))
                : b.count;
            const hasData = progressData.some(b => getValue(b) > 0);
            const metricLabel = activeMetric === 'volume' ? `Volume (${weightUnit})`
              : activeMetric === 'sets' ? 'Sets'
              : activeMetric === 'distance' ? `Distance (${distanceUnit})`
              : 'Workouts';

            const BAR_GAP = 6;
            const N = progressData.length || 1;
            const availableForBars = Dimensions.get('window').width - 48 - 32 - 35 - 40;
            const barWidth = Math.max(8, Math.floor((availableForBars - (N - 1) * BAR_GAP) / N));
            const maxVal = Math.max(...progressData.map(getValue), 1);

            const formatTopLabel = (val: number) => {
              if (activeMetric === 'volume' && val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
              if (activeMetric === 'distance') return formatDistanceValue(val);
              return String(val);
            };

            // 3M packs 13 weekly bars into the width 30D gives 5, about 12px
            // each, and the library sizes a label to its bar, so "9/22" won't
            // fit. Every other week gets a label, drawn wider and recentred
            // over its bar; the newest week always keeps one.
            const THIN_LABELS = chartRange === '3m';
            const X_LABEL_WIDTH = 36;
            const lastIndex = progressData.length - 1;

            // gifted-charts sizes the top-label container to exactly barWidth,
            // which on the 6m/1y ranges (many narrow bars) is far too narrow
            // for e.g. "12.3K" and forces it to wrap onto a second line —
            // widen the container and recenter it over the bar so it always
            // fits on one line.
            const TOP_LABEL_WIDTH = 50;
            const barData = progressData.map((b, i) => ({
              value: getValue(b),
              label: THIN_LABELS ? undefined : b.label,
              labelComponent: THIN_LABELS
                ? () => (
                    <Text
                      numberOfLines={1}
                      style={[styles.axisLabel, {
                        width: X_LABEL_WIDTH,
                        marginLeft: (barWidth + BAR_GAP - X_LABEL_WIDTH) / 2,
                        textAlign: 'center',
                      }]}
                    >
                      {(lastIndex - i) % 2 === 0 ? b.label : ''}
                    </Text>
                  )
                : undefined,
              frontColor: i === selectedBarIndex ? colors.accent : colors.accent + '99',
              onPress: () => setSelectedBarIndex(prev => prev === i ? null : i),
              topLabelComponent: i === selectedBarIndex
                ? () => (
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 10, fontWeight: '700', color: colors.textPrimary, marginBottom: 2, width: TOP_LABEL_WIDTH, textAlign: 'center' }}
                    >
                      {formatTopLabel(getValue(b))}
                    </Text>
                  )
                : undefined,
              topLabelContainerStyle: { width: TOP_LABEL_WIDTH, left: -(TOP_LABEL_WIDTH - barWidth) / 2 },
            }));

            // Goal line: the weekly goal on weekly bars (30D, 3M), four weeks'
            // worth on monthly bars (6M, 1Y). Distance only has one once the
            // user has set a distance goal.
            const isMonthlyRange = chartRange === '6m' || chartRange === '1y';
            const weeklyTarget = activeMetric === 'workouts' ? weeklyGoal
              : activeMetric === 'distance' && weeklyDistanceGoalKm != null
                ? goalKmToDisplay(weeklyDistanceGoalKm, distanceUnit)
                : null;
            const referenceLinePos = weeklyTarget != null ? roundTenth(isMonthlyRange ? weeklyTarget * 4 : weeklyTarget) : 0;
            const unitSuffix = activeMetric === 'distance' ? ` ${distanceUnit}` : '';
            const referenceLineLabel = weeklyTarget != null
              ? `Goal: ${formatDistanceValue(referenceLinePos)}${unitSuffix}/${isMonthlyRange ? 'mo' : 'wk'}`
              : '';

            const RANGE_SHORT: Record<ChartRange, string> = { '30d': '30D', '3m': '3M', '6m': '6M', '1y': '1Y' };
            const scoreRingColor = strengthRankLabel
              ? (SCORE_RANK_COLORS[strengthRankLabel] ?? colors.accent)
              : colors.border;
            const enduranceColor = enduranceRankLabel
              ? (SCORE_RANK_COLORS[enduranceRankLabel] ?? colors.accent)
              : colors.textSecondary;

            return (
              <>
                {/* Score circle + Weekly goal */}
                <View style={styles.scoreGoalRow}>
                  <TouchableOpacity
                    style={styles.scoreCircleWrap}
                    onPress={() => isPremium
                      ? navigation.navigate('StrengthScore')
                      : (navigation as any).navigate('Paywall', { source: 'strength_score' })
                    }
                  >
                    <View style={[styles.scoreCircle, { borderColor: scoreRingColor }]}>
                      {strengthRankLabel && (
                        // The ring narrows toward the top, so the longest rank
                        // ("Intermediate") shrinks slightly rather than touch it
                        <Text
                          style={[styles.scoreRankLabel, { color: scoreRingColor }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {strengthRankLabel}
                        </Text>
                      )}
                      <Text style={[styles.scoreNum, { color: scoreRingColor }]}>
                        {strengthPercentile != null ? Math.round(strengthPercentile) : '–'}
                      </Text>
                      {/* Two lines: at this size and letter spacing one line would touch the ring */}
                      <Text style={styles.scoreCircleLabel}>{'Strength\nScore'}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.goalSide} onPress={() => setGoalModalVisible(true)}>
                    <Text style={styles.goalSideTitle}>Weekly Goal</Text>
                    <View style={styles.goalCirclesRow}>
                      {Array.from({ length: weeklyGoal }).map((_, i) => {
                        const done = i < Math.min(thisWeekCount, weeklyGoal);
                        return (
                          <View
                            key={i}
                            style={[
                              styles.goalCircle,
                              done
                                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                                : { backgroundColor: 'transparent', borderColor: colors.border },
                            ]}
                          >
                            {done && <Ionicons name="checkmark" size={11} color={colors.accentText} />}
                          </View>
                        );
                      })}
                    </View>
                    {weeklyDistanceGoalKm != null && (() => {
                      const dg = distanceGoalProgress(thisWeekDistanceKm, weeklyDistanceGoalKm, distanceUnit);
                      return (
                        <View
                          style={styles.distanceGoalWrap}
                          accessible
                          accessibilityLabel={`${formatDistanceValue(dg.done)} of ${formatDistanceValue(dg.goal)} ${distanceUnit === 'mi' ? 'miles' : 'kilometers'} this week`}
                        >
                          <View style={styles.distanceGoalTrack}>
                            <View testID="distance-goal-fill" style={[styles.distanceGoalFill, { width: `${dg.fill * 100}%` }]} />
                          </View>
                          <View style={styles.distanceGoalLabelRow}>
                            {dg.complete && <Ionicons name="checkmark-circle" size={12} color={colors.accent} />}
                            <Text style={styles.distanceGoalLabel}>
                              {formatDistanceValue(dg.done)} / {formatDistanceValue(dg.goal)} {distanceUnit}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                    <Text style={styles.goalSideSub}>
                      {Math.min(thisWeekCount, weeklyGoal)}/{weeklyGoal} this week · Tap to edit
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Endurance Score entry point. The mini ring echoes the Strength
                    circle above at a smaller size, so it reads as a sibling
                    rather than competing with it. */}
                <TouchableOpacity
                  style={styles.weeklySummaryCard}
                  onPress={() => isPremium
                    ? navigation.navigate('EnduranceScore')
                    : (navigation as any).navigate('Paywall', { source: 'endurance_score' })
                  }
                >
                  <View style={styles.enduranceRing}>
                    <Svg width={MINI_RING_SIZE} height={MINI_RING_SIZE}>
                      <Circle
                        cx={MINI_RING_SIZE / 2} cy={MINI_RING_SIZE / 2} r={MINI_RING_R}
                        stroke={colors.border} strokeWidth={MINI_RING_STROKE} fill="none"
                      />
                      {endurancePercentile != null && (
                        <Circle
                          cx={MINI_RING_SIZE / 2} cy={MINI_RING_SIZE / 2} r={MINI_RING_R}
                          stroke={enduranceColor} strokeWidth={MINI_RING_STROKE} fill="none"
                          strokeDasharray={`${MINI_RING_CIRCUMFERENCE}`}
                          strokeDashoffset={MINI_RING_CIRCUMFERENCE * (1 - endurancePercentile / 100)}
                          strokeLinecap="round"
                          transform={`rotate(-90 ${MINI_RING_SIZE / 2} ${MINI_RING_SIZE / 2})`}
                        />
                      )}
                    </Svg>
                    <View style={styles.enduranceRingCenter}>
                      {endurancePercentile != null ? (
                        <Text style={[styles.enduranceRingNum, { color: enduranceColor }]}>
                          {Math.round(endurancePercentile)}
                        </Text>
                      ) : (
                        <Ionicons name="walk-outline" size={18} color={colors.textSecondary} />
                      )}
                    </View>
                  </View>
                  <View style={styles.weeklySummaryTextWrap}>
                    <Text style={styles.weeklySummaryText}>Endurance Score</Text>
                  </View>
                  {enduranceRankLabel && (
                    <View style={[styles.enduranceRankPill, { backgroundColor: enduranceColor + '22', borderColor: enduranceColor }]}>
                      <Ionicons name={SCORE_RANK_ICONS[enduranceRankLabel] ?? 'ellipse-outline'} size={11} color={enduranceColor} />
                      <Text style={[styles.enduranceRankText, { color: enduranceColor }]}>{enduranceRankLabel}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Weekly Summary entry point */}
                <TouchableOpacity
                  style={styles.weeklySummaryCard}
                  onPress={() => navigation.navigate('WeeklySummary')}
                >
                  <Ionicons name="calendar-outline" size={20} color={colors.accent} />
                  <View style={styles.weeklySummaryTextWrap}>
                    <Text style={styles.weeklySummaryText}>Weekly Summary</Text>
                    <Text style={styles.weeklySummarySub} numberOfLines={1}>{weeklySummarySubtitle()}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Chart card. Someone who hasn't logged anything gets the card
                    with no tabs or range to pick, since there's nothing to chart. */}
                {hasLoggedNothing(metricsLogged) ? (
                  <View style={styles.chartCard}>
                    <View style={styles.chartEmpty}>
                      <Text style={styles.emptyText}>Start logging to track your progress</Text>
                    </View>
                  </View>
                ) : (
                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <Text style={styles.chartTitle}>{metricLabel}</Text>
                    <TouchableOpacity
                      ref={rangeButtonRef}
                      style={styles.rangeDropdown}
                      onPress={openRangePicker}
                      accessibilityLabel={`Chart range, ${RANGE_SHORT[chartRange]}`}
                    >
                      <Text style={styles.rangeDropdownText}>{RANGE_SHORT[chartRange]}</Text>
                      <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {hasData ? (
                    <BarChart
                      key={`${chartRange}-${activeMetric}`}
                      data={barData}
                      barWidth={barWidth}
                      spacing={BAR_GAP}
                      roundedTop
                      hideRules
                      xAxisLabelTextStyle={styles.axisLabel}
                      yAxisTextStyle={styles.axisLabel}
                      noOfSections={4}
                      maxValue={Math.max(
                        maxVal * 1.2,
                        activeMetric === 'workouts' && weeklyTarget != null ? referenceLinePos + 1
                          : weeklyTarget != null ? referenceLinePos * 1.1
                          : 1,
                      )}
                      height={150}
                      barBorderRadius={3}
                      xAxisThickness={1}
                      xAxisColor={colors.border}
                      yAxisThickness={1}
                      yAxisColor={colors.border}
                      formatYLabel={(v) => {
                        const n = parseFloat(v);
                        if (activeMetric === 'volume' && n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
                        // Axis steps on a short run land on values like 1.25; a
                        // tenth is as fine as the bars themselves go.
                        if (activeMetric === 'distance') return formatDistanceValue(n >= 10 ? Math.round(n) : roundTenth(n));
                        return v;
                      }}
                      isAnimated
                      showReferenceLine1={weeklyTarget != null}
                      referenceLine1Position={referenceLinePos}
                      referenceLine1Config={{
                        color: colors.accent, thickness: 1.5, type: 'dashed',
                        dashWidth: 5, dashGap: 4,
                        labelText: referenceLineLabel,
                        labelTextStyle: styles.axisLabel,
                        zIndex: 2,
                      }}
                    />
                  ) : (
                    <View style={styles.chartEmpty}>
                      <Text style={styles.emptyText}>Nothing logged in this range yet.</Text>
                    </View>
                  )}

                  {/* Metric selector */}
                  <View style={styles.metricBar}>
                    {visibleMetrics.map((m, idx) => (
                      <React.Fragment key={m}>
                        {idx > 0 && <View style={styles.metricDivider} />}
                        <TouchableOpacity
                          style={styles.metricItem}
                          onPress={() => handleMetricChange(m)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.metricText, activeMetric === m && { color: colors.accent, fontWeight: '700' }]}>
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    ))}
                    <Animated.View
                      style={[styles.metricSlider, {
                        width: metricSlideWidth,
                        // multiply, not interpolate: interpolate needs at least
                        // two points and a user can have a single tab.
                        transform: [{ translateX: Animated.multiply(metricAnimRef, metricSlideWidth) }],
                      }]}
                    />
                  </View>
                </View>
                )}

                {renderMuscleVolumeCard()}
              </>
            );
          })()}
        </ScrollView>
      )}

      </Animated.View>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <WeeklyGoalModal
        visible={goalModalVisible}
        weeklyGoal={weeklyGoal}
        onChangeGoal={updateWeeklyGoal}
        distanceGoal={weeklyDistanceGoalKm != null ? goalKmToDisplay(weeklyDistanceGoalKm, distanceUnit) : null}
        distanceUnit={distanceUnit}
        onChangeDistanceGoal={updateWeeklyDistanceGoal}
        onClose={() => setGoalModalVisible(false)}
      />

      <WorkingSetsInfoModal
        visible={workingSetsInfoVisible}
        onClose={() => setWorkingSetsInfoVisible(false)}
        muscleStandards={MUSCLE_STANDARDS}
      />

      <RangePickerModal
        visible={rangePickerVisible}
        chartRange={chartRange}
        anchor={rangeAnchor}
        onSelect={handleRangeChange}
        onClose={() => setRangePickerVisible(false)}
      />

      <RoutinePickerModal
        visible={selectModalVisible}
        routines={routines}
        onSelect={activateRoutine}
        onClose={() => setSelectModalVisible(false)}
      />

      {/* Muscle Picker for blank template creation */}
      <MusclePickerModal
        visible={musclePickerVisible}
        onClose={() => setMusclePickerVisible(false)}
        title="What muscles are you training?"
        subtitle="We'll pre-filter your exercise list."
        muscles={muscleGroups}
        selected={selectedMuscles}
        onToggle={mg => setSelectedMuscles(prev => prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg])}
        buttonLabel={selectedMuscles.length > 0 ? 'Create Template' : 'Create Template (Skip)'}
        onSubmit={handleCreateTemplateWithMuscles}
      />

      {/* AI Muscle Picker for Coach tab generate */}
      <MusclePickerModal
        visible={aiMusclePickerVisible}
        onClose={() => setAiMusclePickerVisible(false)}
        title="Target muscles for this template?"
        subtitle="Pick the muscles you want to train. Your AI coach will build around them."
        muscles={muscleGroups.filter(mg => mg !== 'Other')}
        selected={aiSelectedMuscles}
        onToggle={mg => setAiSelectedMuscles(prev => prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg])}
        buttonLabel={aiSelectedMuscles.length > 0
          ? `Generate Template (${aiSelectedMuscles.length} muscle${aiSelectedMuscles.length > 1 ? 's' : ''})`
          : 'Generate Template'}
        onSubmit={handleGenerateTemplate}
        submitDisabled={aiGenerating}
      />

      {/* Coach Profile Modal */}
      <CoachProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onSave={profile => setCoachProfile(profile)}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabBtnText: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1.2, paddingTop: spacing.sm, marginBottom: 6,
  },
  tabBtnTextActive: { color: colors.accent },
  tabSlider: { position: 'absolute', bottom: 0, left: 0, height: 2, borderRadius: 1, backgroundColor: colors.accent },

  // ── Progress tab ────────────────────────────────────────────────────────────
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  scoreGoalRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, alignItems: 'stretch' },
  scoreCircleWrap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  scoreCircle: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 4,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  scoreNum: { fontSize: typography.fontSize.xxl, fontWeight: '800', lineHeight: 32 },
  scoreCircleLabel: { fontSize: 9, lineHeight: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  scoreRankLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.3, maxWidth: 68, textAlign: 'center' },
  goalSide: {
    flex: 1, backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, justifyContent: 'center',
  },
  goalSideTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  goalCirclesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  goalCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  goalSideSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  distanceGoalWrap: { marginBottom: spacing.sm },
  distanceGoalTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  distanceGoalFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  distanceGoalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  distanceGoalLabel: { fontSize: typography.fontSize.xs, color: colors.textPrimary, fontWeight: '600' },
  enduranceRing: { width: MINI_RING_SIZE, height: MINI_RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  enduranceRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  enduranceRingNum: { fontSize: typography.fontSize.sm, fontWeight: '800' },
  enduranceRankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2,
  },
  enduranceRankText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
  weeklySummaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: spacing.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  weeklySummaryTextWrap: { flex: 1 },
  weeklySummaryText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  weeklySummarySub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  chartTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  rangeDropdown: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  rangeDropdownText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  chartEmpty: { height: 150, justifyContent: 'center', alignItems: 'center' },
  metricBar: {
    flexDirection: 'row', marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: spacing.sm,
    overflow: 'hidden', position: 'relative',
  },
  metricItem: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  metricDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  metricText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  metricSlider: { position: 'absolute', bottom: 0, height: 2, backgroundColor: colors.accent, borderRadius: 1 },
  scoreCardTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  axisLabel: { fontSize: 9, color: colors.textSecondary },

  // Muscle volume card
  mvCard: { backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  mvHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  mvWeekRange: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  mvTotalText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  mvColLabels: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  mvColLabel: { fontSize: 9, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  mvRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: spacing.xs },
  mvMuscle: { width: 80, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  mvBarArea: { flex: 1 },
  mvFreeTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  mvFreeFill: { height: '100%', borderRadius: 3 },
  mvPremiumTrack: { height: 7, backgroundColor: colors.border, borderRadius: 3, overflow: 'visible', position: 'relative' },
  mvPremiumFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  mvTick: { position: 'absolute', top: -2, bottom: -2, width: 1.5, backgroundColor: colors.background },
  mvCount: { width: 30, fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  mvZoneLabel: { width: 78, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  mvLastTrained: { width: 78, fontSize: 10, color: colors.textSecondary, textAlign: 'right' },
  mvDivider: { paddingVertical: spacing.xs, marginVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  mvDividerText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  mvPremiumTeaser: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },

  // ── Training tab ────────────────────────────────────────────────────────────
  trainingScroll: { flex: 1, paddingHorizontal: spacing.md },
  activeBlock: { backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.accent },
  // Same label treatment as SectionRule, minus the hairlines and centering.
  activeRoutineLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  // No marginBottom: this row is the card's last element now that the day list
  // navigates to RoutineDetail instead of expanding inline.
  activeRoutineNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeRoutineName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  toggleDaysBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: spacing.sm },
  toggleDaysBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  newTemplateBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  newTemplateBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
  card: { backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  routineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  routineCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, width: '48%', minHeight: 72,
    justifyContent: 'space-between',
  },
  routineCardName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },
  routineCardSub: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  logInlineBtn: { backgroundColor: colors.save, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  logInlineBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  showAllBtnText: { fontWeight: '600', fontSize: typography.fontSize.sm },
  muscleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 5 },
  templateMuscleChip: { backgroundColor: colors.accent + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  templateMuscleChipText: { fontSize: typography.fontSize.xs, color: colors.accent, fontWeight: '600' },

  // ── Coach tab ───────────────────────────────────────────────────────────────
  coachContent: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coachHero: {
    backgroundColor: colors.surface, borderRadius: spacing.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.xs,
  },
  coachHeroTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999,
    paddingLeft: 3, paddingRight: spacing.sm, paddingVertical: 3,
  },
  rankPillIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  rankPillIconText: { fontSize: typography.fontSize.xs, fontWeight: '800', color: '#fff' },
  rankPillText: { fontSize: typography.fontSize.sm, fontWeight: '800', letterSpacing: 0.3 },
  coachSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coachSummaryLabel: {
    width: 44, fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    color: colors.textSecondary, textTransform: 'uppercase',
  },
  coachSummaryValue: {
    flex: 1, fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textPrimary,
  },
  coachAvoidIcon: { width: 44, textAlign: 'center' },
  aiCoachCard: { marginBottom: spacing.md, gap: spacing.sm },
  generateBtnRow: { flexDirection: 'row', gap: spacing.sm },
  generateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.save, borderRadius: spacing.sm, paddingVertical: 12 },
  generateBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
  generateBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.save, borderRadius: spacing.sm, paddingVertical: 12 },
  generateBtnOutlineText: { color: colors.save, fontWeight: '700', fontSize: typography.fontSize.sm },
  insightsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  refreshBtn: { padding: spacing.xs },
  insightCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: colors.border, borderRightColor: colors.border, borderBottomColor: colors.border,
  },
  insightCardLocked: { opacity: 0.45 },
  insightIconWrap: { width: 32, alignItems: 'center', paddingTop: 2 },
  insightTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  insightBody: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  insightPlaceholderLine: { height: 10, backgroundColor: colors.border, borderRadius: 5 },
  insightsEmpty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  insightsEmptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 240 },
  generateInsightsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, borderRadius: 20, minWidth: 180,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.xs,
  },
  generateInsightsBtnText: { fontSize: typography.fontSize.md, fontWeight: '700' },
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.accent + '15', borderRadius: spacing.sm,
    borderWidth: 1, borderColor: colors.accent + '40',
    padding: spacing.md, marginTop: spacing.xs,
  },
  upgradeBannerTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  upgradeBannerSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  upgradeBannerCTA: { backgroundColor: colors.accent, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  upgradeBannerCTAText: { color: colors.accentText, fontSize: typography.fontSize.sm, fontWeight: '700' },
});
