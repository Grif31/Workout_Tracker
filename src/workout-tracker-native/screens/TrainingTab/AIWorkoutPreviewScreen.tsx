import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import ExerciseListModal from '../../components/ExerciseList';
import { muscleGroups } from '../../constants/muscleGroups';
import { TrainingStackParamsList, PreviewExercise, PreviewDay } from '../../navigation/types';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'AIWorkoutPreview'>;
type AllExercise = { id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string };

export default function AIWorkoutPreviewScreen({ route, navigation }: Props) {
  const { generateType, description: initDesc, coachDays, coachGoal, coachExp } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState(route.params.name);
  const [description, setDescription] = useState(initDesc ?? '');
  const [exercises, setExercises] = useState<PreviewExercise[]>(route.params.exercises ?? []);
  const [days, setDays] = useState<PreviewDay[]>(route.params.days ?? []);

  const [allExercises, setAllExercises] = useState<AllExercise[]>([]);
  const [pickerTarget, setPickerTarget] = useState<'template' | number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/exercises').then(r => r.ok ? r.json() : []).then(setAllExercises).catch(() => {});
  }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachDays,
          goal: coachGoal,
          experience: coachExp,
          generate_type: generateType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message || 'Generation failed'); return; }
      setName(data.name);
      if (generateType === 'template') {
        setExercises(data.exercises ?? []);
      } else {
        setDescription(data.description ?? '');
        setDays(data.days ?? []);
      }
    } catch {
      Alert.alert('Error', 'Could not reach AI service');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Workout name is required'); return; }
    setSaving(true);
    try {
      const body = generateType === 'template'
        ? { type: 'template', name: name.trim(), exercise_ids: exercises.map(e => e.id) }
        : {
            type: 'routine',
            name: name.trim(),
            description: description.trim() || null,
            days: days.map(d => ({ label: d.label, exercise_ids: d.exercises.map(e => e.id) })),
          };

      const res = await apiFetch('/api/ai/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message || 'Save failed'); return; }

      if (generateType === 'template') {
        navigation.replace('TemplateDetail', { templateId: data.id });
      } else {
        navigation.replace('RoutineDetail', { routineId: data.id, routineName: data.name });
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const removeExercise = (id: number) => {
    setExercises(prev => prev.filter(e => e.id !== id));
  };

  const removeFromDay = (dayIdx: number, exId: number) => {
    setDays(prev => prev.map((d, i) =>
      i === dayIdx ? { ...d, exercises: d.exercises.filter(e => e.id !== exId) } : d
    ));
  };

  const updateDayLabel = (dayIdx: number, label: string) => {
    setDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, label } : d));
  };

  const handlePickExercise = useCallback((ex: { id: number; name: string }) => {
    const full = allExercises.find(e => e.id === ex.id);
    if (!full) return;
    const preview: PreviewExercise = { id: full.id, name: full.name, muscle_group: full.muscle_group };

    if (pickerTarget === 'template') {
      if (exercises.some(e => e.id === full.id)) {
        Alert.alert('Already added', `${full.name} is already in this workout`);
        return;
      }
      setExercises(prev => [...prev, preview]);
    } else if (typeof pickerTarget === 'number') {
      const dayIdx = pickerTarget;
      if (days[dayIdx]?.exercises.some(e => e.id === full.id)) {
        Alert.alert('Already added', `${full.name} is already in this day`);
        return;
      }
      setDays(prev => prev.map((d, i) =>
        i === dayIdx ? { ...d, exercises: [...d.exercises, preview] } : d
      ));
    }
    setPickerTarget(null);
  }, [pickerTarget, exercises, days, allExercises]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {generateType === 'routine' ? 'AI Routine Preview' : 'AI Workout Preview'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Name */}
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder={generateType === 'routine' ? 'Routine name' : 'Workout name'}
          placeholderTextColor={colors.placeholder}
        />

        {/* Description (routine only) */}
        {generateType === 'routine' && (
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.placeholder}
            multiline
          />
        )}

        {/* Template exercises */}
        {generateType === 'template' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Exercises ({exercises.length})</Text>
            {exercises.map(ex => (
              <View key={ex.id} style={styles.exRow}>
                <View style={styles.exInfo}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exMuscle}>{ex.muscle_group}</Text>
                </View>
                <TouchableOpacity onPress={() => removeExercise(ex.id)} hitSlop={8}>
                  <Ionicons name="remove-circle-outline" size={22} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addExBtn} onPress={() => setPickerTarget('template')}>
              <Ionicons name="add" size={16} color={colors.save} />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Routine days */}
        {generateType === 'routine' && days.map((day, dayIdx) => (
          <View key={dayIdx} style={styles.section}>
            <TextInput
              style={styles.dayLabelInput}
              value={day.label}
              onChangeText={v => updateDayLabel(dayIdx, v)}
              placeholder={`Day ${dayIdx + 1}`}
              placeholderTextColor={colors.placeholder}
            />
            {day.exercises.map(ex => (
              <View key={ex.id} style={styles.exRow}>
                <View style={styles.exInfo}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exMuscle}>{ex.muscle_group}</Text>
                </View>
                <TouchableOpacity onPress={() => removeFromDay(dayIdx, ex.id)} hitSlop={8}>
                  <Ionicons name="remove-circle-outline" size={22} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addExBtn} onPress={() => setPickerTarget(dayIdx)}>
              <Ionicons name="add" size={16} color={colors.save} />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: spacing.xl * 3 }} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.regenBtn, { borderColor: colors.accent }]}
          onPress={handleRegenerate}
          disabled={regenerating || saving}
        >
          {regenerating
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Ionicons name="refresh-outline" size={18} color={colors.accent} />}
          <Text style={[styles.regenBtnText, { color: colors.accent }]}>Regenerate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.save }, (saving || regenerating) && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving || regenerating}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark" size={18} color="#fff" />}
          <Text style={styles.saveBtnText}>
            {generateType === 'routine' ? 'Save Routine' : 'Save Template'}
          </Text>
        </TouchableOpacity>
      </View>

      <ExerciseListModal
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        exercises={allExercises}
        onSelect={handlePickExercise}
        onAddExercise={async (exName, muscle, equipment) => {
          const res = await apiFetch('/api/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: exName, muscle_group: muscle, equipment }),
          });
          if (res.ok) {
            const updated = await apiFetch('/api/exercises');
            if (updated.ok) setAllExercises(await updated.json());
          }
        }}
        muscleGroups={muscleGroups}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },

  scroll: { padding: spacing.md, gap: spacing.md },

  nameInput: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  descInput: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    minHeight: 36,
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dayLabelInput: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },

  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  exInfo: { flex: 1 },
  exName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  exMuscle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },

  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.save,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  addExBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },

  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  regenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  regenBtnText: { fontWeight: '700', fontSize: typography.fontSize.sm },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
});
