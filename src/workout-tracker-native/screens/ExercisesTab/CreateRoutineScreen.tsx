import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ExercisesStackParamsList } from 'navigation/types';
import { colors } from 'theme/colors';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import ExerciseListModal from '../../components/ExerciseList';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'CreateRoutine'>;

type Exercise = { id: number; name: string; muscle_group: string };
type DayEntry = { label: string; exercises: Exercise[] };

export default function CreateRoutineScreen({ navigation }: Props) {
  const { token } = useAuth();
  const [routineName, setRoutineName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<DayEntry[]>([]);
  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [activePickerDay, setActivePickerDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchExercises(); }, []);

  const fetchExercises = async () => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      if (!res.ok) return;
      setExerciseList(await res.json());
    } catch {
      // non-critical
    }
  };

  const addNewExerciseToLib = async (name: string, muscle: string) => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle }),
      });
      if (res.ok) fetchExercises();
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const addDay = () => {
    setDays(prev => [...prev, { label: `Day ${prev.length + 1}`, exercises: [] }]);
  };

  const removeDay = (idx: number) => {
    setDays(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDayLabel = (idx: number, label: string) => {
    setDays(prev => prev.map((day, i) => i === idx ? { ...day, label } : day));
  };

  const addExerciseToDay = (dayIdx: number, exerciseName: string) => {
    const exercise = exerciseList.find(ex => ex.name === exerciseName);
    if (!exercise) return;
    setDays(prev => prev.map((day, i) => {
      if (i !== dayIdx) return day;
      if (day.exercises.some(e => e.id === exercise.id)) {
        Alert.alert('Already added', `${exercise.name} is already in this day`);
        return day;
      }
      return { ...day, exercises: [...day.exercises, exercise] };
    }));
    setActivePickerDay(null);
  };

  const removeExerciseFromDay = (dayIdx: number, exerciseId: number) => {
    setDays(prev => prev.map((day, i) =>
      i !== dayIdx ? day : { ...day, exercises: day.exercises.filter(e => e.id !== exerciseId) }
    ));
  };

  const saveRoutine = async () => {
    if (!routineName.trim()) {
      Alert.alert('Error', 'Please enter a routine name');
      return;
    }
    if (days.length === 0) {
      Alert.alert('Error', 'Please add at least one day');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/routines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: routineName.trim(),
          description: description.trim() || null,
          days: days.map(d => ({
            label: d.label,
            exercise_template_ids: d.exercises.map(e => e.id),
          })),
        }),
      });
      if (res.ok) {
        Alert.alert('Success', 'Routine created!');
        navigation.goBack();
      } else {
        const data = await res.json();
        Alert.alert('Error', data.message || 'Failed to save routine');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Routine Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. PPL Split"
        placeholderTextColor={colors.placeholder}
        value={routineName}
        onChangeText={setRoutineName}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.descInput]}
        placeholder="e.g. Push Pull Legs 3-day split"
        placeholderTextColor={colors.placeholder}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={2}
      />

      <Text style={styles.sectionHeader}>Days</Text>

      {days.map((day, dayIdx) => (
        <View key={dayIdx} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <TextInput
              style={styles.dayLabelInput}
              value={day.label}
              onChangeText={text => updateDayLabel(dayIdx, text)}
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity onPress={() => removeDay(dayIdx)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>

          {day.exercises.map(ex => (
            <View key={ex.id} style={styles.exerciseRow}>
              <Text style={styles.exerciseRowName}>{ex.name}</Text>
              <Text style={styles.exerciseRowMuscle}>{ex.muscle_group}</Text>
              <TouchableOpacity onPress={() => removeExerciseFromDay(dayIdx, ex.id)}>
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addExBtn}
            onPress={() => setActivePickerDay(dayIdx)}
          >
            <Text style={styles.addExBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addDayBtn} onPress={addDay}>
        <Text style={styles.addDayBtnText}>+ Add Day</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={saveRoutine}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Save Routine</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>

      {activePickerDay !== null && (
        <ExerciseListModal
          visible={true}
          onClose={() => setActivePickerDay(null)}
          exercises={exerciseList}
          onSelect={name => addExerciseToDay(activePickerDay!, name)}
          onAddExercise={addNewExerciseToLib}
          muscleGroups={muscleGroups}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  label: { color: '#fff', fontSize: typography.fontSize.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  descInput: { height: 72, textAlignVertical: 'top' },
  sectionHeader: {
    color: '#fff',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
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
  dayLabelInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginRight: spacing.md,
    paddingBottom: 2,
  },
  removeText: { color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600' },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  exerciseRowName: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary },
  exerciseRowMuscle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  addExBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.save,
    borderRadius: spacing.sm,
  },
  addExBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
  addDayBtn: {
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  addDayBtnText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  cancelBtn: { padding: spacing.md, alignItems: 'center' },
  cancelBtnText: { color: colors.danger, fontSize: typography.fontSize.md },
});
