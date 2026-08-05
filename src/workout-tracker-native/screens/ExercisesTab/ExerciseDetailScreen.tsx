import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, resolveMediaUrl } from '../../utils/api';
import { ExerciseDetailParams } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayWeight, toDisplayVolume, convertWeight, WeightUnit, GPS_DISTANCE_UNIT_KEY, toDisplayDistance, toDisplayPace } from 'utils/units';
import MuscleDiagram from '../../components/MuscleDiagram';
import { SCORE_RANK_COLORS } from '../../constants/strengthRanks';
import LiftDetailModal, { type LiftEntry } from '../../components/LiftDetailModal';

const SCREEN_WIDTH  = Dimensions.get('window').width;
const CHART_WIDTH   = SCREEN_WIDTH - spacing.md * 4;


type Props = {
  route: { params: ExerciseDetailParams };
  navigation: { goBack: () => void; navigate: (...args: any[]) => void };
};

// Contrast-safe text color for a solid rank-color background — most rank colors
// are dark/mid-tone (safe with white text) except Legend's bright gold.
function contrastTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#fff';
}

type ExerciseStats = {
  estimatedOneRepMax: number;
  totalSets: number;
  workoutCount: number;
  totalReps: number;
  maxWeight: number;
  maxReps: number;
  maxVolume: number;
};

type HistorySession = {
  date: string;
  workoutName: string;
  sets: { reps: number; weight: number }[];
  best1rm: number;
  bestWeight: number;
  volume: number;
  notes?: string;
};

type ChartPoint = { value: number; label: string; dataPointText: string; date: string };

type CardioStats = {
  total_distance: number;
  total_duration: number;
  session_count: number;
  avg_pace: number | null;
};

type CardioBout = {
  cardio_duration: number;
  distance: number;
  distance_unit: string;
  intensity: number | null;
};

type CardioSession = {
  date: string;
  workout_name: string;
  bouts: CardioBout[];
};

const exerciseDescriptions: Record<string, string> = {
  Chest:
    'Lie back on a bench or floor with a stable grip. Press the weight up in a controlled motion and lower back slowly to feel the chest contract.',
  Back:
    'Pull the weight toward your body while keeping your shoulders back. Focus on squeezing the shoulder blades and controlling the negative motion.',
  Biceps:
    'Curl the weight with a tight elbow position. Keep your wrists neutral and avoid swinging to isolate the biceps.',
  Triceps:
    'Push the weight down or away with the elbows close to your body. Keep the motion steady and focus on the back of the arm.',
  Shoulders:
    'Lift the weight with the shoulders active and avoid shrugging. Keep your core tight and move through a controlled arc.',
  Quads:
    'Drive through your heels and keep your knees aligned with your toes. Lower with control and extend fully through the movement.',
  Hamstrings:
    'Hinge through the hips and feel the hamstrings stretch before returning to the start. Keep your spine neutral throughout.',
  Calves:
    'Raise your heels smoothly and lower with control. Keep the legs straight or slightly bent depending on the variation.',
  Core:
    'Brace the midsection and perform the movement with a steady, controlled tempo. Focus on spinal stability and breathing.',
};

const defaultDescription =
  'Use a controlled tempo, keep good posture, and focus on the muscle while performing each repetition. Start light and increase load as form stays solid.';

type TabKey = 'overview' | 'charts' | 'history';

export default function ExerciseDetailScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const weightUnit: WeightUnit = (user?.weight_unit as WeightUnit) || 'lbs';
  const {
    exerciseId,
    exerciseName,
    equipment,
    muscleGroup,
    description,
    imageUrl,
    isCustom,
    initialTab,
  } = route.params;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'overview');
  // Held only for the duration of a tab transition — the outgoing tab renders
  // as an absolutely-positioned overlay fading out while the incoming tab
  // fades in underneath, so both are visible mid-crossfade instead of a
  // fade-to-black-then-back-in.
  const [prevTab, setPrevTab] = useState<TabKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [exerciseType, setExerciseType] = useState<'strength' | 'cardio'>('strength');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [stats, setStats] = useState<ExerciseStats>({
    estimatedOneRepMax: 0,
    totalSets: 0,
    workoutCount: 0,
    totalReps: 0,
    maxWeight: 0,
    maxReps: 0,
    maxVolume: 0,
  });
  const [cardioStats, setCardioStats] = useState<CardioStats | null>(null);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [cardioHistory, setCardioHistory] = useState<CardioSession[]>([]);
  const [chart1RM, setChart1RM] = useState<ChartPoint[]>([]);
  const [chartMaxWeight, setChartMaxWeight] = useState<ChartPoint[]>([]);
  const [chartVolume, setChartVolume] = useState<ChartPoint[]>([]);
  const [hasChartData, setHasChartData] = useState({ oneRm: false, maxW: false, vol: false });
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | 'All'>('3M');
  const [templateDescription, setTemplateDescription] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [scoreEntry, setScoreEntry] = useState<LiftEntry | null>(null);
  const [liftModalVisible, setLiftModalVisible] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      'Delete Exercise',
      `Delete "${exerciseName}"? This won't remove it from past workouts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await apiFetch(`/api/exercises/${exerciseId}`, { method: 'DELETE' });
              if (res.ok) {
                navigation.goBack();
              } else {
                const data = await res.json();
                Alert.alert('Error', data.message || 'Could not delete exercise');
              }
            } catch {
              Alert.alert('Error', 'Something went wrong');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const tabAnimRef = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const prevFadeAnim = useRef(new Animated.Value(0)).current;
  const statAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const histAnims = useRef<Animated.Value[]>([]);

  // Charts tab only exists once there's actually enough data for at least one
  // chart — cardio has no charts at all today, so it never gets this tab.
  const hasAnyChart = hasChartData.oneRm || hasChartData.maxW || hasChartData.vol;
  const visibleTabs = useMemo(() => {
    const tabs: Array<{ key: TabKey; label: string }> = [
      { key: 'overview', label: 'Overview' },
    ];
    if (exerciseType === 'strength' && hasAnyChart) tabs.push({ key: 'charts', label: 'Charts' });
    tabs.push({ key: 'history', label: 'History' });
    return tabs;
  }, [exerciseType, hasAnyChart]);

  const tabSlideWidth = (SCREEN_WIDTH - spacing.md * 2) / visibleTabs.length;
  const sliderX = tabAnimRef.interpolate({
    inputRange: visibleTabs.map((_, i) => i),
    outputRange: visibleTabs.map((_, i) => tabSlideWidth * i),
  });

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    const idx = visibleTabs.findIndex(t => t.key === tab);
    Animated.timing(tabAnimRef, { toValue: idx, duration: 200, useNativeDriver: true }).start();

    setPrevTab(activeTab);
    contentFadeAnim.setValue(0);
    prevFadeAnim.setValue(1);
    setActiveTab(tab);

    Animated.parallel([
      Animated.timing(contentFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(prevFadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setPrevTab(null));
  };

  // Horizontal swipe between tabs — only claims the gesture once the drag is
  // clearly more horizontal than vertical, so vertical scrolling of the
  // ScrollView (and any nested chart touch handling) is left alone.
  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_, gesture) => {
      const idx = visibleTabs.findIndex(t => t.key === activeTab);
      const SWIPE_THRESHOLD = 60;
      if (gesture.dx <= -SWIPE_THRESHOLD && idx < visibleTabs.length - 1) {
        handleTabChange(visibleTabs[idx + 1].key);
      } else if (gesture.dx >= SWIPE_THRESHOLD && idx > 0) {
        handleTabChange(visibleTabs[idx - 1].key);
      }
    },
  }), [activeTab, visibleTabs]);

  const fetchExerciseData = useCallback(async () => {
    if (!exerciseName) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/stats/exercise?name=${encodeURIComponent(exerciseName)}&exercise_template_id=${exerciseId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTemplateDescription(data.description || null);

      if (data.exercise_type === 'cardio') {
        setExerciseType('cardio');
        setCardioStats({
          total_distance: data.totals?.total_distance ?? 0,
          total_duration: data.totals?.total_duration ?? 0,
          session_count: data.totals?.session_count ?? 0,
          avg_pace: data.avg_pace ?? null,
        });
        setCardioHistory(data.history ?? []);
        return;
      }

      setExerciseType('strength');
      const sessions: HistorySession[] = (data.history ?? []).map((item: any) => ({
        date: item.date,
        workoutName: item.workout_name || 'Workout',
        sets: item.sets ?? [],
        best1rm: item.best_1rm ?? 0,
        bestWeight: item.best_set?.weight ?? 0,
        volume: item.volume ?? 0,
        notes: item.notes || undefined,
      }));

      setHistorySessions(sessions);
      setStats({
        estimatedOneRepMax: data.personal_bests?.estimated_1rm ?? 0,
        maxWeight: data.personal_bests?.max_weight ?? 0,
        maxReps: data.personal_bests?.most_reps ?? 0,
        totalSets: data.totals?.total_sets ?? 0,
        totalReps: data.totals?.total_reps ?? 0,
        workoutCount: data.totals?.total_workouts ?? 0,
        maxVolume: data.personal_bests?.max_set_volume ?? 0,
      });
    } catch {
    } finally {
      setLoading(false);
    }
  }, [exerciseId, exerciseName, weightUnit]);

  useEffect(() => {
    if (historySessions.length === 0) return;
    const cutoff = chartRange === 'All' ? null : (() => {
      const d = new Date();
      const months = chartRange === '1M' ? 1 : chartRange === '3M' ? 3 : 6;
      d.setMonth(d.getMonth() - months);
      return d;
    })();
    const chrono = [...historySessions].reverse();
    const inRange = chrono.filter(s => !cutoff || new Date(s.date) >= cutoff);

    const buildPoints = (items: HistorySession[], getter: (s: HistorySession) => number): ChartPoint[] => {
      const pts = items
        .filter(s => getter(s) > 0)
        .map(s => {
          const d = new Date(s.date);
          const val = parseFloat(convertWeight(getter(s), weightUnit).toFixed(1));
          return { value: val, date: `${d.getMonth() + 1}/${d.getDate()}` };
        });
      // Thin x labels to ~4; direct-label only the max and latest points
      const step = Math.max(1, Math.ceil(pts.length / 4));
      let maxIdx = 0;
      pts.forEach((p, i) => { if (p.value > pts[maxIdx].value) maxIdx = i; });
      return pts.map((p, i) => ({
        ...p,
        label: i % step === 0 ? p.date : '',
        dataPointText: i === maxIdx || i === pts.length - 1 ? `${Math.round(p.value)}` : '',
      }));
    };

    // Range-independent counts decide whether a chart exists at all vs is just
    // empty for the selected range
    setHasChartData({
      oneRm: chrono.filter(s => s.best1rm > 0).length >= 2,
      maxW: chrono.filter(s => s.bestWeight > 0).length >= 2,
      vol: chrono.filter(s => s.volume > 0).length >= 2,
    });
    setChart1RM(buildPoints(inRange, s => s.best1rm));
    setChartMaxWeight(buildPoints(inRange, s => s.bestWeight));
    setChartVolume(buildPoints(inRange, s => s.volume));
  }, [historySessions, chartRange, weightUnit]);

  useEffect(() => {
    if (activeTab !== 'overview' || stats.totalSets === 0) return;
    statAnims.forEach(a => a.setValue(0));
    Animated.stagger(50, statAnims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true })
    )).start();
  }, [activeTab, stats.totalSets]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    const count = exerciseType === 'cardio' ? cardioHistory.length : historySessions.length;
    if (count === 0) return;
    while (histAnims.current.length < count) histAnims.current.push(new Animated.Value(0));
    histAnims.current.slice(0, count).forEach(a => a.setValue(0));
    Animated.stagger(60, histAnims.current.slice(0, count).map(a =>
      Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true })
    )).start();
  }, [activeTab, historySessions.length, cardioHistory.length]);

  useEffect(() => {
    fetchExerciseData();
  }, [fetchExerciseData]);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  const isCardio = muscleGroup === 'Cardio';
  const muscles = isCardio ? [] : (muscleGroup?.split(',').map((m: string) => m.trim()).filter(Boolean) ?? []);
  const primaryMuscle = muscles[0] ?? muscleGroup ?? '';
  const secondaryMuscles = muscles.slice(1);

  // Strength Score badge — silently absent for cardio, untracked lifts, or a
  // user missing gender/bodyweight (a 422 here just means res.ok is false).
  useEffect(() => {
    if (isCardio || !exerciseId) { setScoreEntry(null); return; }
    apiFetch(`/api/stats/strength-score/exercise?exercise_template_id=${exerciseId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setScoreEntry(data?.has_data ? data : null))
      .catch(() => setScoreEntry(null));
  }, [isCardio, exerciseId]);

  // templateDescription is the hand-curated per-exercise text (null for custom
  // exercises, which have no seeded entry) — fall back to the generic
  // per-muscle-group blurb, then the fully generic default.
  const exerciseDescription =
    templateDescription || description || (muscleGroup ? exerciseDescriptions[muscleGroup] : null) || defaultDescription;

  const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

  const renderDelta = (points: ChartPoint[], suffix: string) => {
    const delta = points[points.length - 1].value - points[0].value;
    if (Math.round(Math.abs(delta)) === 0) return null;
    const up = delta > 0;
    const deltaColor = up ? colors.save : colors.danger;
    return (
      <View style={styles.deltaRow}>
        <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={deltaColor} />
        <Text style={[styles.deltaText, { color: deltaColor }]}>
          {up ? '+' : '−'}{fmtK(Math.abs(delta))} {suffix}
        </Text>
      </View>
    );
  };

  const renderTooltipBubble = (item: ChartPoint, suffix: string) => (
    <View style={styles.tooltipBubble}>
      <Text style={styles.tooltipDate}>{item.date}</Text>
      <Text style={styles.tooltipValue}>{fmtK(item.value)} {suffix}</Text>
    </View>
  );

  const renderChart = (points: ChartPoint[], title: string, color: string, hasAny: boolean) => {
    if (!hasAny) return null;
    if (points.length < 2) {
      return (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{title}</Text>
          <Text style={styles.chartEmptyNote}>Not enough data in this range</Text>
        </View>
      );
    }
    const vals = points.map(p => p.value);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    // Window the y-axis around the data — a zero floor flattens progress lines
    const pad = Math.max((maxVal - minVal) * 0.2, maxVal * 0.04, 2);
    const yMin = Math.max(0, Math.floor(minVal - pad));
    const yMax = Math.ceil(maxVal + pad);
    const spacing = Math.max(12, Math.floor((CHART_WIDTH - 40) / (points.length - 1)));
    return (
      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartTitle}>{title}</Text>
          {renderDelta(points, weightUnit)}
        </View>
        <LineChart
          data={points}
          width={CHART_WIDTH}
          height={150}
          spacing={spacing}
          color={color}
          thickness={2}
          dataPointsColor={color}
          dataPointsRadius={3.5}
          startFillColor={color}
          endFillColor={colors.background}
          startOpacity={0.16}
          endOpacity={0}
          areaChart
          curved
          rulesType="dashed"
          rulesColor={colors.border}
          rulesThickness={1}
          yAxisTextStyle={styles.axisLabel}
          yAxisLabelWidth={36}
          xAxisLabelTextStyle={styles.axisLabel}
          noOfSections={3}
          maxValue={yMax - yMin}
          yAxisOffset={yMin}
          initialSpacing={10}
          endSpacing={10}
          textShiftY={-8}
          textFontSize={10}
          textColor={colors.textSecondary}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisThickness={0}
          isAnimated
          pointerConfig={{
            activatePointersOnLongPress: true,
            pointerStripColor: colors.border,
            pointerStripWidth: 1,
            pointerStripUptoDataPoint: true,
            pointerColor: color,
            radius: 5,
            pointerLabelWidth: 96,
            pointerLabelHeight: 44,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: (items: ChartPoint[]) => renderTooltipBubble(items[0], weightUnit),
          }}
        />
      </View>
    );
  };

  const renderVolumeChart = (points: ChartPoint[], hasAny: boolean) => {
    if (!hasAny) return null;
    if (points.length < 2) {
      return (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Session volume ({weightUnit})</Text>
          <Text style={styles.chartEmptyNote}>Not enough data in this range</Text>
        </View>
      );
    }
    const maxVal = Math.max(...points.map(p => p.value));
    const slot = Math.floor((CHART_WIDTH - 46) / points.length);
    const barSpacing = Math.max(2, Math.floor(slot * 0.3));
    const barWidth = Math.min(26, Math.max(6, slot - barSpacing));
    return (
      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartTitle}>Session volume ({weightUnit})</Text>
          {renderDelta(points, weightUnit)}
        </View>
        <BarChart
          data={points}
          width={CHART_WIDTH}
          height={150}
          barWidth={barWidth}
          spacing={barSpacing}
          frontColor={colors.accent}
          barBorderTopLeftRadius={3}
          barBorderTopRightRadius={3}
          rulesType="dashed"
          rulesColor={colors.border}
          rulesThickness={1}
          yAxisTextStyle={styles.axisLabel}
          yAxisLabelWidth={36}
          formatYLabel={(label: string) => fmtK(Number(label))}
          xAxisLabelTextStyle={styles.axisLabel}
          noOfSections={3}
          maxValue={Math.ceil(maxVal * 1.15)}
          initialSpacing={10}
          endSpacing={10}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisThickness={0}
          isAnimated
          renderTooltip={(item: ChartPoint) => renderTooltipBubble(item, weightUnit)}
        />
      </View>
    );
  };

  const fmtPace = (pace: number, unit: string) => {
    const m = Math.floor(pace);
    const s = Math.round((pace - m) * 60);
    return `${m}:${String(s).padStart(2, '0')} /${unit}`;
  };

  const renderCardioStats = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (!cardioStats || cardioStats.session_count === 0) {
      return null;
    }
    // cardioStats comes from the backend always normalized to km/min-per-km —
    // convert to the user's preferred unit before display.
    const { total_distance, total_duration, session_count, avg_pace } = cardioStats;
    const distDisplay = toDisplayDistance(total_distance, distanceUnit);
    const paceDisplay = avg_pace != null ? toDisplayPace(avg_pace, distanceUnit) : null;
    return (
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sessions</Text>
          <Text style={styles.statValue}>{session_count}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Distance</Text>
          <Text style={styles.statValue}>{distDisplay.toFixed(2)} {distanceUnit}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Time</Text>
          <Text style={styles.statValue}>{Math.round(total_duration)} min</Text>
        </View>
        {paceDisplay != null && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Pace</Text>
            <Text style={styles.statValue}>{fmtPace(paceDisplay, distanceUnit)}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderCardioHistory = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (cardioHistory.length === 0) {
      return <Text style={styles.emptyText}>No recorded sessions for this exercise yet.</Text>;
    }
    return cardioHistory.map((session, i) => {
      const anim = histAnims.current[i] ?? new Animated.Value(1);
      return (
        <Animated.View key={i} style={{ opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={styles.historySession}>
            <View style={styles.historyMeta}>
              <Text style={styles.historyLabel}>{session.workout_name}</Text>
              <Text style={styles.historyDate}>{new Date(session.date).toLocaleDateString()}</Text>
            </View>
            {session.bouts.map((bout, j) => {
              const parts: string[] = [];
              if (bout.cardio_duration) parts.push(`${Math.round(bout.cardio_duration)} min`);
              if (bout.distance) parts.push(`${bout.distance.toFixed(2)} ${bout.distance_unit}`);
              if (bout.intensity) parts.push(`@ ${fmtPace(bout.intensity, bout.distance_unit || 'km')}`);
              return (
                <View key={j} style={styles.historySetRow}>
                  <View style={styles.historySetBadge}>
                    <Text style={styles.historySetBadgeText}>{j + 1}</Text>
                  </View>
                  <Text style={styles.historySetReps}>{parts.join(' · ')}</Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      );
    });
  };

  const renderStats = () => {
    if (exerciseType === 'cardio') return renderCardioStats();
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (stats.totalSets === 0) {
      return null;
    }
    const lifetimeStatData = [
      { label: 'Workouts',   value: String(stats.workoutCount) },
      { label: 'Total Sets', value: String(stats.totalSets) },
      { label: 'Total Reps', value: String(stats.totalReps) },
    ];
    const prStatData = [
      { label: 'Estimated 1RM', value: stats.estimatedOneRepMax ? toDisplayWeight(stats.estimatedOneRepMax, weightUnit) : '—' },
      { label: 'Max Weight',    value: stats.maxWeight ? toDisplayWeight(stats.maxWeight, weightUnit) : '—' },
      { label: 'Max Reps',      value: String(stats.maxReps || '—') },
      { label: 'Max Vol / Set', value: stats.maxVolume ? toDisplayVolume(stats.maxVolume, weightUnit) : '—' },
    ];
    const renderGrid = (data: { label: string; value: string }[], animOffset: number) => (
      <View style={styles.statsGrid}>
        {data.map((s, i) => (
          <Animated.View
            key={s.label}
            style={[styles.statCard, {
              opacity: statAnims[animOffset + i],
              transform: [{ scale: statAnims[animOffset + i].interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
            }]}
          >
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
          </Animated.View>
        ))}
      </View>
    );
    const renderLifetimeBox = (data: { label: string; value: string }[], animOffset: number) => (
      <View style={styles.lifetimeBox}>
        {data.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={styles.lifetimeDivider} />}
            <Animated.View
              style={[styles.lifetimeCell, {
                opacity: statAnims[animOffset + i],
                transform: [{ scale: statAnims[animOffset + i].interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
              }]}
            >
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </Animated.View>
          </React.Fragment>
        ))}
      </View>
    );
    return (
      <>
        <Text style={styles.sectionTitle}>Lifetime Stats</Text>
        {renderLifetimeBox(lifetimeStatData, 0)}
        <Text style={styles.sectionTitle}>Personal Records</Text>
        {renderGrid(prStatData, lifetimeStatData.length)}
      </>
    );
  };

  const renderOverview = () => (
    <>
      {!isCardio && (
        <>
          <Text style={styles.sectionTitle}>Muscle Breakdown</Text>
          <View style={styles.diagramCard}>
            <MuscleDiagram
              muscles={muscles}
              scale={0.85}
              muscleColors={Object.fromEntries([
                ...(primaryMuscle ? [[primaryMuscle, colors.accent]] : []),
                ...secondaryMuscles.map(m => [m, colors.accent + '80']),
              ])}
            />
          </View>
        </>
      )}

      {/* Primary / secondary muscles */}
      {!isCardio && (primaryMuscle || secondaryMuscles.length > 0) && (
        <View style={styles.muscleRow}>
          {primaryMuscle ? (
            <View style={styles.musclePill}>
              <View style={styles.musclePillLabelRow}>
                <View style={[styles.muscleSwatch, { backgroundColor: colors.accent }]} />
                <Text style={styles.musclePillLabel}>Primary</Text>
              </View>
              <Text style={styles.musclePillValue}>{primaryMuscle}</Text>
            </View>
          ) : null}
          {secondaryMuscles.length > 0 && (
            <View style={styles.musclePill}>
              <View style={styles.musclePillLabelRow}>
                <View style={[styles.muscleSwatch, { backgroundColor: colors.accent + '80' }]} />
                <Text style={styles.musclePillLabel}>Secondary</Text>
              </View>
              <Text style={styles.musclePillValue}>{secondaryMuscles.join(', ')}</Text>
            </View>
          )}
        </View>
      )}

      {scoreEntry?.rank && (() => {
        const rankColor = SCORE_RANK_COLORS[scoreEntry.rank.label] ?? colors.accent;
        const textColor = contrastTextColor(rankColor);
        const pct = scoreEntry.percentile ?? 0;
        return (
          <TouchableOpacity
            style={[styles.scoreCard, { backgroundColor: rankColor }]}
            activeOpacity={0.8}
            onPress={() => setLiftModalVisible(true)}
          >
            <View style={[styles.scoreCircle, { borderColor: textColor }]}>
              <Text style={[styles.scoreCircleText, { color: textColor }]}>{Math.round(pct)}</Text>
            </View>
            <View style={styles.scoreCardTextCol}>
              <Text style={[styles.scoreCardLabel, { color: textColor }]}>Strength Score</Text>
              <Text style={[styles.scoreCardRank, { color: textColor }]}>{scoreEntry.rank.display}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={textColor} />
          </TouchableOpacity>
        );
      })()}

      {renderStats()}

      <View style={styles.howToSection}>
        <Text style={styles.sectionTitle}>How to perform</Text>
        <Text style={styles.body}>{exerciseDescription}</Text>
      </View>

      {isCustom && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting
            ? <ActivityIndicator size="small" color={colors.danger} />
            : <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete Exercise</Text>
          }
        </TouchableOpacity>
      )}
    </>
  );

  const renderTabContent = (tab: TabKey) => {
    switch (tab) {
      case 'overview': return renderOverview();
      case 'charts': return renderCharts();
      case 'history': return renderHistory();
    }
  };

  const renderCharts = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    return (
      <View>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressLabel}>Progress</Text>
          <View style={styles.rangeToggle}>
            {(['1M', '3M', '6M', 'All'] as const).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.rangeBtn, chartRange === r && { backgroundColor: colors.accent + '22' }]}
                onPress={() => setChartRange(r)}
              >
                <Text style={[styles.rangeBtnText, chartRange === r && { color: colors.accent, fontWeight: '700' }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {renderChart(chart1RM, `Estimated 1RM (${weightUnit})`, colors.accent, hasChartData.oneRm)}
        {renderChart(chartMaxWeight, `Max weight (${weightUnit})`, colors.save, hasChartData.maxW)}
        {renderVolumeChart(chartVolume, hasChartData.vol)}
      </View>
    );
  };

  const renderHistory = () => {
    if (exerciseType === 'cardio') return renderCardioHistory();
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (historySessions.length === 0) {
      return <Text style={styles.emptyText}>No recorded sets for this exercise yet.</Text>;
    }
    return historySessions.map((session, i) => {
      const anim = histAnims.current[i] ?? new Animated.Value(1);
      return (
        <Animated.View key={i} style={{ opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={styles.historySession}>
            <View style={styles.historyMeta}>
              <Text style={styles.historyLabel}>{session.workoutName}</Text>
              <Text style={styles.historyDate}>{new Date(session.date).toLocaleDateString()}</Text>
            </View>
            {session.notes ? (
              <Text style={styles.historyNotes}>{session.notes}</Text>
            ) : null}
            {session.sets.map((set, j) => (
              <View key={j} style={styles.historySetRow}>
                <View style={styles.historySetBadge}>
                  <Text style={styles.historySetBadgeText}>{j + 1}</Text>
                </View>
                <Text style={styles.historySetReps}>{set.reps} reps</Text>
                {set.weight ? <Text style={styles.historySetWeight}>{toDisplayWeight(set.weight, weightUnit)}</Text> : null}
              </View>
            ))}
          </View>
        </Animated.View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {/* Close button — fixed overlay, always visible */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={18} color="#fff" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image — only shown when an image exists */}
        {imageUrl ? (
          <View style={styles.heroContainer}>
            <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.heroImage} resizeMode="cover" />
          </View>
        ) : null}
        <View style={styles.content}>
        {/* Title + equipment in parentheses */}
        <Text style={styles.title}>
          {exerciseName}
          {equipment ? <Text style={styles.titleEquipment}> ({equipment})</Text> : null}
        </Text>

        {/* Animated tab bar */}
        <View style={styles.tabBar}>
          {visibleTabs.map((tab, idx) => (
            <React.Fragment key={tab.key}>
              {idx > 0 && <View style={styles.tabDivider} />}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabChange(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === tab.key && { color: colors.accent, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
          <Animated.View style={[styles.tabSlider, { backgroundColor: colors.accent, width: tabSlideWidth, transform: [{ translateX: sliderX }] }]} />
        </View>

        <View style={styles.crossfadeContainer} {...swipeResponder.panHandlers}>
          {prevTab && (
            <Animated.View
              style={[styles.section, styles.crossfadeOverlay, { opacity: prevFadeAnim }]}
              pointerEvents="none"
            >
              {renderTabContent(prevTab)}
            </Animated.View>
          )}
          <Animated.View style={[styles.section, { opacity: contentFadeAnim }]}>
            {renderTabContent(activeTab)}
          </Animated.View>
        </View>
        </View>
      </ScrollView>

      <LiftDetailModal
        visible={liftModalVisible}
        onClose={() => setLiftModalVisible(false)}
        lift={scoreEntry}
        weightUnit={weightUnit}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Hero
  heroContainer: {
    height: 280,
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 10,
    top: 52,
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  titleEquipment: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    fontWeight: '400',
  },

  // Animated tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
    height: 44,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabSlider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
  },

  // Primary / secondary pills (About tab)
  muscleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  musclePill: {
    flex: 1,
  },
  musclePillLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  muscleSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  musclePillLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  musclePillValue: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  crossfadeContainer: {
    position: 'relative',
  },
  crossfadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  howToSection: {
    marginBottom: spacing.md,
  },
  diagramCard: {
    marginBottom: spacing.md,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  scoreCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '800',
  },
  scoreCardTextCol: {
    flex: 1,
  },
  scoreCardLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreCardRank: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  body: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  lifetimeBox: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  lifetimeCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  lifetimeDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: colors.accent,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  historySession: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  historyLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  historyDate: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  historyNotes: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  historySetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  historySetBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySetBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  historySetReps: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary, fontWeight: '500' },
  historySetWeight: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rangeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    padding: 2,
  },
  rangeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  rangeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  chartTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  chartEmptyNote: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tooltipBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    alignItems: 'center',
  },
  tooltipDate: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  tooltipValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  axisLabel: { fontSize: 9, color: colors.textSecondary },
  deleteBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
