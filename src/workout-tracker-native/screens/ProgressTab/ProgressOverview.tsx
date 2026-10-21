import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Animated, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { usePurchase } from '../../context/PurchaseContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { WeightUnit, GPS_DISTANCE_UNIT_KEY, roundTenth, toDisplayDistance } from '../../utils/units';
import { toLocalDateStr, trainedDaysOfWeek } from '../../utils/date';
import { monthlyScoreChange, type ScoreSnapshot } from '../../utils/scoreTrend';
import { WEEKLY_DISTANCE_GOAL_KEY, WEEKLY_GOAL_KEY } from '../../constants/storageKeys';
import { apiFetch } from '../../utils/api';
import { appCache, useRefetchGate } from '../../utils/appCache';
import { ProgressStackParamsList } from '../../navigation/types';
import WeeklyGoalModal from '../../components/coach/WeeklyGoalModal';
import WorkingSetsInfoModal from '../../components/coach/WorkingSetsInfoModal';
import {
  CHART_RANGES, hasLoggedNothing, visibleChartMetrics, type ChartMetric, type ChartRange, type MetricsLogged,
} from '../../utils/progressMetrics';
import { chartHeadline } from '../../utils/chartHeadline';
import SegmentedControl from '../../components/SegmentedControl';
import {
  displayToGoalKm, distanceGoalProgress, formatDistanceValue, goalKmToDisplay,
} from '../../utils/weeklyDistanceGoal';
import { MUSCLE_STANDARDS } from '../../constants/volumeLandmarks';
import { fatigueBanner, pplBalance } from '../../utils/muscleTrends';
import MuscleVolumeCard, { type MuscleVolumeData } from '../../components/MuscleVolumeCard';
import AdvancedStatsCard from '../../components/AdvancedStatsCard';
import ThisWeekCard from '../../components/ThisWeekCard';
import ScoresCard from '../../components/ScoresCard';
import PremiumTeaser from '../../components/PremiumTeaser';
import { computeBarChartMax } from '../../utils/prFormat';
import { writeWidgetScore } from '../../utils/widgetData';

type Props = { navigation: NativeStackNavigationProp<ProgressStackParamsList, 'ProgressHome'> };

type ProgressBucket = { label: string; volume: number; sets: number; count: number; distance_km?: number; density?: number };
// lead_in: the 4 periods before the first bucket, so every bar's comparison looks back the same distance
type ProgressResponse = { buckets?: ProgressBucket[]; lead_in?: ProgressBucket[]; metrics_logged?: MetricsLogged };
type WeeklySummaryPreview = {
  week_start: string;
  workouts: number;
  total_volume: number;
  distance_km?: number;
  weight_unit: string;
};

// This week's count and distance are the last bucket of the 30-day progress range
const THIS_WEEK_RANGE: ChartRange = '30d';

function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Progress › Overview: this week, the two scores, the trends chart and the muscle volume cards. */
export default function ProgressOverview({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { isPremium } = usePurchase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const weightUnit: WeightUnit = (user as any)?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const barsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  const handleMetricChange = (m: ChartMetric) => {
    setChartMetric(m);
    setSelectedBarIndex(null);
  };

  // ── Progress tab state ──────────────────────────────────────────────────────
  const [progressData, setProgressData] = useState<ProgressBucket[]>([]);
  const [progressLeadIn, setProgressLeadIn] = useState<ProgressBucket[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  // True from a range tap until its answer lands, so the cleared chart shows a
  // spinner rather than "Nothing logged" for the length of the request
  const [progressLoading, setProgressLoading] = useState(false);
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
  const [strengthHistory, setStrengthHistory] = useState<ScoreSnapshot[]>([]);
  const [enduranceHistory, setEnduranceHistory] = useState<ScoreSnapshot[]>([]);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const thisWeekDays = useMemo(() => {
    const today = new Date();
    return { trained: trainedDaysOfWeek(workoutDates, today), todayIndex: (today.getDay() + 6) % 7 };
  }, [workoutDates]);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumeData | null>(null);
  const [weeklySummaryPreview, setWeeklySummaryPreview] = useState<WeeklySummaryPreview | null>(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [workingSetsInfoVisible, setWorkingSetsInfoVisible] = useState(false);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // Keyed on user.id: it can be undefined on first mount while auth hydrates,
  // and a `_undefined` key would just read back the defaults.
  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.multiGet([`${WEEKLY_GOAL_KEY}_${user.id}`, `${WEEKLY_DISTANCE_GOAL_KEY}_${user.id}`])
      .then(([goalRaw, distanceGoalRaw]) => {
        if (goalRaw[1]) setWeeklyGoal(parseInt(goalRaw[1], 10) || 3);
        const goalKm = distanceGoalRaw[1] ? parseFloat(distanceGoalRaw[1]) : NaN;
        setWeeklyDistanceGoalKm(goalKm > 0 ? goalKm : null);
      });
  }, [user?.id]);

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

  const hasMuscleVolume = muscleVolume != null;
  useEffect(() => {
    if (!hasMuscleVolume) return;
    barsAnim.setValue(0);
    Animated.timing(barsAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [hasMuscleVolume, barsAnim]);

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    const prog = appCache.get<ProgressResponse>('progress');
    if (prog) {
      setProgressData(prog.buckets ?? []);
      setProgressLeadIn(prog.lead_in ?? []);
      applyThisWeek(prog);
    }
    const score = appCache.get<any>('strength_score');
    if (score?.overall != null) setStrengthPercentile(score.overall);
    if (score?.overall_rank?.label) setStrengthRankLabel(score.overall_rank.label);
    if (score?.history) setStrengthHistory(score.history);
    const endurance = appCache.get<any>('endurance_score');
    if (endurance?.overall != null) setEndurancePercentile(endurance.overall);
    if (endurance?.overall_rank?.label) setEnduranceRankLabel(endurance.overall_rank.label);
    if (endurance?.history) setEnduranceHistory(endurance.history);
    const dates = appCache.get<{ dates: string[] }>('workout_dates');
    if (dates) setWorkoutDates(dates.dates ?? []);
    const mv = appCache.get<MuscleVolumeData>('muscle_volume');
    if (mv) setMuscleVolume(mv);
    const wsp = appCache.get<WeeklySummaryPreview>('weekly_summary_preview');
    if (wsp) setWeeklySummaryPreview(wsp);
  }, []);

  const fetchProgressData = async (range: ChartRange) => {
    try {
      const res = await apiFetch(`/api/stats/progress?range=${range}`);
      if (res.ok) {
        const data: ProgressResponse = await res.json();
        // A quick 3M → 6M tap can land the 3M answer last; it mustn't draw under 6M
        if (range !== chartRangeRef.current) return;
        setProgressData(data.buckets ?? []);
        setProgressLeadIn(data.lead_in ?? []);
        if (data.metrics_logged) setMetricsLogged(data.metrics_logged);
        // The same request fetchThisWeekCount makes, so it fills this week too
        if (range === THIS_WEEK_RANGE) applyThisWeek(data);
      }
    } catch { } finally {
      if (range === chartRangeRef.current) setProgressLoading(false);
    }
  };

  const fetchStrengthScore = async () => {
    try {
      const res = await apiFetch('/api/stats/strength-score');
      if (res.ok) {
        const data = await res.json();
        setStrengthPercentile(data.overall ?? null);
        if (data.overall_rank?.label) setStrengthRankLabel(data.overall_rank.label);
        setStrengthHistory(data.history ?? []);
        writeWidgetScore(user?.id, 'strength', data);
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
        setEnduranceHistory(data.history ?? []);
        appCache.set('endurance_score', data);
        writeWidgetScore(user?.id, 'endurance', data);
      }
    } catch { }
  };

  // Same list Home's calendar and the widget read; this screen only needs this week's days
  const fetchWorkoutDates = async () => {
    try {
      const res = await apiFetch('/api/workouts/dates');
      if (res.ok) {
        const data = await res.json();
        setWorkoutDates(data.dates ?? []);
        appCache.set('workout_dates', data);
      }
    } catch { }
  };

  const fetchThisWeekCount = async () => {
    try {
      const res = await apiFetch(`/api/stats/progress?range=${THIS_WEEK_RANGE}`);
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
    strength: appCache.stampOf('strength_score'),
    endurance: appCache.stampOf('endurance_score'),
    muscleVolume: appCache.stampOf('muscle_volume'),
    weeklySummary: appCache.stampOf('weekly_summary_preview'),
    dates: appCache.stampOf('workout_dates'),
  }));

  // Read through a ref so a range change doesn't re-run the whole focus
  // refetch; handleRangeChange fetches the new range itself.
  const chartRangeRef = useRef(chartRange);
  chartRangeRef.current = chartRange;

  useFocusEffect(useCallback(() => {
    refetchIfStale('progress', () => fetchProgressData(chartRangeRef.current));
    refetchIfStale('strength', fetchStrengthScore);
    refetchIfStale('endurance', fetchEnduranceScore);
    refetchIfStale('muscleVolume', fetchMuscleGroupData);
    // On the 30-day chart the progress request above already brings this week
    if (chartRangeRef.current !== THIS_WEEK_RANGE) refetchIfStale('thisWeek', fetchThisWeekCount);
    refetchIfStale('weeklySummary', fetchWeeklySummaryPreview);
    refetchIfStale('dates', fetchWorkoutDates);
  }, []));

  const visibleMetrics = useMemo(() => visibleChartMetrics(metricsLogged), [metricsLogged]);
  // Whether the advanced stats below the muscle card have anything to show; the lock only covers real content
  const hasAdvancedStats = !!muscleVolume && (
    !!metricsLogged?.density
    || fatigueBanner(muscleVolume.this_week_total ?? 0, muscleVolume.last_week_to_date_total ?? 0) != null
    || pplBalance(muscleVolume.muscle_sets) != null
  );
  // Falling back here rather than resetting state keeps the user's pick for
  // when that metric's tab comes back.
  const activeMetric: ChartMetric = visibleMetrics.includes(chartMetric)
    ? chartMetric
    : (visibleMetrics[0] ?? 'workouts');

  const handleRangeChange = (newRange: ChartRange) => {
    if (newRange === chartRange) return;
    setProgressData([]);
    setProgressLeadIn([]);
    setProgressLoading(true);
    setSelectedBarIndex(null);
    // Set now, not on the next render, so the answer for this range is recognised as current
    chartRangeRef.current = newRange;
    setChartRange(newRange);
    refetchIfStale('progress', () => fetchProgressData(newRange), true);
  };

  const weeklySummarySubtitle = () => {
    const p = weeklySummaryPreview;
    if (!p) return 'Workouts, volume, and PRs from last week';
    const dateRange = weekRangeLabel(p.week_start);
    if (p.workouts === 0) return `${dateRange} · No workouts logged`;
    const workoutsStr = `${p.workouts} workout${p.workouts !== 1 ? 's' : ''}`;
    if (p.total_volume > 0) return `${dateRange} · ${workoutsStr} · ${p.total_volume.toLocaleString()} ${p.weight_unit}`;
    if (p.distance_km != null) {
      const dist = toDisplayDistance(p.distance_km, distanceUnit);
      return `${dateRange} · ${workoutsStr} · ${dist.toFixed(2)} ${distanceUnit}`;
    }
    return `${dateRange} · ${workoutsStr}`;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {(() => {
          const getValue = (b: ProgressBucket) =>
            activeMetric === 'volume' ? b.volume
              : activeMetric === 'sets' ? b.sets
              : activeMetric === 'distance' ? roundTenth(toDisplayDistance(b.distance_km ?? 0, distanceUnit))
              : b.count;
          const hasData = progressData.some(b => getValue(b) > 0);

          const BAR_GAP = 6;
          const N = progressData.length || 1;
          const availableForBars = Dimensions.get('window').width - 48 - 35 - 40;
          const barWidth = Math.max(8, Math.floor((availableForBars - (N - 1) * BAR_GAP) / N));
          const maxVal = Math.max(...progressData.map(getValue), 1);

          // 3M packs 13 weekly bars into the width 30D gives 5, about 12px
          // each, and the library sizes a label to its bar, so "9/22" won't
          // fit. Every other week gets a label, drawn wider and recentred
          // over its bar; the newest week always keeps one.
          const THIN_LABELS = chartRange === '3m';
          const X_LABEL_WIDTH = 36;
          const lastIndex = progressData.length - 1;
          // The headline reads the picked bar, else the newest (this week or month)
          const headlineIndex = selectedBarIndex != null && selectedBarIndex <= lastIndex ? selectedBarIndex : lastIndex;

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
            frontColor: i === headlineIndex ? colors.accent : colors.accent + '66',
            onPress: () => setSelectedBarIndex(prev => prev === i ? null : i),
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

          const headline = progressData.length > 0 ? chartHeadline({
            metric: activeMetric,
            values: progressData.map(getValue),
            previous: progressLeadIn.map(getValue),
            labels: progressData.map(b => b.label),
            index: headlineIndex,
            monthly: isMonthlyRange,
            weightUnit,
            distanceUnit,
          }) : null;
          const RANGE_SEGMENTS = CHART_RANGES.map(r => ({ key: r, label: r.toUpperCase() }));
          return (
            <>
              <ThisWeekCard
                trainedDays={thisWeekDays.trained}
                todayIndex={thisWeekDays.todayIndex}
                done={thisWeekCount}
                goal={weeklyGoal}
                distance={weeklyDistanceGoalKm != null
                  ? { ...distanceGoalProgress(thisWeekDistanceKm, weeklyDistanceGoalKm, distanceUnit), unit: distanceUnit }
                  : null}
                lastWeekText={weeklySummarySubtitle()}
                onEditGoal={() => setGoalModalVisible(true)}
                onOpenLastWeek={() => navigation.navigate('WeeklySummary')}
              />

              {/* Open to everyone: free accounts see their score with the breakdown locked */}
              <ScoresCard
                strength={{
                  percentile: strengthPercentile,
                  rank: strengthRankLabel,
                  change: monthlyScoreChange(strengthHistory, strengthPercentile),
                }}
                endurance={{
                  percentile: endurancePercentile,
                  rank: enduranceRankLabel,
                  change: monthlyScoreChange(enduranceHistory, endurancePercentile),
                }}
                onOpenStrength={() => navigation.navigate('StrengthScore')}
                onOpenEndurance={() => navigation.navigate('EnduranceScore')}
              />

              {/* Chart. Someone who hasn't logged anything gets the card
                  with no tabs or range to pick, since there's nothing to chart. */}
              {hasLoggedNothing(metricsLogged) ? (
                <View style={styles.chartSection}>
                  <View style={styles.chartEmpty}>
                    <Text style={styles.emptyText}>Start logging to track your progress</Text>
                  </View>
                </View>
              ) : (
              <View style={styles.chartSection}>
                <View style={styles.metricChips}>
                  {visibleMetrics.map(m => {
                    const active = activeMetric === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.metricChip, active && styles.metricChipActive]}
                        onPress={() => handleMetricChange(m)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[styles.metricChipText, active && styles.metricChipTextActive]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {hasData && headline && (
                  <View style={styles.headline} testID="chart-headline">
                    <View style={styles.headlineValueRow}>
                      <Text style={styles.headlineValue}>{headline.value}</Text>
                      <Text style={styles.headlineUnit}>{headline.unit}</Text>
                    </View>
                    <Text style={styles.headlineWhen}>{headline.when}</Text>
                    {headline.change ? (
                      <Text style={[styles.headlineCompare, headline.change.pct > 0 && { color: colors.accent }]}>
                        {headline.change.text}
                      </Text>
                    ) : headline.average ? (
                      <Text style={styles.headlineCompare}>{headline.average}</Text>
                    ) : null}
                  </View>
                )}

                {hasData ? (
                  <BarChart
                    key={`${chartRange}-${activeMetric}`}
                    data={barData}
                    barWidth={barWidth}
                    spacing={BAR_GAP}
                    hideRules
                    xAxisLabelTextStyle={styles.axisLabel}
                    yAxisTextStyle={styles.axisLabel}
                    noOfSections={4}
                    maxValue={computeBarChartMax(
                      Math.max(maxVal * 1.1, weeklyTarget != null ? referenceLinePos * 1.1 : 0),
                      4,
                    )}
                    height={150}
                    barBorderRadius={1}
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
                ) : progressLoading ? (
                  <View style={styles.chartEmpty}>
                    <ActivityIndicator color={colors.accent} accessibilityLabel="Loading chart" />
                  </View>
                ) : (
                  <View style={styles.chartEmpty}>
                    <Text style={styles.emptyText}>Nothing logged in this range yet.</Text>
                  </View>
                )}

                <SegmentedControl
                  options={RANGE_SEGMENTS}
                  value={chartRange}
                  onChange={handleRangeChange}
                  style={styles.rangeControl}
                />
              </View>
              )}

              {muscleVolume && (
                <MuscleVolumeCard
                  data={muscleVolume}
                  isPremium={isPremium}
                  barsAnim={barsAnim}
                  onInfo={() => setWorkingSetsInfoVisible(true)}
                  onUnlock={() => (navigation as any).navigate('Paywall', { source: 'muscle_volume' })}
                />
              )}
              {hasAdvancedStats && muscleVolume && (
                <PremiumTeaser
                  locked={!isPremium}
                  largeLock
                  source="muscle_volume"
                  title="Advanced stats"
                  body="A fatigue monitor that compares this week with last, your push, pull and legs balance, and how much work you fit into each minute."
                  onUnlock={() => (navigation as any).navigate('Paywall', { source: 'muscle_volume' })}
                >
                  <AdvancedStatsCard
                    muscleSets={muscleVolume.muscle_sets}
                    setsToDate={muscleVolume.this_week_total ?? 0}
                    lastWeekSetsToDate={muscleVolume.last_week_to_date_total}
                    densityBuckets={progressData}
                    hasDensity={!!metricsLogged?.density}
                    weightUnit={weightUnit}
                  />
                </PremiumTeaser>
              )}
            </>
          );
        })()}
      </ScrollView>

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

    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1 },
  // ── Progress tab ────────────────────────────────────────────────────────────
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  // No card around the chart: it sits on the screen background like the score rings
  chartSection: { marginBottom: spacing.lg },
  // Same look as the muscle filter chips in the exercise picker. Equal shares
  // of one row: at their natural widths all four overflow a phone and wrap
  metricChips: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  metricChip: {
    flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: 6, minHeight: 32, justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  metricChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  metricChipText: { fontSize: typography.fontSize.sm, fontWeight: '500', color: colors.textSecondary },
  metricChipTextActive: { color: colors.accentText, fontWeight: '700' },
  headline: { marginBottom: spacing.md },
  headlineValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  headlineValue: { fontSize: typography.fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  headlineUnit: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  headlineWhen: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  headlineCompare: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  rangeControl: { marginTop: spacing.md },
  chartEmpty: { height: 150, justifyContent: 'center', alignItems: 'center' },
  axisLabel: { fontSize: 9, color: colors.textSecondary },

  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },
});
