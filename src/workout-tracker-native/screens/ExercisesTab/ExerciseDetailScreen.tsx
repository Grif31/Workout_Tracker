import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { ExercisesStackParamsList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExerciseDetail'>;
type WorkoutSet = { reps: number; weight: number };
type WorkoutExercise = { id: number; name: string; sets: WorkoutSet[] };
type WorkoutHistoryItem = {
  workoutId: number;
  workoutName: string;
  date: string;
  exerciseName: string;
  sets: WorkoutSet[];
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
  const { token } = useAuth();
  const {
    exerciseId,
    exerciseName,
    equipment,
    muscleGroup,
    secondaryMuscleGroup,
    description,
    imageUrl,
  } = route.params;

  const [activeTab, setActiveTab] = useState<'about' | 'stats' | 'history'>('about');
  const [loading, setLoading] = useState(true);
  const [historyItems, setHistoryItems] = useState<WorkoutHistoryItem[]>([]);
  const [wgerDescription, setWgerDescription] = useState<string | null>(null);
  const [wgerLoading, setWgerLoading] = useState(false);
  const [wgerError, setWgerError] = useState<string | null>(null);

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const fetchExerciseHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workouts?include_exercises=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const workouts = await res.json();
      const items: WorkoutHistoryItem[] = [];

      workouts.forEach((workout: any) => {
        if (!workout.exercises) return;
        workout.exercises.forEach((ex: WorkoutExercise) => {
          if (exerciseName && ex.name !== exerciseName) return;
          items.push({
            workoutId: workout.id,
            workoutName: workout.name || 'Workout',
            date: workout.date,
            exerciseName: ex.name,
            sets: ex.sets || [],
          });
        });
      });

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistoryItems(items);
    } catch (err) {
      console.error('Failed to load exercise history', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseName, token]);

  const fetchWgerDetails = useCallback(async () => {
    if (!exerciseName) return;
    setWgerLoading(true);
    setWgerError(null);

    try {
      const query = encodeURIComponent(exerciseName);
      const res = await fetch(`https://wger.de/api/v2/exercise?language=2&search=${query}`);
      if (!res.ok) {
        throw new Error('Wger API error');
      }

      const data = await res.json();
      const result = Array.isArray(data.results) ? data.results[0] : null;
      if (result) {
        const rawDescription = result.description || '';
        setWgerDescription(stripHtml(rawDescription));
      }
    } catch (err) {
      console.warn('Wger fetch failed:', err);
      setWgerError('Exercise details are unavailable right now.');
    } finally {
      setWgerLoading(false);
    }
  }, [exerciseName]);

  useEffect(() => {
    fetchExerciseHistory();
    fetchWgerDetails();
  }, [fetchExerciseHistory, fetchWgerDetails]);

  const allSets = useMemo(() => {
    return historyItems.flatMap(item =>
      item.sets.map((set, index) => ({
        ...set,
        workoutId: item.workoutId,
        workoutName: item.workoutName,
        date: item.date,
        setIndex: index + 1,
        volume: (set.reps || 0) * (set.weight || 0),
      }))
    );
  }, [historyItems]);

  const stats = useMemo(() => {
    const totalSets = allSets.length;
    const totalReps = allSets.reduce((sum, set) => sum + (set.reps || 0), 0);
    const workoutCount = new Set(allSets.map(set => set.workoutId)).size;
    const maxWeight = allSets.reduce((max, set) => Math.max(max, set.weight || 0), 0);
    const maxReps = allSets.reduce((max, set) => Math.max(max, set.reps || 0), 0);
    const maxVolume = allSets.reduce((max, set) => Math.max(max, set.volume || 0), 0);
    const estimatedOneRepMax = allSets.reduce((max, set) => {
      const oneRm = set.weight * (1 + (set.reps || 0) / 30);
      return Math.max(max, oneRm);
    }, 0);

    return {
      totalSets,
      totalReps,
      workoutCount,
      maxWeight,
      maxReps,
      maxVolume,
      estimatedOneRepMax,
    };
  }, [allSets]);

  const exerciseDescription =
    wgerLoading
      ? 'Loading exercise details...'
      : wgerDescription || description || exerciseDescriptions[muscleGroup] || defaultDescription;

  const renderHistory = () => {
    if (loading) {
      return <ActivityIndicator size="large" color={colors.save} />;
    }

    if (allSets.length === 0) {
      return <Text style={styles.emptyText}>No recorded sets for this exercise yet.</Text>;
    }

    return allSets.map((set, index) => (
      <View key={`${set.workoutId}-${index}`} style={styles.historyRow}>
        <View style={styles.historyMeta}>
          <Text style={styles.historyLabel}>{set.workoutName}</Text>
          <Text style={styles.historyDate}>{new Date(set.date).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.historyDetail}>
          Set {set.setIndex}: {set.reps} reps @ {set.weight} lbs
        </Text>
        <Text style={styles.historyDetail}>Volume: {set.volume}</Text>
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
              {wgerError ? (
                <Text style={styles.body}>{wgerError}</Text>
              ) : (
                <Text style={styles.body}>{exerciseDescription}</Text>
              )}
            </View>
          </View>
        )}

        {activeTab === 'stats' && (
          <View style={styles.section}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Estimated 1RM</Text>
                <Text style={styles.statValue}>{stats.estimatedOneRepMax ? `${stats.estimatedOneRepMax.toFixed(0)} lbs` : '—'}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Sets</Text>
                <Text style={styles.statValue}>{stats.totalSets}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Workouts</Text>
                <Text style={styles.statValue}>{stats.workoutCount}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Reps</Text>
                <Text style={styles.statValue}>{stats.totalReps}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Volume</Text>
                <Text style={styles.statValue}>{stats.maxVolume}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Reps</Text>
                <Text style={styles.statValue}>{stats.maxReps}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Weight</Text>
                <Text style={styles.statValue}>{stats.maxWeight.toFixed(0)} lbs</Text>
              </View>
            </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  historyRow: {
    backgroundColor: '#d1d1d1',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
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
  },
});
