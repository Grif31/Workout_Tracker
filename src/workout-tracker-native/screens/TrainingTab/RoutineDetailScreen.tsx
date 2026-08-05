import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { TrainingStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { apiFetch } from '../../utils/api';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'RoutineDetail'>;

type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; exercise_type?: string };

const parseRepsMin = (reps: string): string => {
  const m = (reps ?? '').match(/^(\d+)/);
  return m ? m[1] : '';
};

type ProgrammingEntry = { exercise_template_id: number; sets: number; reps: string; rpe?: number | null };
type RoutineDay = {
  id: number;
  day_order: number;
  label: string;
  workout_template: { id: number; name: string; exercises: Exercise[]; programming_json?: string | null };
};
type Routine = {
  id: number;
  name: string;
  description?: string;
  days: RoutineDay[];
};

const DESC_COLLAPSE_LENGTH = 120;

export default function RoutineDetailScreen({ route, navigation }: Props) {
  const { routineId, routineName } = route.params;
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);

  const isActive = user?.active_routine_id === routineId;

  const fetchRoutine = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/routines/${routineId}`);
      if (res.ok) {
        setRoutine(await res.json());
      } else {
        Alert.alert('Error', 'Failed to load routine');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchRoutine(); }, [routineId]));

  const handleDelete = () => {
    Alert.alert('Delete Routine', `Delete "${routineName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/routines/${routineId}`, { method: 'DELETE' });
            if (res.ok) navigation.goBack();
            else Alert.alert('Error', 'Failed to delete routine');
          } catch {
            Alert.alert('Error', 'Something went wrong');
          }
        },
      },
    ]);
  };

  const handleToggleActive = async () => {
    const url = isActive ? '/api/routines/deactivate' : `/api/routines/${routineId}/activate`;
    try {
      const res = await apiFetch(url, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        updateUser({ active_routine_id: data.active_routine_id });
      } else {
        Alert.alert('Error', 'Failed to update active routine');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const showMenu = () => {
    Alert.alert(
      routine?.name ?? routineName,
      undefined,
      [
        { text: isActive ? 'Deactivate' : 'Set as Active', onPress: handleToggleActive },
        { text: 'Edit', onPress: () => navigation.navigate('CreateRoutine', { routineId, routineName }) },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.save} />
      </View>
    );
  }

  if (!routine) return null;

  const desc = routine.description ?? '';
  const descLong = desc.length > DESC_COLLAPSE_LENGTH;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={showMenu} style={styles.menuBtn} hitSlop={8} testID="menu-btn">
          <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={routine.days}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.routineInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.routineName}>{routine.name}</Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
            {desc ? (
              <>
                <Text style={styles.routineDesc} numberOfLines={descExpanded ? undefined : 3}>
                  {desc}
                </Text>
                {descLong && (
                  <TouchableOpacity onPress={() => setDescExpanded(v => !v)} style={styles.seeMoreBtn}>
                    <Text style={styles.seeMoreText}>{descExpanded ? 'See less' : 'See more'}</Text>
                    <Ionicons
                      name={descExpanded ? 'chevron-up' : 'chevron-down'}
                      size={13}
                      color={colors.accent}
                    />
                  </TouchableOpacity>
                )}
              </>
            ) : null}
            <Text style={styles.dayCount}>
              {routine.days.length} {routine.days.length === 1 ? 'day' : 'days'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{item.label}</Text>
              <TouchableOpacity
                style={styles.logBtn}
                onPress={() => {
                  let progMap = new Map<number, ProgrammingEntry>();
                  if (item.workout_template.programming_json) {
                    try {
                      const parsed: ProgrammingEntry[] = JSON.parse(item.workout_template.programming_json);
                      for (const p of parsed) progMap.set(p.exercise_template_id, p);
                    } catch { }
                  }
                  navigation.navigate('LogRoutine', {
                    prefill: {
                      name: item.label,
                      notes: '',
                      exercises: item.workout_template.exercises.map(ex => {
                        const prog = progMap.get(ex.id);
                        return {
                          name: ex.name,
                          exercise_template_id: ex.id,
                          exercise_type: ex.exercise_type ?? 'strength',
                          muscle_group: ex.muscle_group,
                          equipment: ex.equipment,
                          sets: prog
                            ? Array(prog.sets).fill(null).map(() => ({
                                reps: parseRepsMin(prog.reps),
                                weight: '',
                                rpe: prog.rpe != null ? String(prog.rpe) : undefined,
                              }))
                            : [{ reps: '', weight: '' }],
                        };
                      }),
                    },
                  });
                }}
              >
                <Text style={styles.logBtnText}>Log</Text>
              </TouchableOpacity>
            </View>

            {item.workout_template.exercises.length === 0 ? (
              <Text style={styles.noExercises}>No exercises</Text>
            ) : (
              item.workout_template.exercises.map(ex => (
                <View key={ex.id} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMuscle}>{ex.muscle_group}</Text>
                </View>
              ))
            )}
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  menuBtn: { padding: spacing.xs },

  routineInfo: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  routineName: { fontSize: typography.fontSize.xl, fontWeight: 'bold', color: colors.textPrimary },
  activeBadge: {
    backgroundColor: colors.save + '22',
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.save,
  },
  activeBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.save },
  routineDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  seeMoreText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.accent },
  dayCount: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },

  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dayLabel: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  logBtn: {
    backgroundColor: colors.save,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  logBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseName: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  exerciseMuscle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  noExercises: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
});
