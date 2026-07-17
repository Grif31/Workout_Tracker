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
import ExerciseEditRow, { EXERCISE_ROW_HEIGHT } from '../../components/ExerciseEditRow';
import DraggableList from '../../components/DraggableList';
import ExerciseProgrammingModal, { ProgrammingValue } from '../../components/ExerciseProgrammingModal';
import UndoBar from '../../components/UndoBar';
import { muscleGroups } from '../../constants/muscleGroups';
import { TrainingStackParamsList, PreviewExercise, PreviewDay } from '../../navigation/types';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'AIWorkoutPreview'>;
type AllExercise = { id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string };

// 'template' targets the flat exercise list; a number targets that routine day index
type Scope = 'template' | number;
type PickerState = { mode: 'add' | 'switch'; scope: Scope; exId?: number } | null;
type EditState = { scope: Scope; exId: number } | null;
type RemovedState = { scope: Scope; index: number; exercise: PreviewExercise } | null;

const BOTTOM_BAR_HEIGHT = 76;

export default function AIWorkoutPreviewScreen({ route, navigation }: Props) {
  const { generateType, description: initDesc, coachDays, coachGoal, coachExp, coachEquipment, coachSessionLength, coachAvoid } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState(route.params.name);
  const [description, setDescription] = useState(initDesc ?? '');
  const [exercises, setExercises] = useState<PreviewExercise[]>(route.params.exercises ?? []);
  const [days, setDays] = useState<PreviewDay[]>(route.params.days ?? []);

  const [allExercises, setAllExercises] = useState<AllExercise[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [editTarget, setEditTarget] = useState<EditState>(null);
  const [removed, setRemoved] = useState<RemovedState>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listDragging, setListDragging] = useState(false);

  useEffect(() => {
    apiFetch('/api/exercises').then(r => r.ok ? r.json() : []).then(setAllExercises).catch(() => {});
  }, []);

  const getList = (scope: Scope): PreviewExercise[] =>
    scope === 'template' ? exercises : days[scope]?.exercises ?? [];

  const setList = (scope: Scope, updater: (list: PreviewExercise[]) => PreviewExercise[]) => {
    if (scope === 'template') setExercises(prev => updater(prev));
    else setDays(prev => prev.map((d, i) => i === scope ? { ...d, exercises: updater(d.exercises) } : d));
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRemoved(null);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachDays,
          goal: coachGoal,
          experience: coachExp,
          equipment: coachEquipment,
          session_length_min: parseInt(coachSessionLength, 10),
          avoid: coachAvoid,
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
      const toProgramming = (exList: PreviewExercise[]) =>
        exList
          .filter(e => e.prescribed_sets)
          .map(e => ({
            exercise_template_id: e.id,
            sets: e.prescribed_sets,
            reps: e.prescribed_reps ?? '',
            rpe: e.prescribed_rpe ?? null,
          }));

      const body = generateType === 'template'
        ? {
            type: 'template',
            name: name.trim(),
            exercise_ids: exercises.map(e => e.id),
            programming: toProgramming(exercises),
          }
        : {
            type: 'routine',
            name: name.trim(),
            description: description.trim() || null,
            days: days.map(d => ({
              label: d.label,
              exercise_ids: d.exercises.map(e => e.id),
              programming: toProgramming(d.exercises),
            })),
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

  const removeExercise = (scope: Scope, exId: number) => {
    const list = getList(scope);
    const index = list.findIndex(e => e.id === exId);
    if (index < 0) return;
    const exercise = list[index];
    setList(scope, prev => prev.filter(e => e.id !== exId));
    setRemoved({ scope, index, exercise });
  };

  const undoRemove = () => {
    if (!removed) return;
    const { scope, index, exercise } = removed;
    setList(scope, prev => {
      if (prev.some(e => e.id === exercise.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, exercise);
      return next;
    });
    setRemoved(null);
  };

  const updateDayLabel = (dayIdx: number, label: string) => {
    setDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, label } : d));
  };

  const handlePickExercise = useCallback((ex: { id: number; name: string }) => {
    if (!picker) return;
    const full = allExercises.find(e => e.id === ex.id);
    if (!full) return;
    const list = getList(picker.scope);
    const inThisList = picker.scope === 'template' ? 'this workout' : 'this day';

    if (picker.mode === 'switch') {
      if (list.some(e => e.id === full.id && e.id !== picker.exId)) {
        Alert.alert('Already added', `${full.name} is already in ${inThisList}`);
        return;
      }
      // Replace in place, keeping position and prescribed programming
      setList(picker.scope, prev => prev.map(e => e.id === picker.exId
        ? {
            id: full.id,
            name: full.name,
            muscle_group: full.muscle_group,
            exercise_type: full.exercise_type,
            prescribed_sets: e.prescribed_sets,
            prescribed_reps: e.prescribed_reps,
            prescribed_rpe: e.prescribed_rpe,
          }
        : e));
    } else {
      if (list.some(e => e.id === full.id)) {
        Alert.alert('Already added', `${full.name} is already in ${inThisList}`);
        return;
      }
      setList(picker.scope, prev => [...prev, { id: full.id, name: full.name, muscle_group: full.muscle_group, exercise_type: full.exercise_type }]);
    }
    setPicker(null);
  }, [picker, exercises, days, allExercises]);

  const handleProgrammingSave = (value: ProgrammingValue | null) => {
    if (!editTarget) return;
    setList(editTarget.scope, prev => prev.map(e => e.id === editTarget.exId
      ? value
        ? { ...e, prescribed_sets: value.sets, prescribed_reps: value.reps, prescribed_rpe: value.rpe ?? undefined }
        : { ...e, prescribed_sets: undefined, prescribed_reps: undefined, prescribed_rpe: undefined }
      : e));
    setEditTarget(null);
  };

  const editExercise = editTarget
    ? getList(editTarget.scope).find(e => e.id === editTarget.exId)
    : null;

  const reorderIn = (scope: Scope) => (from: number, to: number) => {
    setList(scope, prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const renderExerciseList = (scope: Scope, data: PreviewExercise[]) => (
    <DraggableList
      data={data}
      keyExtractor={e => String(e.id)}
      rowHeight={EXERCISE_ROW_HEIGHT}
      gap={spacing.sm}
      onReorder={reorderIn(scope)}
      onDragActiveChange={setListDragging}
      renderItem={item => (
        <ExerciseEditRow
          name={item.name}
          muscleGroup={item.muscle_group}
          programming={{ sets: item.prescribed_sets, reps: item.prescribed_reps, rpe: item.prescribed_rpe }}
          rowColor={colors.background}
          swipeEnabled={!listDragging}
          onDelete={() => removeExercise(scope, item.id)}
          onSwitch={() => setPicker({ mode: 'switch', scope, exId: item.id })}
          onEdit={() => setEditTarget({ scope, exId: item.id })}
        />
      )}
    />
  );

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

      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={!listDragging}>
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
            {renderExerciseList('template', exercises)}
            <TouchableOpacity style={styles.addExBtn} onPress={() => setPicker({ mode: 'add', scope: 'template' })}>
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
            {renderExerciseList(dayIdx, day.exercises)}
            <TouchableOpacity style={styles.addExBtn} onPress={() => setPicker({ mode: 'add', scope: dayIdx })}>
              <Ionicons name="add" size={16} color={colors.save} />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.editHint}>
          Swipe an exercise left for actions · hold & drag to reorder
        </Text>

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
            ? <ActivityIndicator size="small" color={colors.accentText} />
            : <Ionicons name="checkmark" size={18} color={colors.accentText} />}
          <Text style={styles.saveBtnText}>
            {generateType === 'routine' ? 'Save Routine' : 'Save Template'}
          </Text>
        </TouchableOpacity>
      </View>

      <UndoBar
        visible={removed !== null}
        message={removed ? `Removed ${removed.exercise.name}` : ''}
        onUndo={undoRemove}
        onDismiss={() => setRemoved(null)}
        bottomOffset={BOTTOM_BAR_HEIGHT}
      />

      <ExerciseListModal
        visible={picker !== null}
        onClose={() => setPicker(null)}
        exercises={allExercises}
        onSelect={handlePickExercise}
        onAddExercise={async (exName, muscle, equipment, exerciseType) => {
          const res = await apiFetch('/api/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: exName, muscle_group: muscle, equipment, exercise_type: exerciseType ?? 'strength' }),
          });
          if (res.ok) {
            const updated = await apiFetch('/api/exercises');
            if (updated.ok) setAllExercises(await updated.json());
          }
        }}
        muscleGroups={muscleGroups}
      />

      <ExerciseProgrammingModal
        visible={editTarget !== null}
        exerciseName={editExercise?.name ?? ''}
        isHold={editExercise?.exercise_type === 'duration'}
        initial={editExercise
          ? { sets: editExercise.prescribed_sets, reps: editExercise.prescribed_reps, rpe: editExercise.prescribed_rpe }
          : null}
        onClose={() => setEditTarget(null)}
        onSave={handleProgrammingSave}
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

  editHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

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
  saveBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
});
