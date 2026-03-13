import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
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
type WorkoutTemplate = { id: number; name: string; exercises: Exercise[] };
type RoutineDay = {
  id: number;
  day_order: number;
  label: string;
  workout_template: { id: number; name: string; exercises: Exercise[] };
};
type Routine = { id: number; name: string; description?: string; day_count: number };
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };

export default function ExercisesScreen({ navigation }: Props) {
  const { token, user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'exercises' | 'training'>('exercises');

  // Exercises tab state
  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [showNewExerciseModal, setShowNewExerciseModal] = useState(false);

  // Training tab state
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [selectModalVisible, setSelectModalVisible] = useState(false);

  const fetchExercises = async () => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      if (!res.ok) { Alert.alert('Error', 'Failed to load exercises'); return; }
      setExerciseList(await res.json());
    } catch {
      Alert.alert('Error', 'Failed to load exercises');
    }
  };

  const fetchTemplates = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/workout-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTemplates(await res.json());
    } catch {
      // silently fail
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

  const fetchActiveRoutine = async () => {
    if (!token || !user?.active_routine_id) {
      setActiveRoutine(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/routines/${user.active_routine_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setActiveRoutine(await res.json());
    } catch {
      // silently fail
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExercises();
      fetchTemplates();
      fetchRoutines();
      fetchActiveRoutine();
    }, [token, user?.active_routine_id])
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

  const activateRoutine = async (routineId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/routines/${routineId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        updateUser({ active_routine_id: data.active_routine_id });
        setSelectModalVisible(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to set active routine');
    }
  };

  const handleActiveBlockPress = () => {
    if (routines.length === 0) {
      navigation.navigate('CreateRoutine');
    } else {
      setSelectModalVisible(true);
    }
  };

  const filteredExercises = useMemo(() => exerciseList.filter(ex => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchMuscle = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle;
    return matchSearch && matchMuscle;
  }), [exerciseList, search, selectedMuscle]);

  return (
    <View style={styles.container}>
      {/* Outer tab toggle */}
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
          style={[styles.tabBtn, activeTab === 'training' && styles.tabBtnActive]}
          onPress={() => setActiveTab('training')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'training' && styles.tabBtnTextActive]}>
            Training
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
            ListEmptyComponent={<Text style={styles.emptyText}>No exercises found</Text>}
          />

          <TouchableOpacity style={styles.addButton} onPress={() => setShowNewExerciseModal(true)}>
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
        <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: spacing.lg }}>
          {/* Active Routine Block */}
          <TouchableOpacity
            style={styles.activeBlock}
            onPress={!activeRoutine ? handleActiveBlockPress : undefined}
            activeOpacity={activeRoutine ? 1 : 0.7}
          >
            <Text style={styles.sectionLabel}>Active Routine</Text>
            {activeRoutine ? (
              <>
                <Text style={styles.activeRoutineName}>{activeRoutine.name}</Text>
                {activeRoutine.days.map(day => (
                  <View key={day.id} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{day.label}</Text>
                    <TouchableOpacity
                      style={styles.logDayBtn}
                      onPress={() => navigation.navigate('LogRoutine', {
                        prefill: {
                          name: day.label,
                          notes: '',
                          exercises: day.workout_template.exercises.map(ex => ({
                            name: ex.name,
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
                {routines.length === 0
                  ? 'No routines yet — tap to create one'
                  : 'No active routine — tap to select one'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Templates Section */}
          <Text style={styles.sectionHeader}>Templates</Text>
          {templates.length === 0 ? (
            <Text style={styles.emptyText}>No templates yet</Text>
          ) : (
            templates.map(t => (
              <TouchableOpacity
                key={t.id}
                style={styles.card}
                onPress={() => navigation.navigate('LogRoutine', {
                  prefill: {
                    name: t.name,
                    notes: '',
                    exercises: t.exercises.map(ex => ({
                      name: ex.name,
                      sets: [{ reps: '', weight: '' }],
                    })),
                  },
                })}
              >
                <Text style={styles.cardName}>{t.name}</Text>
                <Text style={styles.cardSub}>{t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            ))
          )}

          {/* Routines Section */}
          <Text style={[styles.sectionHeader, { marginTop: spacing.md }]}>Routines</Text>
          {routines.length === 0 ? (
            <Text style={styles.emptyText}>No routines yet</Text>
          ) : (
            routines.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => navigation.navigate('RoutineDetail', {
                  routineId: item.id,
                  routineName: item.name,
                })}
              >
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub}>
                  {item.day_count} {item.day_count === 1 ? 'day' : 'days'}
                </Text>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
                ) : null}
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity
            style={styles.newRoutineButton}
            onPress={() => navigation.navigate('CreateRoutine')}
          >
            <Text style={styles.newRoutineButtonText}>+ New Routine</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Routine Picker Modal */}
      <Modal visible={selectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Active Routine</Text>
            <FlatList
              data={routines}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => activateRoutine(item.id)}
                >
                  <Text style={styles.modalItemName}>{item.name}</Text>
                  <Text style={styles.modalItemSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setSelectModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Active Routine block
  activeBlock: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  activeRoutineName: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  logDayBtn: {
    backgroundColor: colors.save,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  logDayBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  // Section headers
  sectionHeader: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  // Template/Routine cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cardDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  newRoutineButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  newRoutineButtonText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },
  // Picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.md,
    borderTopRightRadius: spacing.md,
    padding: spacing.lg,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  modalItemSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalCancel: {
    marginTop: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: typography.fontSize.md, color: colors.danger, fontWeight: '600' },
});
