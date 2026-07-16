import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TrainingStackParamsList } from 'navigation/types';
import ExerciseListModal from '../../components/ExerciseList';
import ExerciseEditRow, { EXERCISE_ROW_HEIGHT } from '../../components/ExerciseEditRow';
import DraggableList from '../../components/DraggableList';
import ExerciseProgrammingModal, { ProgrammingValue } from '../../components/ExerciseProgrammingModal';
import UndoBar from '../../components/UndoBar';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';
import { apiFetch } from '../../utils/api';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'TemplateDetail'>;
type Exercise = {
  id: number;
  name: string;
  muscle_group: string;
  equipment?: string;
  exercise_type?: string;
  image_url?: string;
};
type ProgrammingEntry = { exercise_template_id: number; sets: number; reps: string; rpe?: number | null };
type Template = { id: number; name: string; exercises: Exercise[]; programming_json?: string | null };
type RemovedState = { index: number; exercise: Exercise } | null;

const parseRepsMin = (reps: string): string => {
  const m = (reps ?? '').match(/^(\d+)/);
  return m ? m[1] : '';
};

export default function TemplateDetailScreen({ route, navigation }: Props) {
  const { templateId, muscleGroups: targetMuscles } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [progMap, setProgMap] = useState<Record<number, ProgrammingEntry>>({});
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [switchExId, setSwitchExId] = useState<number | null>(null);
  const [editExId, setEditExId] = useState<number | null>(null);
  const [removed, setRemoved] = useState<RemovedState>(null);
  const [listDragging, setListDragging] = useState(false);

  const fetchTemplate = async () => {
    try {
      const [tmplRes, exRes] = await Promise.all([
        apiFetch(`/api/workout-templates/${templateId}`),
        apiFetch('/api/exercises'),
      ]);
      if (tmplRes.ok) {
        const data: Template = await tmplRes.json();
        setName(data.name);
        setExercises(data.exercises);
        const map: Record<number, ProgrammingEntry> = {};
        if (data.programming_json) {
          try {
            const parsed: ProgrammingEntry[] = JSON.parse(data.programming_json);
            for (const p of parsed) map[p.exercise_template_id] = p;
          } catch { }
        }
        setProgMap(map);
      }
      if (exRes.ok) setAllExercises(await exRes.json());
    } catch {
      Alert.alert('Error', 'Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchTemplate(); }, [templateId]));

  const handlePickExercise = (ex: { id: number; name: string }) => {
    const full = allExercises.find(e => e.id === ex.id);
    if (!full) return;

    if (switchExId != null) {
      if (exercises.some(e => e.id === full.id && e.id !== switchExId)) {
        Alert.alert('Already added', `${full.name} is already in this template`);
        return;
      }
      // Replace in place; carry programming over to the new exercise
      setExercises(prev => prev.map(e => e.id === switchExId ? full : e));
      setProgMap(prev => {
        const old = prev[switchExId];
        if (!old) return prev;
        const next = { ...prev };
        delete next[switchExId];
        next[full.id] = { ...old, exercise_template_id: full.id };
        return next;
      });
      setSwitchExId(null);
    } else {
      if (exercises.some(e => e.id === full.id)) {
        Alert.alert('Already added', `${full.name} is already in this template`);
        return;
      }
      setExercises(prev => [...prev, full]);
    }
    setPickerVisible(false);
  };

  const removeExercise = (id: number) => {
    const index = exercises.findIndex(e => e.id === id);
    if (index < 0) return;
    const exercise = exercises[index];
    setExercises(prev => prev.filter(e => e.id !== id));
    setRemoved({ index, exercise });
  };

  const undoRemove = () => {
    if (!removed) return;
    const { index, exercise } = removed;
    setExercises(prev => {
      if (prev.some(e => e.id === exercise.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, exercise);
      return next;
    });
    setRemoved(null);
  };

  const handleProgrammingSave = (value: ProgrammingValue | null) => {
    if (editExId == null) return;
    setProgMap(prev => {
      const next = { ...prev };
      if (value) {
        next[editExId] = { exercise_template_id: editExId, sets: value.sets, reps: value.reps, rpe: value.rpe };
      } else {
        delete next[editExId];
      }
      return next;
    });
    setEditExId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Template name is required'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/workout-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          exercise_template_ids: exercises.map(e => e.id),
          programming: exercises.filter(e => progMap[e.id]).map(e => progMap[e.id]),
        }),
      });
      if (res.ok) {
        Alert.alert('Saved', 'Template updated');
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to save template');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Template', `Delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/workout-templates/${templateId}`, { method: 'DELETE' });
            if (res.ok) {
              navigation.goBack();
            } else if (res.status === 409) {
              const data = await res.json();
              Alert.alert(
                'Cannot Delete Template',
                data.message ?? 'This template is used in a routine. Remove it from the routine or delete the routine first.',
              );
            } else {
              Alert.alert('Error', 'Failed to delete template');
            }
          } catch {
            Alert.alert('Error', 'Something went wrong');
          }
        },
      },
    ]);
  };

  const handleLog = () => {
    navigation.navigate('LogRoutine', {
      prefill: {
        name,
        notes: '',
        exercises: exercises.map(ex => {
          const prog = progMap[ex.id];
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
  };

  const editExercise = editExId != null ? exercises.find(e => e.id === editExId) : null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.save} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Template</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!listDragging}>
        {targetMuscles && targetMuscles.length > 0 && (
          <View style={[styles.muscleBanner, { backgroundColor: colors.accent + '18', borderColor: colors.accent }]}>
            <Ionicons name="body-outline" size={14} color={colors.accent} />
            <Text style={[styles.muscleBannerText, { color: colors.accent }]}>
              Training: {targetMuscles.join(', ')}
            </Text>
          </View>
        )}
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Template name"
          placeholderTextColor={colors.placeholder}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.logBtn} onPress={handleLog}>
            <Ionicons name="play" size={14} color={colors.accentText} />
            <Text style={styles.logBtnText}>Log Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionLabel}>Exercises ({exercises.length})</Text>

        {exercises.length === 0 ? (
          <Text style={styles.emptyText}>No exercises yet — tap Add to get started</Text>
        ) : (
          <DraggableList
            data={exercises}
            keyExtractor={item => item.id.toString()}
            rowHeight={EXERCISE_ROW_HEIGHT}
            gap={spacing.sm}
            onDragActiveChange={setListDragging}
            onReorder={(from, to) => {
              setExercises(prev => {
                const next = [...prev];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              });
            }}
            renderItem={item => (
              <ExerciseEditRow
                name={item.name}
                muscleGroup={item.muscle_group}
                programming={progMap[item.id] ?? null}
                swipeEnabled={!listDragging}
                onDelete={() => removeExercise(item.id)}
                onSwitch={() => { setSwitchExId(item.id); setPickerVisible(true); }}
                onEdit={() => setEditExId(item.id)}
              />
            )}
          />
        )}

        <TouchableOpacity style={styles.addBtn} onPress={() => { setSwitchExId(null); setPickerVisible(true); }}>
          <Ionicons name="add" size={18} color={colors.save} />
          <Text style={styles.addBtnText}>Add Exercise</Text>
        </TouchableOpacity>
        {exercises.length > 0 && (
          <Text style={styles.editHint}>
            Swipe an exercise left for actions · hold & drag to reorder
          </Text>
        )}
      </ScrollView>

      <UndoBar
        visible={removed !== null}
        message={removed ? `Removed ${removed.exercise.name}` : ''}
        onUndo={undoRemove}
        onDismiss={() => setRemoved(null)}
      />

      <ExerciseListModal
        visible={pickerVisible}
        onClose={() => { setPickerVisible(false); setSwitchExId(null); }}
        exercises={allExercises}
        onSelect={handlePickExercise}
        initialMuscle={targetMuscles?.[0]}
        onAddExercise={async (name, muscle, _equipment, exerciseType) => {
          const res = await apiFetch('/api/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, muscle_group: muscle, exercise_type: exerciseType ?? 'strength' }),
          });
          if (res.ok) setAllExercises(await (await apiFetch('/api/exercises')).json());
        }}
        muscleGroups={muscleGroups}
      />

      <ExerciseProgrammingModal
        visible={editExId !== null}
        exerciseName={editExercise?.name ?? ''}
        initial={editExId != null ? progMap[editExId] ?? null : null}
        onClose={() => setEditExId(null)}
        onSave={handleProgrammingSave}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  deleteText: { color: colors.danger, fontWeight: '600', fontSize: typography.fontSize.sm },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  muscleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    marginBottom: spacing.sm,
  },
  muscleBannerText: { fontSize: typography.fontSize.sm, fontWeight: '600', flex: 1 },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.lg },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.save,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  addBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
  editHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
