import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { ExercisesStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toDisplayWeight, toDisplayVolume, convertWeight, WeightUnit } from 'utils/units';

const CHART_WIDTH = Dimensions.get('window').width - spacing.md * 4;

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExerciseDetail'>;

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
};

type ChartPoint = { value: number; label: string; dataPointText: string };

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
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const weightUnit: WeightUnit = (user?.weight_unit as WeightUnit) || 'lbs';
  const {
    exerciseName,
    equipment,
    muscleGroup,
    secondaryMuscleGroup,
    description,
    imageUrl,
  } = route.params;

  const [activeTab, setActiveTab] = useState<'about' | 'stats' | 'history'>('about');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ExerciseStats>({
    estimatedOneRepMax: 0,
    totalSets: 0,
    workoutCount: 0,
    totalReps: 0,
    maxWeight: 0,
    maxReps: 0,
    maxVolume: 0,
  });
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [chart1RM, setChart1RM] = useState<ChartPoint[]>([]);
  const [chartMaxWeight, setChartMaxWeight] = useState<ChartPoint[]>([]);
  const [wgerDescription, setWgerDescription] = useState<string | null>(null);
  const [wgerLoading, setWgerLoading] = useState(false);

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const fetchExerciseData = useCallback(async () => {
    if (!token || !exerciseName) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/stats/exercise?name=${encodeURIComponent(exerciseName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();

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
        };
      });

      // Chart data: history arrives newest-first; reverse for left→right chronological order
      const chronological = [...sessions].reverse().slice(-12);
      const buildPoints = (items: HistorySession[], getter: (s: HistorySession) => number): ChartPoint[] =>
        items
          .filter(s => getter(s) > 0)
          .map(s => {
            const d = new Date(s.date);
            const val = parseFloat(convertWeight(getter(s), weightUnit).toFixed(1));
            return {
              value: val,
              label: `${d.getMonth() + 1}/${d.getDate()}`,
              dataPointText: `${Math.round(val)}`,
            };
          });

      setChart1RM(buildPoints(chronological, s => s.best1rm));
      setChartMaxWeight(buildPoints(chronological, s => s.bestWeight));
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
    } catch (err) {
      console.error('Failed to load exercise data', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseName, token]);

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

  const exerciseDescription =
    wgerLoading
      ? 'Loading exercise details...'
      : wgerDescription || description || exerciseDescriptions[muscleGroup] || defaultDescription;

  const renderChart = (points: ChartPoint[], title: string) => {
    if (points.length < 2) return null;
    const maxVal = Math.max(...points.map(p => p.value));
    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        <LineChart
          data={points}
          width={CHART_WIDTH}
          height={140}
          spacing={Math.max(30, Math.floor(CHART_WIDTH / points.length))}
          color={colors.save}
          thickness={2}
          hideDataPoints={false}
          dataPointsColor={colors.save}
          startFillColor={colors.save}
          endFillColor="#fff"
          startOpacity={0.15}
          endOpacity={0}
          areaChart
          curved
          hideRules
          hideYAxisText
          xAxisLabelTextStyle={styles.axisLabel}
          noOfSections={4}
          maxValue={maxVal * 1.2}
          initialSpacing={10}
          endSpacing={10}
          textShiftY={-8}
          textFontSize={10}
          textColor={colors.textSecondary}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisThickness={0}
          isAnimated
        />
      </View>
    );
  };

  const renderStats = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (stats.totalSets === 0) {
      return <Text style={styles.emptyText}>Log this exercise to see your stats.</Text>;
    }
    return (
      <View>
        {renderChart(chart1RM, `Estimated 1RM over time (${weightUnit})`)}
        {renderChart(chartMaxWeight, `Max weight over time (${weightUnit})`)}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Estimated 1RM</Text>
            <Text style={styles.statValue}>{toDisplayWeight(stats.estimatedOneRepMax, weightUnit)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Max Weight</Text>
            <Text style={styles.statValue}>{toDisplayWeight(stats.maxWeight, weightUnit)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Max Volume / Set</Text>
            <Text style={styles.statValue}>{toDisplayVolume(stats.maxVolume, weightUnit)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Max Reps</Text>
            <Text style={styles.statValue}>{stats.maxReps || '—'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Sets</Text>
            <Text style={styles.statValue}>{stats.totalSets}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Reps</Text>
            <Text style={styles.statValue}>{stats.totalReps}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Workouts</Text>
            <Text style={styles.statValue}>{stats.workoutCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderHistory = () => {
    if (loading) return <ActivityIndicator size="large" color={colors.save} />;
    if (historySessions.length === 0) {
      return <Text style={styles.emptyText}>No recorded sets for this exercise yet.</Text>;
    }
    return historySessions.map((session, i) => (
      <View key={i} style={styles.historySession}>
        <View style={styles.historyMeta}>
          <Text style={styles.historyLabel}>{session.workoutName}</Text>
          <Text style={styles.historyDate}>{new Date(session.date).toLocaleDateString()}</Text>
        </View>
        {session.sets.map((set, j) => (
          <Text key={j} style={styles.historyDetail}>
            Set {j + 1}: {set.reps} reps @ {toDisplayWeight(set.weight, weightUnit)}
          </Text>
        ))}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.exerciseImage} />
        ) : null}

        <Text style={styles.title}>{exerciseName}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Primary</Text>
            <Text style={styles.metaValue}>{muscleGroup}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Equipment</Text>
            <Text style={styles.metaValue}>{equipment ?? 'Bodyweight'}</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {tabLabels.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'about' && (
          <View style={styles.section}>
            <View style={styles.diagramCard}>
              <View style={styles.diagramLabelRow}>
                <Text style={styles.sectionTitle}>Muscle Diagram</Text>
              </View>
              <View style={styles.diagram}>
                <View style={[styles.muscleBubble, styles.primaryBubble]}>
                  <Text style={styles.bubbleText}>{muscleGroup}</Text>
                </View>
                {secondaryMuscleGroup ? (
                  <View style={[styles.muscleBubble, styles.secondaryBubble]}>
                    <Text style={styles.bubbleText}>{secondaryMuscleGroup}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>How to perform</Text>
              <Text style={styles.body}>{exerciseDescription}</Text>
            </View>
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
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  closeButton: {
    padding: spacing.sm,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  exerciseImage: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    marginBottom: spacing.md,
    backgroundColor: '#f2f2f2',
  },
  title: {
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metaPill: {
    flex: 1,
    backgroundColor: '#d1d1d1',
    padding: spacing.sm,
    borderRadius: 14,
  },
  metaLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    backgroundColor: '#ededed',
    marginHorizontal: spacing.xs / 2,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
  },
  tabBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#fff',
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
    backgroundColor: '#d1d1d1',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  diagramCard: {
    backgroundColor: '#d1d1d1',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  diagramLabelRow: {
    marginBottom: spacing.sm,
  },
  diagram: {
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  muscleBubble: {
    minWidth: 120,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBubble: {
    backgroundColor: '#ff6b6b',
  },
  secondaryBubble: {
    backgroundColor: '#4a90e2',
  },
  bubbleText: {
    color: '#fff',
    fontWeight: '700',
  },
  body: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statCard: {
    flexBasis: '48%',
    backgroundColor: '#d1d1d1',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statLabel: {
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.sm,
  },
  statValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  historySession: {
    backgroundColor: '#d1d1d1',
    borderRadius: 16,
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
  historyDetail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    paddingVertical: 2,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chartTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  axisLabel: { fontSize: 9, color: colors.textSecondary },
});
