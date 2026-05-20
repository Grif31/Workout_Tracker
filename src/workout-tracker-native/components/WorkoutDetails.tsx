import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useActionSheet } from '@expo/react-native-action-sheet';
import polylineLib from '@mapbox/polyline';

// react-native-maps is only available in dev/production builds, not Expo Go.
// Guard the require so a missing native module never crashes the app at startup.
let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;
import { Workout } from '../types/models';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { estimateCalories } from '../utils/cardioCalories';


export type PrefillWorkoutData = {
  name: string;
  notes: string;
  exercises: {
    id?: number;
    name: string;
    exercise_template_id?: number;
    exercise_type?: string;
    notes?: string;
    sets: {
      id?: number;
      reps: string;
      weight: string;
      set_type?: string;
      rpe?: string;
      cardio_duration?: string;
      distance?: string;
      distance_unit?: string;
      intensity?: string;
    }[];
  }[];
};

type Props = {
  workoutId: number;
  onEdit?: (prefill: PrefillWorkoutData) => void;
  onDelete?: (workoutId: number) => void;
  onSaveAsTemplate?: () => void;
  onPerformAgain?: (prefill: PrefillWorkoutData) => void;
};

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function WorkoutDetailsScreen({
  workoutId, onEdit, onDelete, onSaveAsTemplate, onPerformAgain,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SET_TYPE_COLORS = useMemo(() => ({
    N: colors.textSecondary,
    W: colors.warmup,
    D: colors.dropset,
    F: colors.danger,
  }), [colors]);

  const { showActionSheetWithOptions } = useActionSheet();
  const { user } = useAuth();
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [templateModal, setTemplateModal] = useState<{ visible: boolean; name: string; excluded: number }>({
    visible: false, name: '', excluded: 0,
  });

  useFocusEffect(useCallback(() => { fetchWorkout(); }, [workoutId]));

  const fetchWorkout = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/workouts/${workoutId}`);
      if (!res.ok) { Alert.alert('Error', 'Failed to load workout'); return; }
      setWorkout(await res.json());
    } catch {
      Alert.alert('Error', 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  };

  const buildPrefill = (mode: 'perform' | 'edit'): PrefillWorkoutData => {
    if (!workout) throw new Error('no workout loaded');
    return {
      name: workout.name,
      notes: workout.notes || '',
      exercises: workout.exercises.map(e => ({
        id: mode === 'edit' ? e.id : undefined,
        name: e.name,
        exercise_template_id: e.exercise_template_id,
        exercise_type: e.exercise_type,
        notes: mode === 'edit' ? (e.notes ?? '') : undefined,
        sets: e.sets.map(s => ({
          id: mode === 'edit' ? s.id : undefined,
          reps: mode === 'edit' ? (s.reps ?? '') : '',
          weight: mode === 'edit' ? (s.weight ?? '') : '',
          set_type: mode === 'edit' ? (s.set_type ?? 'N') : 'N',
          rpe: mode === 'edit' ? (s.rpe != null ? String(s.rpe) : '') : '',
          cardio_duration: mode === 'edit' ? (s.cardio_duration ?? '') : '',
          distance: mode === 'edit' ? (s.distance ?? '') : '',
          distance_unit: mode === 'edit' ? (s.distance_unit ?? 'km') : 'km',
          intensity: mode === 'edit' ? (s.intensity ?? '') : '',
        })),
      })),
    };
  };

  const confirmDelete = () => {
    Alert.alert('Delete Workout', 'Are you sure you want to delete this workout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteWorkout },
    ]);
  };

  const deleteWorkout = async () => {
    try {
      const res = await apiFetch(`/api/workouts/${workoutId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        Alert.alert('Error', err.message || 'Failed to delete workout');
        return;
      }
      onDelete?.(workoutId);
    } catch {
      Alert.alert('Error', 'Failed to delete workout');
    }
  };

  const doSaveTemplate = async () => {
    const name = templateModal.name.trim() || workout!.name;
    const ids = workout!.exercises
      .map(e => e.exercise_template_id)
      .filter((id): id is number => id != null);
    setTemplateModal(m => ({ ...m, visible: false }));
    try {
      const res = await apiFetch('/api/workout-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, exercise_template_ids: ids }),
      });
      if (res.ok) {
        Alert.alert('Template Saved', `"${name}" saved as a template.`);
        onSaveAsTemplate?.();
      } else {
        Alert.alert('Error', 'Failed to save template');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const openMenu = () => {
    if (!workout) return;
    const options: string[] = [];
    const handlers: (() => void)[] = [];

    if (onEdit) {
      options.push('Edit Workout');
      handlers.push(() => onEdit(buildPrefill('edit')));
    }
    options.push('Perform Again');
    handlers.push(() => onPerformAgain?.(buildPrefill('perform')));

    if (onSaveAsTemplate) {
      options.push('Save as Template');
      handlers.push(() => {
        const ids = workout.exercises
          .map(e => e.exercise_template_id)
          .filter((id): id is number => id != null);
        if (ids.length === 0) {
          Alert.alert(
            'Cannot Save Template',
            'None of the exercises in this workout were selected from the exercise library. To create a template, use exercises from the library when logging.',
          );
          return;
        }
        setTemplateModal({
          visible: true,
          name: workout.name,
          excluded: workout.exercises.length - ids.length,
        });
      });
    }
    options.push('Delete Workout');
    handlers.push(confirmDelete);
    options.push('Cancel');
    handlers.push(() => {});

    showActionSheetWithOptions(
      { options, destructiveButtonIndex: options.indexOf('Delete Workout'), cancelButtonIndex: options.length - 1 },
      (i) => { if (i !== undefined) handlers[i]?.(); }
    );
  };

  if (loading || !workout) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const totalSets = workout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const totalVolume = workout.volume ?? workout.exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s, set) => s + (parseFloat(set.reps ?? '0') || 0) * (parseFloat(set.weight ?? '0') || 0), 0), 0);

  return (
    <>
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={workout.exercises}
      keyExtractor={item => item.id.toString()}
      ListHeaderComponent={
        <View>
          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{workout.name}</Text>
            <TouchableOpacity onPress={openMenu} style={styles.menuBtn}>
              <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Metadata: date + duration */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {new Date(workout.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
            {workout.duration ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.metaText}>{fmtDuration(workout.duration)}</Text>
              </>
            ) : null}
          </View>

          {/* Notes */}
          {workout.notes ? (
            <Text style={styles.notes}>{workout.notes}</Text>
          ) : null}

          {/* Summary bar */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{workout.exercises.length}</Text>
              <Text style={styles.summaryLabel}>{workout.exercises.length === 1 ? 'Exercise' : 'Exercises'}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalSets}</Text>
              <Text style={styles.summaryLabel}>{totalSets === 1 ? 'Set' : 'Sets'}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{fmtVolume(totalVolume)}</Text>
              <Text style={styles.summaryLabel}>Volume ({weightUnit})</Text>
            </View>
          </View>
        </View>
      }
      renderItem={({ item: exercise }) => {
        const isCardio = exercise.exercise_type === 'cardio';

        if (isCardio) {
          const bodyKg = user?.bodyweight
            ? (user.weight_unit === 'kg' ? user.bodyweight : user.bodyweight / 2.205)
            : 70;
          const totalDur = exercise.sets.reduce((s, b) => s + (Number(b.cardio_duration) || 0), 0);
          const totalDistKm = exercise.sets.reduce((s, b) => {
            const d = Number(b.distance) || 0;
            return s + ((b.distance_unit === 'mi' ? d * 1.60934 : d));
          }, 0);
          const kcal = estimateCalories(exercise.name, totalDur, bodyKg);

          let routeCoords: { latitude: number; longitude: number }[] | null = null;
          if (exercise.route_polyline) {
            try {
              const decoded = polylineLib.decode(exercise.route_polyline);
              routeCoords = decoded.map(([lat, lng]: [number, number]) => ({ latitude: lat, longitude: lng }));
            } catch {}
          }

          const region = routeCoords && routeCoords.length > 0 ? (() => {
            const lats = routeCoords!.map(c => c.latitude);
            const lngs = routeCoords!.map(c => c.longitude);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
            return {
              latitude: (minLat + maxLat) / 2,
              longitude: (minLng + maxLng) / 2,
              latitudeDelta: Math.max(maxLat - minLat, 0.01) * 1.3,
              longitudeDelta: Math.max(maxLng - minLng, 0.01) * 1.3,
            };
          })() : null;

          return (
            <View style={styles.exerciseCard}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>

              {MapView && Polyline && routeCoords && region && (
                <MapView
                  style={styles.routeMap}
                  region={region}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Polyline
                    coordinates={routeCoords}
                    strokeColor={colors.accent}
                    strokeWidth={3}
                  />
                </MapView>
              )}

              {exercise.sets.map((s, i) => {
                const dur = Number(s.cardio_duration) || 0;
                const dist = Number(s.distance) || 0;
                const intensity = Number(s.intensity) || 0;
                const durStr = dur > 0
                  ? `${Math.floor(dur)}:${String(Math.round((dur % 1) * 60)).padStart(2, '0')} min`
                  : null;
                const distStr = dist > 0 ? `${dist} ${s.distance_unit || 'km'}` : null;
                const paceStr = intensity > 0 ? `${intensity.toFixed(2)} min/km` : null;
                return (
                  <View key={i} style={styles.cardioBoutRow}>
                    <Text style={[styles.setNumText, { color: colors.textSecondary, width: 20 }]}>{i + 1}</Text>
                    <Text style={styles.cardioBoutText}>
                      {[durStr, distStr, paceStr].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.cardioSummaryBar}>
                <Text style={styles.cardioSummaryText}>
                  🔥 ~{kcal} kcal  ·  {totalDur.toFixed(0)} min  ·  {totalDistKm.toFixed(2)} km
                </Text>
              </View>
            </View>
          );
        }

        const hasPr = exercise.sets.some(s => s.pr_types && s.pr_types.length > 0);
        return (
          <View style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            {exercise.equipment ? (
              <Text style={styles.equipmentText}>{exercise.equipment}</Text>
            ) : null}
            {exercise.notes ? (
              <Text style={styles.exerciseNotes}>{exercise.notes}</Text>
            ) : null}

            {/* Column headers */}
            <View style={styles.setHeaderRow}>
              <View style={styles.colBadge} />
              <Text style={[styles.setHeaderCell, styles.colReps]}>Reps</Text>
              <Text style={[styles.setHeaderCell, styles.colWeight]}>{weightUnit}</Text>
              {hasPr && <View style={styles.colPr} />}
            </View>

            {exercise.sets.map((s, i) => {
              const type = (s.set_type ?? 'N') as keyof typeof SET_TYPE_COLORS;
              const tc = SET_TYPE_COLORS[type] ?? colors.textSecondary;
              const isPr = s.pr_types && s.pr_types.length > 0;
              return (
                <View key={i} style={styles.setRow}>
                  <View style={[styles.setNumBadge, styles.colBadge, { borderColor: tc }]}>
                    <Text style={[styles.setNumText, { color: tc }]}>{i + 1}</Text>
                    {type !== 'N' && <Text style={[styles.setTypeText, { color: tc }]}>{type}</Text>}
                  </View>
                  <Text style={[styles.setCellText, styles.colReps]}>{s.reps}</Text>
                  <Text style={[styles.setCellText, styles.colWeight]}>{s.weight}</Text>
                  {hasPr && (
                    isPr
                      ? <View style={[styles.colPr, styles.prChip]}><Text style={styles.prChipText}>PR</Text></View>
                      : <View style={styles.colPr} />
                  )}
                </View>
              );
            })}
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No exercises recorded</Text>
      }
    />

    <Modal
      visible={templateModal.visible}
      transparent
      animationType="fade"
      onRequestClose={() => setTemplateModal(m => ({ ...m, visible: false }))}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Save as Template</Text>
          <TextInput
            style={styles.modalInput}
            value={templateModal.name}
            onChangeText={v => setTemplateModal(m => ({ ...m, name: v }))}
            placeholder="Template name"
            placeholderTextColor={colors.placeholder}
            autoFocus
            returnKeyType="done"
          />
          {templateModal.excluded > 0 && (
            <Text style={styles.modalWarning}>
              {templateModal.excluded} exercise{templateModal.excluded > 1 ? 's' : ''} not from the library will be excluded.
            </Text>
          )}
          <View style={styles.modalBtns}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setTemplateModal(m => ({ ...m, visible: false }))}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={doSaveTemplate}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  menuBtn: { padding: spacing.xs },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  metaText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  metaDot: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  notes: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  exerciseName: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  exerciseNotes: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  equipmentText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  setHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  colBadge: { width: 36, marginRight: spacing.sm },
  colReps: { flex: 1, textAlign: 'center' },
  colWeight: { flex: 1, textAlign: 'center' },
  colPr: { width: 32, alignItems: 'center' },
  prChip: {
    backgroundColor: '#FFD700',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  prChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7A5800',
    letterSpacing: 0.3,
  },

  setNumBadge: {
    borderWidth: 1.5,
    borderRadius: 6,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumText: { fontSize: 13, fontWeight: '700', lineHeight: 15 },
  setTypeText: { fontSize: 10, fontWeight: '600', lineHeight: 11 },

  setCellText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: spacing.md,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalWarning: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: spacing.xs,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: typography.fontSize.md,
    color: colors.accentText,
    fontWeight: '600',
  },

  routeMap: {
    height: 200,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardioBoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardioBoutText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  cardioSummaryBar: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardioSummaryText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
