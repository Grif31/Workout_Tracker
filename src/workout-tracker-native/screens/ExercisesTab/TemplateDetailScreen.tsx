import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ExercisesStackParamsList } from 'navigation/types';
import ExerciseListModal from '../../components/ExerciseList';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { muscleGroups } from '../../constants/muscleGroups';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'TemplateDetail'>;
type Exercise = { id: number; name: string; muscle_group: string; equipment?: string; image_url?: string };
type Template = { id: number; name: string; exercises: Exercise[] };

export default function TemplateDetailScreen({ route, navigation }: Props) {
  const { templateId } = route.params;
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const fetchTemplate = async () => {
    try {
      const [tmplRes, exRes] = await Promise.all([
        fetch(`${API_URL}/api/workout-templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/exercises`),
      ]);
      if (tmplRes.ok) {
        const data: Template = await tmplRes.json();
        setTemplate(data);
        setName(data.name);
        setExercises(data.exercises);
      }
      if (exRes.ok) setAllExercises(await exRes.json());
    } catch {
      Alert.alert('Error', 'Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchTemplate(); }, [templateId]));

  const addExercise = (ex: { id: number; name: string }) => {
    const full = allExercises.find(e => e.id === ex.id);
    if (!full) return;
    if (exercises.some(e => e.id === full.id)) {
      Alert.alert('Already added', `${full.name} is already in this template`);
      return;
    }
    setExercises(prev => [...prev, full]);
    setPickerVisible(false);
  };

  const removeExercise = (id: number) => {
    setExercises(prev => prev.filter(e => e.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Template name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/workout-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          exercise_template_ids: exercises.map(e => e.id),
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
            const res = await fetch(`${API_URL}/api/workout-templates/${templateId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) navigation.goBack();
            else Alert.alert('Error', 'Failed to delete template');
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
        name: name,
        notes: '',
        exercises: exercises.map(ex => ({ name: ex.name, sets: [{ reps: '', weight: '' }] })),
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.save} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Template</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={exercises}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.content}
        onDragEnd={({ data }) => setExercises(data)}
        ListHeaderComponent={
          <View>
            {/* Editable name */}
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Template name"
              placeholderTextColor={colors.placeholder}
            />

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.logBtn} onPress={handleLog}>
                <Ionicons name="play" size={14} color="#fff" />
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

            <Text style={styles.sectionLabel}>Exercises  ({exercises.length})</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No exercises yet — tap Add to get started</Text>
        }
        renderItem={({ item, drag, isActive }: RenderItemParams<Exercise>) => (
          <ScaleDecorator activeScale={0.98}>
            <View style={[styles.exerciseRow, isActive && { opacity: 0.85 }]}>
              <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle}>
                <Ionicons name="menu-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{item.name}</Text>
                <Text style={styles.exerciseMuscle}>{item.muscle_group}</Text>
              </View>
              <TouchableOpacity onPress={() => removeExercise(item.id)}>
                <Ionicons name="remove-circle-outline" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </ScaleDecorator>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setPickerVisible(true)}>
            <Ionicons name="add" size={18} color={colors.save} />
            <Text style={styles.addBtnText}>Add Exercise</Text>
          </TouchableOpacity>
        }
      />

      <ExerciseListModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        exercises={allExercises}
        onSelect={addExercise}
        onAddExercise={async (name, muscle) => {
          const res = await fetch(`${API_URL}/api/exercises`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, muscle_group: muscle }),
          });
          if (res.ok) setAllExercises(await (await fetch(`${API_URL}/api/exercises`)).json());
        }}
        muscleGroups={muscleGroups}
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
  logBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dragHandle: { paddingRight: spacing.sm },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  exerciseMuscle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
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
    marginTop: spacing.xs,
  },
  addBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
});
