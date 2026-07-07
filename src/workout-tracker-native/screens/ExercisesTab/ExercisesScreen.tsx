import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SectionList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ExercisesStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import { equipmentTypes } from '../../constants/equipmentTypes';
import NewExerciseForm from '../../components/NewExerciseForm';
import { apiFetch } from '../../utils/api';

function SectionRule({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.xs }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: spacing.sm }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
    </View>
  );
}

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExercisesHome'>;

type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string; is_custom?: boolean };

export default function ExercisesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [showNewExerciseModal, setShowNewExerciseModal] = useState(false);
  const [showMuscleDropdown, setShowMuscleDropdown] = useState(false);
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [recentExercises, setRecentExercises] = useState<{ name: string; exercise_template_id: number | null }[]>([]);
  const muscleRef = useRef<View>(null);
  const equipRef  = useRef<View>(null);
  const [muscleAnchor, setMuscleAnchor] = useState({ x: 0, y: 0, width: 0 });
  const [equipAnchor,  setEquipAnchor]  = useState({ x: 0, y: 0, width: 0 });

  const openMuscle = () => {
    muscleRef.current?.measure((_fx, _fy, width, height, px, py) => {
      setMuscleAnchor({ x: px, y: py + height + 4, width });
      setShowMuscleDropdown(true);
    });
  };

  const openEquip = () => {
    equipRef.current?.measure((_fx, _fy, width, height, px, py) => {
      setEquipAnchor({ x: px, y: py + height + 4, width });
      setShowEquipmentDropdown(true);
    });
  };

  const fetchExercises = async () => {
    try {
      const res = await apiFetch('/api/exercises');
      if (!res.ok) { Alert.alert('Error', 'Failed to load exercises'); return; }
      setExerciseList(await res.json());
    } catch {
      Alert.alert('Error', 'Failed to load exercises');
    }
  };

  const fetchRecentExercises = async () => {
    try {
      const res = await apiFetch('/api/stats/recent-exercises');
      if (res.ok) {
        const data = await res.json();
        setRecentExercises(data.recent);
      }
    } catch { }
  };

  useFocusEffect(useCallback(() => {
    fetchExercises();
    fetchRecentExercises();
  }, []));

  const addNewExercise = async (name: string, muscle: string, equipment: string) => {
    try {
      const res = await apiFetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle, equipment }),
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

  const filteredExercises = useMemo(() => exerciseList.filter(ex => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    if (selectedMuscle === 'Cardio') return matchSearch && ex.exercise_type === 'cardio';
    if (ex.exercise_type === 'cardio') return false;
    const matchMuscle = selectedMuscle === 'All' || ex.muscle_group?.split(',').map(m => m.trim()).includes(selectedMuscle);
    const matchEquipment = selectedEquipment === 'All' || ex.equipment === selectedEquipment;
    return matchSearch && matchMuscle && matchEquipment;
  }), [exerciseList, search, selectedMuscle, selectedEquipment]);

  const recentFiltered = useMemo(() => {
    if (search) return [];
    return recentExercises
      .map(recent =>
        recent.exercise_template_id != null
          ? exerciseList.find(ex => ex.id === recent.exercise_template_id)
          : exerciseList.find(ex => ex.name === recent.name && !ex.equipment)
              ?? exerciseList.find(ex => ex.name === recent.name)
      )
      .filter((ex): ex is Exercise => ex !== undefined)
      .filter(ex => {
        if (selectedMuscle === 'Cardio') return ex.exercise_type === 'cardio';
        if (ex.exercise_type === 'cardio') return false;
        const matchMuscle = selectedMuscle === 'All' || ex.muscle_group?.split(',').map(m => m.trim()).includes(selectedMuscle);
        const matchEquipment = selectedEquipment === 'All' || ex.equipment === selectedEquipment;
        return matchMuscle && matchEquipment;
      })
      .slice(0, 5);
  }, [recentExercises, exerciseList, search, selectedMuscle, selectedEquipment]);

  const renderExerciseCard = ({ item }: { item: Exercise }) => {
    const isCardio = item.exercise_type === 'cardio';
    const primaryMuscle = isCardio ? 'Cardio' : (item.muscle_group?.split(',')[0]?.trim() ?? '');
    return (
      <TouchableOpacity
        style={styles.exerciseCard}
        onPress={() => navigation.navigate('ExerciseDetail', {
          exerciseId: item.id,
          exerciseName: item.name,
          equipment: item.equipment,
          muscleGroup: isCardio ? 'Cardio' : item.muscle_group,
          imageUrl: item.image_url,
          isCustom: !!item.is_custom,
        })}
      >
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.exerciseImage} resizeMode="cover" />
        ) : (
          <View style={[styles.exerciseImage, styles.exerciseImagePlaceholder]}>
            <Ionicons name={isCardio ? 'bicycle-outline' : 'barbell-outline'} size={26} color={colors.accent} />
          </View>
        )}
        <View style={styles.exerciseCardRight}>
          <View style={styles.exerciseNameRow}>
            <Text style={styles.exerciseName}>{item.name}</Text>
            {item.is_custom && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>Custom</Text>
              </View>
            )}
          </View>
          {!!item.equipment && <Text style={styles.exerciseEquipment}>{item.equipment}</Text>}
          {!!primaryMuscle && (
            <View style={styles.musclePill}>
              <Text style={styles.musclePillText}>{primaryMuscle}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Exercises</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowNewExerciseModal(true)}>
          <Text style={styles.createBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.topRow}>
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

      {/* Filter row */}
      <View style={styles.pickerRow}>
        <View style={styles.pickerGroup}>
          <TouchableOpacity ref={muscleRef} style={styles.dropdownBtn} onPress={openMuscle}>
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
        {selectedMuscle !== 'Cardio' && (
          <View style={styles.pickerGroup}>
            <TouchableOpacity ref={equipRef} style={styles.dropdownBtn} onPress={openEquip}>
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
        )}
      </View>

      {/* Muscle dropdown */}
      <Modal visible={showMuscleDropdown} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowMuscleDropdown(false)}>
          <View style={[styles.dropdownList, { top: muscleAnchor.y, left: muscleAnchor.x, width: muscleAnchor.width }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {['All', 'Cardio', ...muscleGroups].map(item => (
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
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Equipment dropdown */}
      <Modal visible={showEquipmentDropdown} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowEquipmentDropdown(false)}>
          <View style={[styles.dropdownList, { top: equipAnchor.y, left: equipAnchor.x, width: equipAnchor.width }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
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
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Exercise list */}
      {search ? (
        <FlatList
          data={filteredExercises}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => renderExerciseCard({ item })}
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
            <SectionRule label={section.title} />
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No exercises found</Text>}
        />
      )}

      <NewExerciseForm
        visible={showNewExerciseModal}
        onClose={() => setShowNewExerciseModal(false)}
        onSave={(name, muscle, equipment) => { addNewExercise(name, muscle, equipment); setShowNewExerciseModal(false); }}
        muscleGroups={muscleGroups}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  screenTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  createBtn: {
    backgroundColor: colors.accent, borderRadius: spacing.sm,
    paddingHorizontal: spacing.md, height: 36, justifyContent: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  searchWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: spacing.sm, height: 36, paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: 4 },
  searchInput: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary, height: 36, padding: 0 },
  clearBtn: { padding: 2 },
  pickerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pickerGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickerClear: { padding: 2 },
  dropdownBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: spacing.sm, paddingHorizontal: spacing.sm, height: 36,
  },
  dropdownBtnText: { fontSize: typography.fontSize.sm, color: colors.textPrimary, flex: 1 },
  dropdownArrow: { fontSize: 12, color: colors.textSecondary, marginLeft: 4 },
  dropdownOverlay: { flex: 1 },
  dropdownList: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    maxHeight: 260,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownItem: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemActive: { backgroundColor: colors.accent },
  dropdownItemText: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  dropdownItemTextActive: { color: colors.accentText, fontWeight: '600' },
  exerciseCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center',
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  customBadge: { backgroundColor: colors.accent + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  customBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.4 },
  exerciseEquipment: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  exerciseImage: { width: 64, height: 64, borderRadius: radius.sm, marginRight: spacing.sm },
  exerciseImagePlaceholder: { backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center' },
  exerciseCardRight: { flex: 1, justifyContent: 'center' },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 1 },
  musclePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent + '18',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  musclePillText: { fontSize: 11, fontWeight: '600', color: colors.accent },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },
});
