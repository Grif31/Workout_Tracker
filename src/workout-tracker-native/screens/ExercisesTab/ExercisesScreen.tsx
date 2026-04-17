import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { ExercisesStackParamsList } from 'navigation/types';
import { colors } from 'theme/colors';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import { equipmentTypes } from '../../constants/equipmentTypes';
import ExerciseListModal from '../../components/ExerciseList';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExercisesHome'>;

type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; image_url?: string };
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
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [showNewExerciseModal, setShowNewExerciseModal] = useState(false);
  const [showMuscleDropdown, setShowMuscleDropdown] = useState(false);
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [recentExercises, setRecentExercises] = useState<string[]>([]);

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

  const fetchRecentExercises = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/stats/recent-exercises`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecentExercises(data.recent);
      }
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
      fetchRecentExercises();
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
    const matchEquipment = selectedEquipment === 'All' || ex.equipment === selectedEquipment;
    return matchSearch && matchMuscle && matchEquipment;
  }), [exerciseList, search, selectedMuscle, selectedEquipment]);

  const recentFiltered = useMemo(() => {
    if (search) return [];
    return recentExercises
      .map(name => exerciseList.find(ex =>
        `${ex.name}${ex.equipment ? ` (${ex.equipment})` : ''}` === name ||
        ex.name === name
      ))
      .filter((ex): ex is Exercise => ex !== undefined)
      .filter(ex => {
        const matchMuscle = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle;
        const matchEquipment = selectedEquipment === 'All' || ex.equipment === selectedEquipment;
        return matchMuscle && matchEquipment;
      })
      .slice(0, 5);
  }, [recentExercises, exerciseList, search, selectedMuscle, selectedEquipment]);

  const renderExerciseCard = ({ item }: { item: Exercise }) => (
    <TouchableOpacity
      style={styles.exerciseCard}
      onPress={() => navigation.navigate('ExerciseDetail', {
        exerciseId: item.id,
        exerciseName: item.name,
        equipment: item.equipment,
        muscleGroup: item.muscle_group,
        imageUrl: item.image_url,
      })}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.exerciseImage} />
      ) : null}
      <View style={item.image_url ? styles.exerciseCardRight : styles.exerciseCardLeft}>
        <Text style={styles.exerciseName}>
          {item.equipment ? `${item.name} (${item.equipment})` : item.name}
        </Text>
        <Text style={styles.exerciseMuscle}>{item.muscle_group}</Text>
      </View>
    </TouchableOpacity>
  );

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
          {/* Top row: Create button + Search bar */}
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.createBtn} onPress={() => setShowNewExerciseModal(true)}>
              <Text style={styles.createBtnText}>Create</Text>
            </TouchableOpacity>
            <View style={styles.searchWrapper}>
              <Ionicons name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search exercises..."
                placeholderTextColor={colors.placeholder}
                value={search}
                onChangeText={setSearch}
              />
              {search !== '' && (
                <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filter row: muscle picker + equipment picker each with clear X */}
          <View style={styles.pickerRow}>
            <View style={styles.pickerGroup}>
              <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowMuscleDropdown(true)}>
                <Text style={styles.dropdownBtnText} numberOfLines={1}>
                  {selectedMuscle === 'All' ? 'All Muscles' : selectedMuscle}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>
              {selectedMuscle !== 'All' && (
                <TouchableOpacity onPress={() => setSelectedMuscle('All')} style={styles.pickerClear}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.pickerGroup}>
              <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowEquipmentDropdown(true)}>
                <Text style={styles.dropdownBtnText} numberOfLines={1}>
                  {selectedEquipment === 'All' ? 'All Equipment' : selectedEquipment}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>
              {selectedEquipment !== 'All' && (
                <TouchableOpacity onPress={() => setSelectedEquipment('All')} style={styles.pickerClear}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Muscle dropdown modal */}
          <Modal visible={showMuscleDropdown} transparent animationType="fade">
            <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowMuscleDropdown(false)}>
              <View style={styles.dropdownList}>
                {['All', ...muscleGroups].map(item => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.dropdownItem, selectedMuscle === item && styles.dropdownItemActive]}
                    onPress={() => { setSelectedMuscle(item); setShowMuscleDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, selectedMuscle === item && styles.dropdownItemTextActive]}>
                      {item === 'All' ? 'All Muscles' : item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Equipment dropdown modal */}
          <Modal visible={showEquipmentDropdown} transparent animationType="fade">
            <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowEquipmentDropdown(false)}>
              <View style={styles.dropdownList}>
                {['All', ...equipmentTypes].map(item => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.dropdownItem, selectedEquipment === item && styles.dropdownItemActive]}
                    onPress={() => { setSelectedEquipment(item); setShowEquipmentDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, selectedEquipment === item && styles.dropdownItemTextActive]}>
                      {item === 'All' ? 'All Equipment' : item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Exercise list - SectionList when no search, FlatList when searching */}
          {search ? (
            <FlatList
              data={filteredExercises}
              keyExtractor={item => item.id.toString()}
              renderItem={renderExerciseCard}
              ListEmptyComponent={<Text style={styles.emptyText}>No exercises found</Text>}
            />
          ) : (
            <SectionList
              sections={[
                ...(recentFiltered.length > 0 ? [{ title: 'Recent Exercises', data: recentFiltered }] : []),
                { title: 'All Exercises', data: filteredExercises },
              ]}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => renderExerciseCard({ item })}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No exercises found</Text>}
            />
          )}

          <ExerciseListModal
            visible={showNewExerciseModal}
            onClose={() => setShowNewExerciseModal(false)}
            exercises={exerciseList}
            onSelect={(_exercise) => {}}
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
          <Text style={styles.trainingSectionHeader}>Templates</Text>
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
          <Text style={[styles.trainingSectionHeader, { marginTop: spacing.md }]}>Routines</Text>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 36,
    justifyContent: 'center',
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: typography.fontSize.sm,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: 4 },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    height: 36,
    padding: 0,
  },
  clearBtn: { padding: 2 },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pickerGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerClear: { padding: 2 },
  dropdownBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 36,
  },
  dropdownBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    flex: 1,
  },
  dropdownArrow: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownList: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    width: '70%',
    maxHeight: '60%',
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: colors.accent,
  },
  dropdownItemText: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
  },
  dropdownItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
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
  exerciseImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: spacing.sm,
  },
  exerciseCardLeft: {
    flex: 1,
  },
  exerciseCardRight: {
    flex: 1,
    justifyContent: 'center',
  },
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
  // Training section headers
  trainingSectionHeader: {
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
