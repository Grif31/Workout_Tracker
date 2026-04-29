import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ExercisesStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import ExerciseListModal from '../../components/ExerciseList';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'CreateRoutine'>;

type Exercise = { id: number; name: string; muscle_group: string };
type Template = { id: number; name: string; exercises: Exercise[] };

// A day is either linked to an existing template or built inline
type DayEntry =
  | { mode: 'existing'; label: string; templateId: number; templateName: string }
  | { mode: 'new'; label: string; exercises: Exercise[] };

export default function CreateRoutineScreen({ navigation }: Props) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [routineName, setRoutineName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<DayEntry[]>([]);
  const [exerciseList, setExerciseList] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  // Which day index the exercise picker / template picker is open for
  const [exPickerDay, setExPickerDay] = useState<number | null>(null);
  const [tmplPickerDay, setTmplPickerDay] = useState<number | null>(null);

  useEffect(() => {
    fetchExercises();
    fetchTemplates();
  }, []);

  const fetchExercises = async () => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      if (res.ok) setExerciseList(await res.json());
    } catch {}
  };

  const fetchTemplates = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/workout-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTemplates(await res.json());
    } catch {}
  };

  const addNewExerciseToLib = async (name: string, muscle: string) => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle }),
      });
      if (res.ok) fetchExercises();
    } catch {}
  };

  const addDay = () => {
    setDays(prev => [...prev, { mode: 'new', label: `Day ${prev.length + 1}`, exercises: [] }]);
  };

  const removeDay = (idx: number) => setDays(prev => prev.filter((_, i) => i !== idx));

  const updateLabel = (idx: number, label: string) =>
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, label } : d));

  const switchMode = (idx: number, mode: 'new' | 'existing') => {
    setDays(prev => prev.map((d, i) => {
      if (i !== idx) return d;
      if (mode === 'new') return { mode: 'new', label: d.label, exercises: [] };
      return { mode: 'existing', label: d.label, templateId: 0, templateName: '' };
    }));
    if (mode === 'existing') setTmplPickerDay(idx);
  };

  const pickTemplate = (dayIdx: number, tmpl: Template) => {
    setDays(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { mode: 'existing', label: d.label, templateId: tmpl.id, templateName: tmpl.name }
    ));
    setTmplPickerDay(null);
  };

  const addExerciseToDay = (dayIdx: number, exercise: { id: number; name: string }) => {
    const full = exerciseList.find(ex => ex.id === exercise.id);
    if (!full) return;
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx || d.mode !== 'new') return d;
      if (d.exercises.some(e => e.id === full.id)) {
        Alert.alert('Already added', `${full.name} is already in this day`);
        return d;
      }
      return { ...d, exercises: [...d.exercises, full] };
    }));
    setExPickerDay(null);
  };

  const removeExerciseFromDay = (dayIdx: number, exerciseId: number) => {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx || d.mode !== 'new') return d;
      return { ...d, exercises: d.exercises.filter(e => e.id !== exerciseId) };
    }));
  };

  const saveRoutine = async () => {
    if (!routineName.trim()) { Alert.alert('Error', 'Please enter a routine name'); return; }
    if (days.length === 0) { Alert.alert('Error', 'Please add at least one day'); return; }
    const incomplete = days.find(d => d.mode === 'existing' && !d.templateId);
    if (incomplete) { Alert.alert('Error', 'Please select a template for each day or switch it to New'); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/routines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: routineName.trim(),
          description: description.trim() || null,
          days: days.map(d => ({
            label: d.label,
            ...(d.mode === 'existing'
              ? { workout_template_id: d.templateId }
              : { exercise_template_ids: d.exercises.map(e => e.id) }),
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Routine</Text>
        <View style={{ width: 24 }} />
      </View>

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
      />

      <Text style={styles.sectionHeader}>Days</Text>

      {days.map((day, dayIdx) => (
        <View key={dayIdx} style={styles.dayCard}>
          {/* Day label + remove */}
          <View style={styles.dayHeader}>
            <TextInput
              style={styles.dayLabelInput}
              value={day.label}
              onChangeText={text => updateLabel(dayIdx, text)}
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity onPress={() => removeDay(dayIdx)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, day.mode === 'new' && styles.modeBtnActive]}
              onPress={() => switchMode(dayIdx, 'new')}
            >
              <Text style={[styles.modeBtnText, day.mode === 'new' && styles.modeBtnTextActive]}>New</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, day.mode === 'existing' && styles.modeBtnActive]}
              onPress={() => switchMode(dayIdx, 'existing')}
            >
              <Text style={[styles.modeBtnText, day.mode === 'existing' && styles.modeBtnTextActive]}>Use Template</Text>
            </TouchableOpacity>
          </View>

          {day.mode === 'existing' ? (
            <TouchableOpacity style={styles.templatePicker} onPress={() => setTmplPickerDay(dayIdx)}>
              <Text style={day.templateId ? styles.templatePickerSelected : styles.templatePickerPlaceholder}>
                {day.templateId ? day.templateName : 'Select a template…'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <>
              {day.exercises.map(ex => (
                <View key={ex.id} style={styles.exerciseRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exerciseRowName}>{ex.name}</Text>
                    <Text style={styles.exerciseRowMuscle}>{ex.muscle_group}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeExerciseFromDay(dayIdx, ex.id)}>
                    <Ionicons name="remove-circle-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addExBtn} onPress={() => setExPickerDay(dayIdx)}>
                <Text style={styles.addExBtnText}>+ Add Exercise</Text>
              </TouchableOpacity>
            </>
          )}
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
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Routine</Text>}
      </TouchableOpacity>

      {/* Exercise picker modal (for inline new days) */}
      {exPickerDay !== null && (
        <ExerciseListModal
          visible
          onClose={() => setExPickerDay(null)}
          exercises={exerciseList}
          onSelect={ex => addExerciseToDay(exPickerDay!, ex)}
          onAddExercise={addNewExerciseToLib}
          muscleGroups={muscleGroups}
        />
      )}

      {/* Template picker modal */}
      <Modal visible={tmplPickerDay !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Template</Text>
            {templates.length === 0 ? (
              <Text style={styles.modalEmpty}>No templates yet — create one first</Text>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={t => t.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => pickTemplate(tmplPickerDay!, item)}
                  >
                    <Text style={styles.modalItemName}>{item.name}</Text>
                    <Text style={styles.modalItemSub}>
                      {item.exercises.length} exercise{item.exercises.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setTmplPickerDay(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl * 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
  },
  descInput: { height: 72, textAlignVertical: 'top' },
  sectionHeader: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
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
  modeRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.xs,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  modeBtnTextActive: { color: '#fff' },
  templatePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
  },
  templatePickerSelected: { fontSize: typography.fontSize.md, color: colors.textPrimary, fontWeight: '600' },
  templatePickerPlaceholder: { fontSize: typography.fontSize.md, color: colors.placeholder },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseRowName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  exerciseRowMuscle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
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
    borderColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
  },
  addDayBtnText: { color: colors.save, fontSize: typography.fontSize.md, fontWeight: '600' },
  saveBtn: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.background,
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
  modalEmpty: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.lg },
  modalItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  modalItemSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalCancel: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  modalCancelText: { color: colors.danger, fontWeight: '600', fontSize: typography.fontSize.md },
});
