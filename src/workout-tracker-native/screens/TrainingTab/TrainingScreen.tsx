import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, FlatList, Modal, Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { usePurchase } from '../../context/PurchaseContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { WeightUnit } from '../../utils/units';
import { apiFetch } from '../../utils/api';
import { appCache } from '../../utils/appCache';
import { TrainingStackParamsList } from '../../navigation/types';
import { muscleGroups } from '../../constants/muscleGroups';
import { SCORE_RANK_COLORS } from '../../constants/strengthRanks';
import { radius } from '../../theme/spacing';


type Props = NativeStackScreenProps<TrainingStackParamsList, 'TrainingHome'>;

type ProgressBucket = { label: string; volume: number; sets: number; count: number };
type ChartRange = '30d' | '6m' | '1y';
type ChartMetric = 'volume' | 'sets' | 'workouts';
type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; exercise_type?: string };
type MuscleVolumeData = {
  muscle_sets: Record<string, number>;
  last_trained: Record<string, string>;
  total_sets: number;
  last_week_total: number;
  week_start: string;
};

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
type WorkoutTemplate = { id: number; name: string; exercises: Exercise[] };
type RoutineDay = {
  id: number; day_order: number; label: string;
  workout_template: { id: number; name: string; exercises: Exercise[] };
};
type Routine = { id: number; name: string; description?: string; day_count: number };
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };

export default function TrainingScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const { isPremium } = usePurchase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<'progress' | 'training'>('progress');
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';

  const METRICS: ChartMetric[] = ['volume', 'sets', 'workouts'];
  const metricAnimRef = useRef(new Animated.Value(0)).current;
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const METRIC_SLIDE_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2) / 3;

  const handleMetricChange = (m: ChartMetric) => {
    const idx = METRICS.indexOf(m);
    Animated.timing(metricAnimRef, { toValue: idx, duration: 200, useNativeDriver: true }).start();
    setChartMetric(m);
    setSelectedBarIndex(null);
  };

  // Progress tab state
  const [progressData, setProgressData] = useState<ProgressBucket[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('volume');
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [strengthPercentile, setStrengthPercentile] = useState<number | null>(null);
  const [strengthRankLabel, setStrengthRankLabel] = useState<string | null>(null);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeData | null>(null);
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // Training tab state
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [daysVisible, setDaysVisible] = useState(false);
  const [coachDays, setCoachDays] = useState(3);
  const [coachGoal, setCoachGoal] = useState<'hypertrophy' | 'strength' | 'endurance' | 'general'>('general');
  const [coachExp, setCoachExp] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [coachEquipment, setCoachEquipment] = useState('full_gym');
  const [coachSessionLength, setCoachSessionLength] = useState('60');
  const [coachAvoid, setCoachAvoid] = useState('none');
  const [coachGenerating, setCoachGenerating] = useState(false);
  const [musclePickerVisible, setMusclePickerVisible] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(`coach_settings_${user?.id}`).then(raw => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        if (s.days) setCoachDays(s.days);
        if (s.goal) setCoachGoal(s.goal);
        if (s.exp) setCoachExp(s.exp);
        if (s.equipment) setCoachEquipment(s.equipment);
        if (s.sessionLength) setCoachSessionLength(s.sessionLength);
        if (s.avoid) setCoachAvoid(s.avoid);
      } catch { }
    });
    AsyncStorage.getItem(`workout_weekly_goal_${user?.id}`).then(raw => {
      if (raw) setWeeklyGoal(parseInt(raw, 10) || 3);
    });
  }, []);

  const updateWeeklyGoal = (delta: number) => {
    const next = Math.max(1, Math.min(7, weeklyGoal + delta));
    setWeeklyGoal(next);
    AsyncStorage.setItem(`workout_weekly_goal_${user?.id}`, String(next));
  };

  const saveCoachSettings = (days: number, goal: typeof coachGoal, exp: typeof coachExp) => {
    AsyncStorage.setItem(`coach_settings_${user?.id}`, JSON.stringify({
      days, goal, exp,
      equipment: coachEquipment, sessionLength: coachSessionLength, avoid: coachAvoid,
    }));
  };

  const fetchProgressData = async (range: ChartRange) => {
    try {
      const res = await apiFetch(`/api/stats/progress?range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setProgressData(data.buckets ?? []);
      }
    } catch { }
  };

  const handleRangeChange = (newRange: ChartRange) => {
    setProgressData([]);
    setSelectedBarIndex(null);
    setChartRange(newRange);
  };

  // Populate from preload cache instantly on mount
  useEffect(() => {
    const tmpl = appCache.get<WorkoutTemplate[]>('templates');
    const rout = appCache.get<Routine[]>('routines');
    const prog = appCache.get<{ buckets: ProgressBucket[] }>('progress');
    const score = appCache.get<any>('strength_score');
    const me = appCache.get<any>('me');
    if (tmpl) setTemplates(tmpl);
    if (rout) setRoutines(rout);
    if (prog) setProgressData(prog.buckets ?? []);
    if (score?.overall != null) setStrengthPercentile(score.overall);
    if (score?.overall_rank?.label) setStrengthRankLabel(score.overall_rank.label);
    if (me?.active_routine_id) fetchActiveRoutine(me.active_routine_id);
    const mv = appCache.get<MuscleVolumeData>('muscle_volume');
    if (mv) setMuscleVolume(mv);
    // Seed thisWeekCount from cached 30d progress if available
    const prog30 = appCache.get<{ buckets: ProgressBucket[] }>('progress');
    if (prog30?.buckets?.length) setThisWeekCount(prog30.buckets[prog30.buckets.length - 1]?.count ?? 0);
  }, []);

  useEffect(() => { fetchProgressData(chartRange); }, [chartRange]);

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (res.ok) setTemplates(await res.json());
    } catch { }
  };

  const fetchRoutines = async () => {
    try {
      const res = await apiFetch('/api/routines');
      if (!res.ok) return;
      setRoutines(await res.json());
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

  const fetchThisWeekCount = async () => {
    try {
      // Use the 30d progress endpoint — its last bucket is always the current week
      const res = await apiFetch('/api/stats/progress?range=30d');
      if (res.ok) {
        const data = await res.json();
        const buckets: ProgressBucket[] = data.buckets ?? [];
        setThisWeekCount(buckets[buckets.length - 1]?.count ?? 0);
      }
    } catch { }
  };

  const fetchMuscleGroupData = async () => {
    try {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const res = await apiFetch(`/api/stats/muscle-volume?local_date=${localDate}`);
      if (res.ok) {
        const data = await res.json();
        setMuscleVolume(data);
        appCache.set('muscle_volume', data);
      }
    } catch { }
  };

  useFocusEffect(useCallback(() => {
    fetchProgressData(chartRange);
    fetchTemplates();
    fetchRoutines();
    fetchActiveRoutine();
    fetchStrengthScore();
    fetchMuscleGroupData();
    fetchThisWeekCount();
  }, [user?.active_routine_id, chartRange]));

  const handleGenerate = async (type: 'routine' | 'template') => {
    setCoachGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachDays, goal: coachGoal, experience: coachExp,
          equipment: coachEquipment, session_length_min: parseInt(coachSessionLength, 10), avoid: coachAvoid,
          generate_type: type,
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message || 'Generation failed'); return; }
      navigation.navigate('AIWorkoutPreview', {
        generateType: data.type,
        name: data.name,
        description: data.description,
        exercises: data.exercises,
        days: data.days,
        coachDays,
        coachGoal,
        coachExp,
        coachEquipment,
        coachSessionLength,
        coachAvoid,
      });
    } catch {
      Alert.alert('Error', 'Could not reach AI service');
    } finally {
      setCoachGenerating(false);
    }
  };

  const activateRoutine = async (routineId: number) => {
    try {
      const res = await apiFetch(`/api/routines/${routineId}/activate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        updateUser({ active_routine_id: data.active_routine_id });
        setSelectModalVisible(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to set active routine');
    }
  };

  const createTemplate = () => {
    setSelectedMuscles([]);
    setMusclePickerVisible(true);
  };

  const handleCreateTemplateWithMuscles = async () => {
    setMusclePickerVisible(false);
    try {
      const res = await apiFetch('/api/workout-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Template' }),
      });
      if (res.ok) {
        const data = await res.json();
        navigation.navigate('TemplateDetail', {
          templateId: data.id,
          muscleGroups: selectedMuscles.length > 0 ? selectedMuscles : undefined,
        });
      } else {
        Alert.alert('Error', 'Failed to create template');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const handleActiveBlockPress = () => {
    if (routines.length === 0) navigation.navigate('CreateRoutine');
    else setSelectModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Tab Row */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'progress' && styles.tabBtnActive]}
          onPress={() => setActiveTab('progress')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'progress' && styles.tabBtnTextActive]}>Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'training' && styles.tabBtnActive]}
          onPress={() => setActiveTab('training')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'training' && styles.tabBtnTextActive]}>Training</Text>
        </TouchableOpacity>
      </View>

      {/* ── PROGRESS TAB ── */}
      {activeTab === 'progress' && (
        <ScrollView contentContainerStyle={styles.content}>
          {(() => {
            const hasData = progressData.some(b =>
              chartMetric === 'volume' ? b.volume > 0
              : chartMetric === 'sets' ? b.sets > 0
              : b.count > 0
            );

            const getValue = (b: ProgressBucket) =>
              chartMetric === 'volume' ? b.volume
              : chartMetric === 'sets' ? b.sets
              : b.count;

            const metricLabel = chartMetric === 'volume'
              ? `Volume (${weightUnit})` : chartMetric === 'sets' ? 'Sets' : 'Workouts';

            const BAR_GAP = 6;
            const N = progressData.length || 1;
            // screenWidth minus content padding (2×24) minus card padding (2×16) minus y-axis (35) minus initial+end spacing (2×20)
            const availableForBars = Dimensions.get('window').width - 48 - 32 - 35 - 40;
            const barWidth = Math.max(8, Math.floor((availableForBars - (N - 1) * BAR_GAP) / N));
            const chartSpacing = BAR_GAP;

            const maxVal = Math.max(...progressData.map(getValue), 1);

            const formatTopLabel = (val: number) => {
              if (chartMetric === 'volume' && val >= 1000)
                return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
              return String(val);
            };

            const barData = progressData.map((b, i) => ({
              value: getValue(b),
              label: b.label,
              frontColor: i === selectedBarIndex ? colors.accent : colors.accent + '99',
              onPress: () => setSelectedBarIndex(prev => prev === i ? null : i),
              topLabelComponent: i === selectedBarIndex
                ? () => (
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>
                      {formatTopLabel(getValue(b))}
                    </Text>
                  )
                : undefined,
            }));

            const isMonthlyRange = chartRange === '6m' || chartRange === '1y';
            const referenceLinePos = isMonthlyRange ? weeklyGoal * 4 : weeklyGoal;
            const referenceLineLabel = chartMetric === 'workouts'
              ? (isMonthlyRange ? `Goal: ${weeklyGoal * 4}/mo` : `Goal: ${weeklyGoal}/wk`)
              : '';

            const RANGE_SHORT: Record<ChartRange, string> = { '30d': '30D', '6m': '6M', '1y': '1Y' };

            const scoreRingColor = strengthRankLabel
              ? (SCORE_RANK_COLORS[strengthRankLabel] ?? colors.accent)
              : colors.border;

            return (
              <>
              {/* ── Score circle + Weekly goal row ── */}
              <View style={styles.scoreGoalRow}>
                <TouchableOpacity
                  style={styles.scoreCircleWrap}
                  onPress={() => isPremium
                    ? navigation.navigate('StrengthScore')
                    : (navigation as any).navigate('Paywall', { source: 'strength_score' })
                  }
                >
                  <View style={[styles.scoreCircle, { borderColor: scoreRingColor }]}>
                    <Text style={[styles.scoreNum, { color: scoreRingColor }]}>
                      {strengthPercentile != null ? Math.round(strengthPercentile) : '–'}
                    </Text>
                    <Text style={styles.scoreCircleLabel}>SCORE</Text>
                  </View>
                  {strengthRankLabel && (
                    <Text style={[styles.scoreRankLabel, { color: scoreRingColor }]}>{strengthRankLabel}</Text>
                  )}
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
                  <Text style={styles.goalSideSub}>
                    {Math.min(thisWeekCount, weeklyGoal)}/{weeklyGoal} this week · Tap to edit
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.chartCard}>
                {/* Header row: title + range dropdown */}
                <View style={styles.chartHeader}>
                  <Text style={styles.chartTitle}>{metricLabel}</Text>
                  <TouchableOpacity style={styles.rangeDropdown} onPress={() => setRangePickerVisible(true)}>
                    <Text style={styles.rangeDropdownText}>{RANGE_SHORT[chartRange]}</Text>
                    <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Chart */}
                {hasData ? (
                  <BarChart
                    key={`${chartRange}-${chartMetric}`}
                    data={barData}
                    barWidth={barWidth}
                    spacing={chartSpacing}
                    roundedTop
                    hideRules
                    xAxisLabelTextStyle={styles.axisLabel}
                    yAxisTextStyle={styles.axisLabel}
                    noOfSections={4}
                    maxValue={Math.max(maxVal * 1.2, chartMetric === 'workouts' ? referenceLinePos + 1 : 1)}
                    height={150}
                    barBorderRadius={3}
                    xAxisThickness={1}
                    xAxisColor={colors.border}
                    yAxisThickness={1}
                    yAxisColor={colors.border}
                    formatYLabel={(v) => {
                      const n = parseFloat(v);
                      if (chartMetric === 'volume' && n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
                      return v;
                    }}
                    isAnimated
                    showReferenceLine1={chartMetric === 'workouts'}
                    referenceLine1Position={referenceLinePos}
                    referenceLine1Config={{
                      color: colors.accent,
                      thickness: 1.5,
                      type: 'dashed',
                      dashWidth: 5,
                      dashGap: 4,
                      labelText: referenceLineLabel,
                      labelTextStyle: styles.axisLabel,
                      zIndex: 2,
                    }}
                  />
                ) : (
                  <View style={styles.chartEmpty}>
                    <Text style={styles.emptyText}>No data — log some workouts first</Text>
                  </View>
                )}

                {/* Metric selector below chart */}
                <View style={styles.metricBar}>
                  {METRICS.map((m, idx) => (
                    <React.Fragment key={m}>
                      {idx > 0 && <View style={styles.metricDivider} />}
                      <TouchableOpacity
                        style={styles.metricItem}
                        onPress={() => handleMetricChange(m)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.metricText, chartMetric === m && { color: colors.accent, fontWeight: '700' }]}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                  <Animated.View
                    style={[styles.metricSlider, {
                      width: METRIC_SLIDE_WIDTH,
                      transform: [{ translateX: metricAnimRef.interpolate({
                        inputRange: [0, 1, 2],
                        outputRange: [0, METRIC_SLIDE_WIDTH, METRIC_SLIDE_WIDTH * 2],
                      }) }],
                    }]}
                  />
                </View>

              </View>

            {/* ── Muscle Volume Card ── */}
            {muscleVolume && (() => {
              const allMuscles = Object.keys(MUSCLE_STANDARDS);
              const trained   = allMuscles.filter(m => (muscleVolume.muscle_sets[m] ?? 0) > 0)
                .sort((a, b) => (muscleVolume.muscle_sets[b] ?? 0) - (muscleVolume.muscle_sets[a] ?? 0));
              const untrained = allMuscles.filter(m => !(muscleVolume.muscle_sets[m] ?? 0));
              const maxSets   = Math.max(1, ...trained.map(m => muscleVolume.muscle_sets[m] ?? 0));

              const renderRow = (muscle: string) => {
                const sets = muscleVolume.muscle_sets[muscle] ?? 0;
                const std  = MUSCLE_STANDARDS[muscle];
                const lastDate = muscleVolume.last_trained[muscle];
                const isTrained = sets > 0;

                // Free: simple proportional bar
                // Premium: zone bar with MEV/MAV markers
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
                    <Text style={[styles.mvCount, !isTrained && { color: colors.textSecondary }]}>
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
                  {/* Header */}
                  <View style={styles.mvHeader}>
                    <View>
                      <Text style={styles.scoreCardTitle}>This Week</Text>
                      <Text style={styles.mvWeekRange}>{weekRangeLabel(muscleVolume.week_start)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={styles.mvTotalText}>{muscleVolume.total_sets} working sets</Text>
                      <TouchableOpacity onPress={() => Alert.alert(
                        'Working Sets',
                        'Counts sets taken close to failure (warmups excluded). MEV = minimum sets for growth, MAV = optimal range, MRV = maximum before recovery suffers.'
                      )}>
                        <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Column labels (premium only) */}
                  {isPremium && (
                    <View style={styles.mvColLabels}>
                      <View style={{ width: 88 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mvColLabel}>MEV → MAV → MRV</Text>
                      </View>
                    </View>
                  )}

                  {trained.map(renderRow)}

                  {untrained.length > 0 && (
                    <>
                      <View style={styles.mvDivider}>
                        <Text style={styles.mvDividerText}>Not trained this week</Text>
                      </View>
                      {untrained.map(renderRow)}
                    </>
                  )}

                  {/* Premium teaser for free users */}
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
            })()}
            </>
            );
          })()}
        </ScrollView>
      )}

      {/* ── TRAINING TAB ── */}
      {activeTab === 'training' && (
        <ScrollView style={styles.trainingScroll} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {/* Active Routine */}
          <TouchableOpacity
            style={styles.activeBlock}
            onPress={!activeRoutine ? handleActiveBlockPress : undefined}
            activeOpacity={activeRoutine ? 1 : 0.7}
          >
            <Text style={styles.sectionLabel}>Active Routine</Text>
            {activeRoutine ? (
              <>
                <View style={styles.activeRoutineNameRow}>
                  <Text style={styles.activeRoutineName}>{activeRoutine.name}</Text>
                  <TouchableOpacity style={styles.toggleDaysBtn} onPress={() => setDaysVisible(v => !v)}>
                    <Text style={[styles.toggleDaysBtnText, { color: colors.accent }]}>
                      {daysVisible ? 'Hide' : 'Show'}
                    </Text>
                    <Ionicons name={daysVisible ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
                  </TouchableOpacity>
                </View>
                {daysVisible && activeRoutine.days.map(day => (
                  <View key={day.id} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <TouchableOpacity
                      style={styles.logDayBtn}
                      onPress={() => navigation.navigate('LogRoutine', {
                        prefill: {
                          name: day.label, notes: '',
                          exercises: day.workout_template.exercises.map(ex => ({
                            name: ex.name,
                            exercise_template_id: ex.id,
                            exercise_type: ex.exercise_type ?? 'strength',
                            muscle_group: ex.muscle_group,
                            equipment: ex.equipment,
                            sets: [{ reps: '', weight: '' }],
                          })),
                        },
                      })}
                    >
                      <Text style={styles.logDayBtnText}>Log</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.noRoutineText}>
                {routines.length === 0 ? 'No routines yet — tap to create one' : 'No active routine — tap to select one'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Templates */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.trainingSectionHeader, { marginBottom: 0 }]}>Templates</Text>
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
            <Text style={styles.emptyText}>No templates yet</Text>
          ) : (
            templates.map(t => (
              <TouchableOpacity
                key={t.id}
                style={styles.card}
                onPress={() => navigation.navigate('TemplateDetail', { templateId: t.id })}
              >
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{t.name}</Text>
                    <Text style={styles.cardSub}>{t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.logInlineBtn}
                    onPress={() => navigation.navigate('LogRoutine', {
                      prefill: {
                        name: t.name, notes: '',
                        exercises: t.exercises.map(ex => ({
                          name: ex.name,
                          exercise_template_id: ex.id,
                          exercise_type: ex.exercise_type ?? 'strength',
                          muscle_group: ex.muscle_group,
                          equipment: ex.equipment,
                          sets: [{ reps: '', weight: '' }],
                        })),
                      },
                    })}
                  >
                    <Text style={styles.logInlineBtnText}>Log</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Routines */}
          <View style={[styles.sectionHeaderRow, { marginTop: spacing.md }]}>
            <Text style={[styles.trainingSectionHeader, { marginBottom: 0 }]}>Routines</Text>
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
            routines.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id, routineName: item.name })}
              >
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
                {item.description ? <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text> : null}
              </TouchableOpacity>
            ))
          )}

          {/* AI Coach */}
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <Ionicons name="sparkles" size={16} color={colors.save} />
              <Text style={styles.coachTitle}>AI Coach</Text>
            </View>
            <Text style={styles.coachDesc}>Set your preferences and generate a personalised routine or template.</Text>

            <Text style={styles.coachLabel}>Days per week</Text>
            <View style={styles.coachChipRow}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.coachChip, coachDays === d && styles.coachChipActive]}
                  onPress={() => { setCoachDays(d); saveCoachSettings(d, coachGoal, coachExp); }}
                >
                  <Text style={[styles.coachChipText, coachDays === d && styles.coachChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.coachLabel}>Training goal</Text>
            <View style={styles.coachChipRow}>
              {(['hypertrophy', 'strength', 'endurance', 'general'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.coachChip, coachGoal === g && styles.coachChipActive]}
                  onPress={() => { setCoachGoal(g); saveCoachSettings(coachDays, g, coachExp); }}
                >
                  <Text style={[styles.coachChipText, coachGoal === g && styles.coachChipTextActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.coachLabel}>Experience level</Text>
            <View style={styles.coachChipRow}>
              {(['beginner', 'intermediate', 'advanced'] as const).map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.coachChip, coachExp === e && styles.coachChipActive]}
                  onPress={() => { setCoachExp(e); saveCoachSettings(coachDays, coachGoal, e); }}
                >
                  <Text style={[styles.coachChipText, coachExp === e && styles.coachChipTextActive]}>
                    {e.charAt(0).toUpperCase() + e.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.coachBtnRow}>
              <TouchableOpacity
                style={[styles.coachGenBtn, coachGenerating && { opacity: 0.6 }]}
                onPress={isPremium
                  ? () => handleGenerate('routine')
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
                disabled={coachGenerating}
              >
                <Ionicons name={isPremium ? 'calendar-outline' : 'lock-closed-outline'} size={14} color={colors.accentText} />
                <Text style={styles.coachGenBtnText}>{coachGenerating ? 'Generating…' : 'Generate Routine'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.coachGenBtnOutline, coachGenerating && { opacity: 0.6 }]}
                onPress={isPremium
                  ? () => handleGenerate('template')
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
                disabled={coachGenerating}
              >
                <Ionicons name={isPremium ? 'list-outline' : 'lock-closed-outline'} size={14} color={colors.save} />
                <Text style={styles.coachGenBtnOutlineText}>{coachGenerating ? 'Generating…' : 'Generate Template'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Weekly Goal Modal */}
      <Modal visible={goalModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGoalModalVisible(false)}>
          <View style={styles.goalModalBox}>
            <Text style={styles.goalModalTitle}>Weekly Workout Goal</Text>
            <Text style={styles.goalModalDesc}>
              Set how many workouts you want to complete each week. Consecutive weeks that meet your goal count toward your streak.
            </Text>
            <View style={styles.goalModalControls}>
              <TouchableOpacity style={styles.goalModalBtn} onPress={() => updateWeeklyGoal(-1)}>
                <Text style={styles.goalModalBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.goalModalValue}>{weeklyGoal}</Text>
              <TouchableOpacity style={styles.goalModalBtn} onPress={() => updateWeeklyGoal(1)}>
                <Text style={styles.goalModalBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.goalModalDone} onPress={() => setGoalModalVisible(false)}>
              <Text style={styles.goalModalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Range Picker Modal */}
      <Modal visible={rangePickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRangePickerVisible(false)}>
          <View style={styles.rangePickerBox}>
            {(['30d', '6m', '1y'] as ChartRange[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.rangePickerItem, chartRange === r && styles.rangePickerItemActive]}
                onPress={() => { handleRangeChange(r); setRangePickerVisible(false); }}
              >
                <Text style={[styles.rangePickerItemText, chartRange === r && styles.rangePickerItemTextActive]}>
                  {r === '30d' ? 'Last 30 Days' : r === '6m' ? 'Last 6 Months' : 'Last Year'}
                </Text>
                {chartRange === r && <Ionicons name="checkmark" size={16} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Muscle Picker Modal — shown before creating a new template */}
      <Modal visible={musclePickerVisible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMusclePickerVisible(false)}
        >
          <View style={[styles.musclePickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.musclePickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.musclePickerTitle, { color: colors.textPrimary }]}>
              What muscles are you training?
            </Text>
            <Text style={[styles.musclePickerSub, { color: colors.textSecondary }]}>
              Select any that apply — we'll pre-filter your exercise list.
            </Text>
            <View style={styles.muscleChips}>
              {muscleGroups.map(mg => {
                const on = selectedMuscles.includes(mg);
                return (
                  <TouchableOpacity
                    key={mg}
                    style={[
                      styles.muscleChip,
                      { borderColor: on ? colors.accent : colors.border,
                        backgroundColor: on ? colors.accent + '22' : colors.background },
                    ]}
                    onPress={() =>
                      setSelectedMuscles(prev =>
                        on ? prev.filter(m => m !== mg) : [...prev, mg]
                      )
                    }
                  >
                    <Text style={[styles.muscleChipText, { color: on ? colors.accent : colors.textSecondary }]}>
                      {mg}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.musclePickerBtn, { backgroundColor: colors.save }]}
              onPress={handleCreateTemplateWithMuscles}
            >
              <Text style={styles.musclePickerBtnText}>
                {selectedMuscles.length > 0 ? 'Create Template' : 'Create Template (Skip)'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Routine Picker Modal */}
      <Modal visible={selectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Active Routine</Text>
            <FlatList
              data={routines}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => activateRoutine(item.id)}>
                  <Text style={styles.modalItemName}>{item.name}</Text>
                  <Text style={styles.modalItemSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setSelectModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  tabRow: {
    flexDirection: 'row',
    margin: spacing.md,
    marginTop: spacing.lg,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: colors.accent },
  tabBtnText: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textSecondary },
  tabBtnTextActive: { color: colors.accentText },

  // Progress tab
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  sectionLabel: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryBox: {
    flex: 1, backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  summaryValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  summaryLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  chartTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  rangeDropdown: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  rangeDropdownText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  rangePickerBox: { position: 'absolute', top: 120, right: 16, backgroundColor: colors.surface, borderRadius: spacing.sm, borderWidth: 1, borderColor: colors.border, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  rangePickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  rangePickerItemActive: { backgroundColor: colors.accent + '18' },
  rangePickerItemText: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  rangePickerItemTextActive: { color: colors.accent, fontWeight: '600' },
  chartEmpty: { height: 150, justifyContent: 'center', alignItems: 'center' },
  metricBar: {
    flexDirection: 'row', marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: spacing.sm,
    overflow: 'hidden', position: 'relative',
  },
  metricItem: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  metricDivider: { width: 1, backgroundColor: colors.border, marginVertical: 8 },
  metricText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  metricSlider: {
    position: 'absolute', bottom: 0, height: 2,
    backgroundColor: colors.accent, borderRadius: 1,
  },
  // Score circle + goal row
  scoreGoalRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, alignItems: 'stretch' },
  scoreCircleWrap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  scoreCircle: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 3,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreNum: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  scoreCircleLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  scoreRankLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.3 },
  goalSide: {
    flex: 1,
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center',
  },
  goalSideTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  goalCirclesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  goalCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalSideSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  // kept for muscle volume card header
  scoreCardTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  goalModalBox: { backgroundColor: colors.surface, borderTopLeftRadius: spacing.lg, borderTopRightRadius: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  goalModalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  goalModalDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.xl },
  goalModalControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.xl },
  goalModalBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  goalModalBtnText: { fontSize: 24, color: colors.accent, fontWeight: '600', lineHeight: 28 },
  goalModalValue: { fontSize: 48, fontWeight: '700', color: colors.textPrimary, minWidth: 60, textAlign: 'center' },
  goalModalDone: { backgroundColor: colors.accent, borderRadius: spacing.sm, padding: spacing.md, alignItems: 'center' },
  goalModalDoneText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
  axisLabel: { fontSize: 9, color: colors.textSecondary },

  // Muscle volume card
  mvCard: { backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  mvHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  mvWeekRange: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  mvTotalText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  mvColLabels: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  mvColLabel: { fontSize: 9, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  mvRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: spacing.xs },
  mvMuscle: { width: 80, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  mvBarArea: { flex: 1 },
  mvFreeTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  mvFreeFill: { height: '100%', borderRadius: 3 },
  mvPremiumTrack: { height: 7, backgroundColor: colors.border, borderRadius: 3, overflow: 'visible', position: 'relative' },
  mvPremiumFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  mvTick: { position: 'absolute', top: -2, bottom: -2, width: 1.5, backgroundColor: colors.background },
  mvCount: { width: 22, fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  mvZoneLabel: { width: 78, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  mvLastTrained: { width: 78, fontSize: 10, color: colors.textSecondary, textAlign: 'right' },
  mvDivider: { paddingVertical: spacing.xs, marginVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  mvDividerText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  mvPremiumTeaser: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  barTopLabel: { fontSize: 9, color: colors.textSecondary, marginBottom: 2 },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },

  // Training tab
  trainingScroll: { flex: 1, paddingHorizontal: spacing.md },
  activeBlock: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  activeRoutineNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  activeRoutineName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  toggleDaysBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: spacing.sm },
  toggleDaysBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  dayRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border,
  },
  dayLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  logDayBtn: { backgroundColor: colors.save, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  logDayBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  newTemplateBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  newTemplateBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
  trainingSectionHeader: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },

  card: { backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cardDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  logInlineBtn: { backgroundColor: colors.save, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  logInlineBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },


  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.surface, borderTopLeftRadius: spacing.md,
    borderTopRightRadius: spacing.md, padding: spacing.lg, maxHeight: '60%',
  },
  modalTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' },
  modalItem: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalItemName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  modalItemSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalCancel: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  modalCancelText: { fontSize: typography.fontSize.md, color: colors.danger, fontWeight: '600' },

  coachCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  coachTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  coachDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  coachLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.xs },
  coachChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  coachChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: spacing.xs, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  coachChipActive: { backgroundColor: colors.save, borderColor: colors.save },
  coachChipText: { fontSize: typography.fontSize.sm, fontWeight: '500', color: colors.textSecondary },
  coachChipTextActive: { color: colors.accentText, fontWeight: '700' },
  coachBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  coachGenBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.save, borderRadius: spacing.sm, paddingVertical: spacing.sm },
  coachGenBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
  coachGenBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: colors.save, borderRadius: spacing.sm, paddingVertical: spacing.sm },
  coachGenBtnOutlineText: { color: colors.save, fontWeight: '700', fontSize: typography.fontSize.sm },

  // Muscle picker modal
  musclePickerSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, paddingBottom: spacing.xl,
  },
  musclePickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  musclePickerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', marginBottom: spacing.xs },
  musclePickerSub: { fontSize: typography.fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  muscleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  muscleChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1,
  },
  muscleChipText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  musclePickerBtn: {
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center',
  },
  musclePickerBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.md },
});
