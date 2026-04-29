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
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { ExercisesStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'RoutineDetail'>;

type Exercise = { id: number; name: string; muscle_group: string };
type RoutineDay = {
  id: number;
  day_order: number;
  label: string;
  workout_template: { id: number; name: string; exercises: Exercise[] };
};
type Routine = {
  id: number;
  name: string;
  description?: string;
  days: RoutineDay[];
};

export default function RoutineDetailScreen({ route, navigation }: Props) {
  const { routineId, routineName } = route.params;
  const { token, user, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);

  const isActive = user?.active_routine_id === routineId;

  const fetchRoutine = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/routines/${routineId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  useFocusEffect(useCallback(() => { fetchRoutine(); }, [routineId, token]));

  const handleDelete = () => {
    Alert.alert('Delete Routine', `Delete "${routineName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/routines/${routineId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              navigation.goBack();
            } else {
              Alert.alert('Error', 'Failed to delete routine');
            }
          } catch {
            Alert.alert('Error', 'Something went wrong');
          }
        },
      },
    ]);
  };

  const handleToggleActive = async () => {
    if (!token) return;
    const url = isActive
      ? `${API_URL}/api/routines/deactivate`
      : `${API_URL}/api/routines/${routineId}/activate`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.save} />
      </View>
    );
  }

  if (!routine) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.routineName}>{routine.name}</Text>
          {routine.description ? (
            <Text style={styles.routineDesc}>{routine.description}</Text>
          ) : null}
          <Text style={styles.dayCount}>
            {routine.days.length} {routine.days.length === 1 ? 'day' : 'days'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <TouchableOpacity onPress={handleToggleActive}>
            <Text style={isActive ? styles.deactivateText : styles.activateText}>
              {isActive ? 'Deactivate' : 'Set as Active'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={routine.days}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{item.label}</Text>
              <TouchableOpacity
                style={styles.logBtn}
                onPress={() => navigation.navigate('LogRoutine', {
                  prefill: {
                    name: item.label,
                    notes: '',
                    exercises: item.workout_template.exercises.map(ex => ({
                      name: ex.name,
                      sets: [{ reps: '', weight: '' }],
                    })),
                  },
                })}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  routineName: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.textPrimary },
  routineDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  dayCount: { fontSize: typography.fontSize.sm, color: '#aaa', marginTop: spacing.xs },
  deleteText: { color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600', marginTop: 4 },
  activateText: { color: colors.save, fontSize: typography.fontSize.sm, fontWeight: '600', marginTop: 4 },
  deactivateText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: '600', marginTop: 4 },
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
  logBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
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
