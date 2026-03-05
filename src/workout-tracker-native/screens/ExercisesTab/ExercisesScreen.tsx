import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { ExercisesStackParamsList } from 'navigation/types';
import { colors } from 'theme/colors';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import ExerciseListModal from '../../components/ExerciseList';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExercisesHome'>;

type Exercise = { id: number; name: string; muscle_group: string };
type Routine = { id: number; name: string; description?: string; day_count: number };

export default function ExercisesScreen({ navigation }: Props) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'exercises' | 'routines'>('exercises');

  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [showNewExerciseModal, setShowNewExerciseModal] = useState(false);

  const [routines, setRoutines] = useState<Routine[]>([]);

  const fetchExercises = async () => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      if (!res.ok) { Alert.alert('Error', 'Failed to load exercises'); return; }
      setExerciseList(await res.json());
    } catch {
      Alert.alert('Error', 'Failed to load exercises');
    }
  };

  const fetchRoutines = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/routines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setRoutines(await res.json());
    } catch {
      // silently fail
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExercises();
      fetchRoutines();
    }, [token])
  );

  const addNewExercise = async (name: string, muscle: string) => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchExercises();
        Alert.alert('Success', 'Exercise added');
      } else {
        Alert.alert('Error', data.message || 'Failed to add exercise');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const filteredExercises = exerciseList.filter(ex => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchMuscle = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle;
    return matchSearch && matchMuscle;
  });

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'exercises' && styles.tabBtnActive]}
          onPress={() => setActiveTab('exercises')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'exercises' && styles.tabBtnTextActive]}>
            Exercises
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'routines' && styles.tabBtnActive]}
          onPress={() => setActiveTab('routines')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'routines' && styles.tabBtnTextActive]}>
            Routines
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'exercises' ? (
        <View style={styles.tabContent}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises..."
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
          />

          <FlatList
            data={['All', ...muscleGroups]}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item}
            style={styles.muscleFilter}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.muscleChip, selectedMuscle === item && styles.muscleChipActive]}
                onPress={() => setSelectedMuscle(item)}
              >
                <Text style={[styles.muscleChipText, selectedMuscle === item && styles.muscleChipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />

          <FlatList
            data={filteredExercises}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.exerciseCard}>
                <Text style={styles.exerciseName}>{item.name}</Text>
                <Text style={styles.exerciseMuscle}>{item.muscle_group}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No exercises found</Text>
            }
          />

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowNewExerciseModal(true)}
          >
            <Text style={styles.addButtonText}>+ New Exercise</Text>
          </TouchableOpacity>

          <ExerciseListModal
            visible={showNewExerciseModal}
            onClose={() => setShowNewExerciseModal(false)}
            exercises={exerciseList}
            onSelect={() => {}}
            onAddExercise={(name, muscle) => {
              addNewExercise(name, muscle);
              setShowNewExerciseModal(false);
            }}
            muscleGroups={muscleGroups}
          />
        </View>
      ) : (
        <View style={styles.tabContent}>
          <TouchableOpacity
            style={styles.newRoutineButton}
            onPress={() => navigation.navigate('CreateRoutine')}
          >
            <Text style={styles.newRoutineButtonText}>+ New Routine</Text>
          </TouchableOpacity>

          <FlatList
            data={routines}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.routineCard}
                onPress={() => navigation.navigate('RoutineDetail', {
                  routineId: item.id,
                  routineName: item.name,
                })}
              >
                <Text style={styles.routineName}>{item.name}</Text>
                <Text style={styles.routineDays}>
                  {item.day_count} {item.day_count === 1 ? 'day' : 'days'}
                </Text>
                {item.description ? (
                  <Text style={styles.routineDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No routines yet. Tap &ldquo;+ New Routine&rdquo; to get started.
              </Text>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: 'row',
    margin: spacing.md,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabBtnActive: { backgroundColor: colors.accent },
  tabBtnText: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textSecondary },
  tabBtnTextActive: { color: '#fff' },
  tabContent: { flex: 1, paddingHorizontal: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  muscleFilter: { marginBottom: spacing.sm, flexGrow: 0 },
  muscleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muscleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  muscleChipText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  muscleChipTextActive: { color: '#fff' },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  exerciseMuscle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  addButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  addButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  newRoutineButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  newRoutineButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  routineCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  routineName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  routineDays: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  routineDescription: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#fff', marginTop: spacing.lg, fontSize: typography.fontSize.md },
});
