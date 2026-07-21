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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, resolveMediaUrl } from '../../utils/api';
import { ExerciseDetailParams } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayWeight, toDisplayVolume, convertWeight, WeightUnit } from 'utils/units';
import MuscleDiagram from '../../components/MuscleDiagram';

const SCREEN_WIDTH  = Dimensions.get('window').width;
const CHART_WIDTH   = SCREEN_WIDTH - spacing.md * 4;
const TAB_SLIDE_WIDTH = (SCREEN_WIDTH - spacing.md * 2) / 3;


type Props = {
  route: { params: ExerciseDetailParams };
  navigation: { goBack: () => void };
};

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

const tabLabels: Array<{ key: 'about' | 'stats' | 'history'; label: string }> = [
  { key: 'about', label: 'About' },
  { key: 'stats', label: 'Stats' },
  { key: 'history', label: 'History' },
];

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
  } = route.params;

  const [activeTab, setActiveTab] = useState<'about' | 'stats' | 'history'>('about');
  const [loading, setLoading] = useState(true);
  const [exerciseType, setExerciseType] = useState<'strength' | 'cardio'>('strength');
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
  const [wgerDescription, setWgerDescription] = useState<string | null>(null);
  const [wgerLoading, setWgerLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const statAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const histAnims = useRef<Animated.Value[]>([]);
  const sliderX = tabAnimRef.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, TAB_SLIDE_WIDTH, TAB_SLIDE_WIDTH * 2],
  });

  const handleTabChange = (tab: 'about' | 'stats' | 'history') => {
    const idx = tab === 'about' ? 0 : tab === 'stats' ? 1 : 2;
    Animated.timing(tabAnimRef, { toValue: idx, duration: 200, useNativeDriver: true }).start();
    Animated.timing(contentFadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      Animated.timing(contentFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const fetchExerciseData = useCallback(async () => {
    if (!exerciseName) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/stats/exercise?name=${encodeURIComponent(exerciseName)}&exercise_template_id=${exerciseId}`);
      if (!res.ok) return;
      const data = await res.json();

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
      let maxVolume = 0;
      const sessions: HistorySession[] = (data.history ?? []).map((item: any) => {
        (item.sets ?? []).forEach((s: { reps: number; weight: number }) => {
          const vol = (s.reps || 0) * (s.weight || 0);
          if (vol > maxVolume) maxVolume = vol;
        });
        return {
          date: item.date,
          workoutName: item.workout_name || 'Workout',
          sets: item.sets ?? [],
          best1rm: item.best_1rm ?? 0,
          bestWeight: item.best_set?.weight ?? 0,
          notes: item.notes || undefined,
        };
      });

      setHistorySessions(sessions);
      setStats({
        estimatedOneRepMax: data.personal_bests?.estimated_1rm ?? 0,
        maxWeight: data.personal_bests?.max_weight ?? 0,
        maxReps: data.personal_bests?.most_reps ?? 0,
        totalSets: data.totals?.total_sets ?? 0,
        totalReps: data.totals?.total_reps ?? 0,
        workoutCount: data.totals?.total_workouts ?? 0,
        maxVolume,
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
    const sessionVolume = (s: HistorySession) =>
      s.sets.reduce((sum, st) => sum + (st.reps || 0) * (st.weight || 0), 0);

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
      vol: chrono.filter(s => sessionVolume(s) > 0).length >= 2,
    });
    setChart1RM(buildPoints(inRange, s => s.best1rm));
    setChartMaxWeight(buildPoints(inRange, s => s.bestWeight));
    setChartVolume(buildPoints(inRange, sessionVolume));
  }, [historySessions, chartRange, weightUnit]);

  useEffect(() => {
    if (activeTab !== 'stats' || stats.totalSets === 0) return;
    statAnims.forEach(a => a.setValue(0));
    Animated.stagger(50, statAnims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true })
    )).start();
  }, [activeTab]);

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

  const fetchWgerDetails = useCallback(async () => {
    if (!exerciseName) return;
    setWgerLoading(true);
    try {
      const query = encodeURIComponent(exerciseName);
      const res = await fetch(`https://wger.de/api/v2/exercise?language=2&search=${query}`);
      if (res.ok) {
        const data = await res.json();
        const result = Array.isArray(data.results) ? data.results[0] : null;
        if (result?.description) {
          setWgerDescription(stripHtml(result.description));
        }
      }
    } catch {
      // silently fall back to local description
    } finally {
      setWgerLoading(false);
    }
  }, [exerciseName]);

  useEffect(() => {
    fetchExerciseData();
    fetchWgerDetails();
  }, [fetchExerciseData, fetchWgerDetails]);

  const isCardio = muscleGroup === 'Cardio';
  const muscles = isCardio ? [] : (muscleGroup?.split(',').map((m: string) => m.trim()).filter(Boolean) ?? []);
  const primaryMuscle = muscles[0] ?? muscleGroup ?? '';
  const secondaryMuscles = muscles.slice(1);

  const exerciseDescription =
    wgerLoading
      ? 'Loading exercise details...'
      : wgerDescription || description || (muscleGroup ? exerciseDescriptions[muscleGroup] : null) || defaultDescription;

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

  const fmtPace = (pace: number) => {
    const m = Math.floor(pace);
    const s = Math.round((pace - m) * 60);
    return `${m}:${String(s).padStart(2, '0')} /km`;
  };

  const renderCardioStats = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (!cardioStats || cardioStats.session_count === 0) {
      return <Text style={styles.emptyText}>Log this exercise to see your stats.</Text>;
    }
    const { total_distance, total_duration, session_count, avg_pace } = cardioStats;
    return (
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Distance</Text>
          <Text style={styles.statValue}>{total_distance.toFixed(2)} km</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Time</Text>
          <Text style={styles.statValue}>{Math.round(total_duration)} min</Text>
        </View>
        {avg_pace != null && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Pace</Text>
            <Text style={styles.statValue}>{fmtPace(avg_pace)}</Text>
          </View>
        )}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Sessions</Text>
          <Text style={styles.statValue}>{session_count}</Text>
        </View>
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
              if (bout.intensity) parts.push(`@ ${fmtPace(bout.intensity)}`);
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
      return <Text style={styles.emptyText}>Log this exercise to see your stats.</Text>;
    }
    const strengthStatData = [
      { label: 'Estimated 1RM', value: stats.estimatedOneRepMax ? toDisplayWeight(stats.estimatedOneRepMax, weightUnit) : '—' },
      { label: 'Max Weight',    value: stats.maxWeight ? toDisplayWeight(stats.maxWeight, weightUnit) : '—' },
      { label: 'Max Vol / Set', value: stats.maxVolume ? toDisplayVolume(stats.maxVolume, weightUnit) : '—' },
      { label: 'Max Reps',      value: String(stats.maxReps || '—') },
      { label: 'Total Sets',    value: String(stats.totalSets) },
      { label: 'Total Reps',    value: String(stats.totalReps) },
      { label: 'Workouts',      value: String(stats.workoutCount) },
    ];
    return (
      <View>
        <View style={styles.statsGrid}>
          {strengthStatData.map((s, i) => (
            <Animated.View
              key={i}
              style={[styles.statCard, {
                opacity: statAnims[i],
                transform: [{ scale: statAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
              }]}
            >
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </Animated.View>
          ))}
        </View>
        {(hasChartData.oneRm || hasChartData.maxW || hasChartData.vol) && (
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
        )}
        {renderChart(chart1RM, `Estimated 1RM over time (${weightUnit})`, colors.accent, hasChartData.oneRm)}
        {renderChart(chartMaxWeight, `Max weight over time (${weightUnit})`, colors.save, hasChartData.maxW)}
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
          {tabLabels.map((tab, idx) => (
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
          <Animated.View style={[styles.tabSlider, { backgroundColor: colors.accent, transform: [{ translateX: sliderX }] }]} />
        </View>

        <Animated.View style={{ opacity: contentFadeAnim }}>
          {activeTab === 'about' && (
            <View style={styles.section}>
              {/* Primary / secondary muscles */}
              {!isCardio && (primaryMuscle || secondaryMuscles.length > 0) && (
                <View style={styles.muscleRow}>
                  {primaryMuscle ? (
                    <View style={styles.musclePill}>
                      <Text style={styles.musclePillLabel}>Primary</Text>
                      <Text style={styles.musclePillValue}>{primaryMuscle}</Text>
                    </View>
                  ) : null}
                  {secondaryMuscles.length > 0 && (
                    <View style={styles.musclePill}>
                      <Text style={styles.musclePillLabel}>Also Works</Text>
                      <Text style={styles.musclePillValue}>{secondaryMuscles.join(', ')}</Text>
                    </View>
                  )}
                </View>
              )}

              {!isCardio && (
                <View style={styles.diagramCard}>
                  <MuscleDiagram muscles={muscles} />
                </View>
              )}

              <View style={styles.card}>
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
            </View>
          )}

          {activeTab === 'stats' && (
            <View style={styles.section}>
              {renderStats()}
            </View>
          )}

          {activeTab === 'history' && (
            <View style={styles.section}>
              {renderHistory()}
            </View>
          )}
        </Animated.View>
        </View>
      </ScrollView>
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
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: TAB_SLIDE_WIDTH,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    borderRadius: 14,
  },
  musclePillLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
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
  sectionTitle: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  diagramCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    marginBottom: spacing.sm,
  },
  statCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: colors.accent,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
    textAlign: 'center',
  },
  statValue: {
    fontSize: typography.fontSize.md,
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
  historyDetail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    paddingVertical: 2,
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
