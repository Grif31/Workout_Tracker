import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { PR_GOLD, PR_GOLD_TEXT, PR_GOLD_BG } from '../constants/prColors';
import { captureAndShare } from '../utils/shareCapture';
import MuscleDiagram from './MuscleDiagram';
import WorkoutShareCard, { type ShareExercise } from './WorkoutShareCard';
import CardioShareCard from './share/CardioShareCard';
import { LaurelBranch } from './LaurelWreath';


export type PrefillWorkoutData = {
  name: string;
  notes: string;
  // Original workout datetime (ISO) — set in edit mode only so the date
  // picker keeps the workout's real date instead of resetting to today
  date?: string;
  exercises: {
    id?: number;
    name: string;
    exercise_template_id?: number;
    exercise_type?: string;
    equipment?: string;
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
  const [prExpanded, setPrExpanded] = useState(false);
  const shareCardRef = useRef<View>(null);
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
      date: mode === 'edit' ? workout.date : undefined,
      exercises: workout.exercises.map(e => ({
        id: mode === 'edit' ? e.id : undefined,
        name: e.name,
        exercise_template_id: e.exercise_template_id,
        exercise_type: e.exercise_type,
        equipment: e.equipment,
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

  const handleShare = async () => {
    try {
      await captureAndShare(shareCardRef);
    } catch {
      // user cancelled or capture failed — no-op
    }
  };

  // Off-screen share card data — derived from the loaded workout
  const shareData = useMemo(() => {
    if (!workout) return null;
    const dateStr = workout.date
      ? new Date(workout.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    const cardioEx = workout.exercises.find(e => e.exercise_type === 'cardio');
    if (cardioEx) {
      const set: any = cardioEx.sets?.[0] ?? {};
      let coords: { latitude: number; longitude: number }[] = [];
      if (cardioEx.route_polyline) {
        try {
          coords = polylineLib
            .decode(cardioEx.route_polyline)
            .map(([lat, lng]: [number, number]) => ({ latitude: lat, longitude: lng }));
        } catch {}
      }
      return {
        kind: 'cardio' as const,
        date: dateStr,
        activityName: workout.name,
        distance: parseFloat(set.distance ?? '0') || 0,
        distanceUnit: (set.distance_unit === 'mi' ? 'mi' : 'km') as 'km' | 'mi',
        durationMin: parseFloat(set.cardio_duration ?? '0') || 0,
        elevationM: set.elevation_gain != null ? parseFloat(set.elevation_gain) || null : null,
        coords,
      };
    }

    let totalReps = 0;
    let setCount = 0;
    const prs: { exercise_name: string; pr_type: string }[] = [];
    const exercises: ShareExercise[] = [];
    for (const ex of workout.exercises) {
      let best: { reps: number; weight: number } | null = null;
      for (const s of ex.sets) {
        const reps = parseFloat(s.reps ?? '0') || 0;
        const weight = parseFloat(s.weight ?? '0') || 0;
        if (reps > 0) { totalReps += reps; setCount += 1; }
        for (const t of s.pr_types ?? []) {
          if (t !== 'estimated_1rm') prs.push({ exercise_name: ex.name, pr_type: t });
        }
        if (reps > 0 && s.set_type !== 'W' &&
            (!best || weight > best.weight || (weight === best.weight && reps > best.reps))) {
          best = { reps, weight };
        }
      }
      exercises.push({ name: ex.name, bestSet: best });
    }
    return {
      kind: 'strength' as const,
      date: dateStr,
      totalReps,
      setCount,
      prs,
      exercises: exercises.slice(0, 3),
    };
  }, [workout]);

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

    options.push('Share Workout');
    handlers.push(handleShare);

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

  const activeMuscles = useMemo(() => {
    if (!workout) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ex of workout.exercises) {
      if (!ex.muscle_group) continue;
      for (const m of ex.muscle_group.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!seen.has(m)) { seen.add(m); out.push(m); }
      }
    }
    return out;
  }, [workout]);

  const PR_LABELS: Record<string, string> = {
    max_weight: 'Max Weight',
    max_reps: 'Rep Record',
    best_time: 'Best Time',
    best_distance: 'Best Distance',
  };

  const workoutPrs = useMemo(() => {
    if (!workout) return [];
    const seen = new Set<string>();
    const out: { exercise_name: string; pr_type: string }[] = [];
    for (const ex of workout.exercises) {
      for (const s of ex.sets) {
        for (const t of s.pr_types ?? []) {
          if (t === 'estimated_1rm') continue;
          const key = `${ex.name}|${t}`;
          if (!seen.has(key)) { seen.add(key); out.push({ exercise_name: ex.name, pr_type: t }); }
        }
      }
    }
    return out;
  }, [workout]);

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

          {/* Date */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {new Date(workout.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
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
            {workout.duration ? (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{fmtDuration(workout.duration)}</Text>
                  <Text style={styles.summaryLabel}>Duration</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* PR dropdown */}
          {workoutPrs.length > 0 && (
            <View style={styles.prSection}>
              {workoutPrs.length === 1 ? (
                <View style={styles.prHeader}>
                  <LaurelBranch height={20} color={PR_GOLD_TEXT} />
                  <Text style={styles.prHeaderText}>
                    {workoutPrs[0].exercise_name} — {PR_LABELS[workoutPrs[0].pr_type] ?? 'PR'}
                  </Text>
                  <LaurelBranch side="right" height={20} color={PR_GOLD_TEXT} />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.prHeader}
                    onPress={() => setPrExpanded(v => !v)}
                    activeOpacity={0.8}
                  >
                    <LaurelBranch height={20} color={PR_GOLD_TEXT} />
                    <Text style={styles.prHeaderText}>{workoutPrs.length} Personal Records</Text>
                    <Text style={styles.prChevron}>{prExpanded ? '▲' : '▼'}</Text>
                    <LaurelBranch side="right" height={20} color={PR_GOLD_TEXT} />
                  </TouchableOpacity>
                  {prExpanded && workoutPrs.map((pr, i) => (
                    <View key={i} style={styles.prRow}>
                      <LaurelBranch height={18} color={PR_GOLD_TEXT} />
                      <Text style={styles.prRowText}>
                        {pr.exercise_name} — {PR_LABELS[pr.pr_type] ?? 'PR'}
                      </Text>
                      <LaurelBranch side="right" height={18} color={PR_GOLD_TEXT} />
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Muscle diagram */}
          {activeMuscles.length > 0 && (
            <View style={styles.diagramCard}>
              <Text style={styles.diagramLabel}>Muscles Targeted</Text>
              <MuscleDiagram muscles={activeMuscles} />
              <Text style={styles.diagramMuscleList}>{activeMuscles.join(' · ')}</Text>
            </View>
          )}

          <Text style={styles.exercisesLabel}>Exercises</Text>
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
            {(() => {
              const hasPr = exercise.sets.some(s => s.pr_types && s.pr_types.length > 0);
              return (
                <>
                  <View style={styles.setHeaderRow}>
                    <View style={styles.colBadge} />
                    <Text style={[styles.setHeaderCell, styles.colReps]}>Reps</Text>
                    <Text style={[styles.setHeaderCell, styles.colWeight]}>{weightUnit}</Text>
                    {hasPr && <View style={styles.colPr} />}
                  </View>

                  {exercise.sets.map((s, i) => {
                    const type = (s.set_type ?? 'N') as keyof typeof SET_TYPE_COLORS;
                    const tc = SET_TYPE_COLORS[type] ?? colors.textSecondary;
                    const prTypes = s.pr_types ?? [];

                    const isMaxWeight = prTypes.includes('max_weight');
                    const isRepPr = prTypes.includes('max_reps');
                    const isPr = isMaxWeight || isRepPr;

                    return (
                      <View key={i} style={styles.setRow}>
                        <View style={[styles.setNumBadge, styles.colBadge, { borderColor: tc }]}>
                          <Text style={[styles.setNumText, { color: tc }]}>{i + 1}</Text>
                          {type !== 'N' && <Text style={[styles.setTypeText, { color: tc }]}>{type}</Text>}
                        </View>
                        <Text style={[styles.setCellText, styles.colReps, isRepPr && styles.prGoldText]}>
                          {s.reps}
                        </Text>
                        <Text style={[styles.setCellText, styles.colWeight, isMaxWeight && styles.prGoldText]}>
                          {(parseFloat(s.weight ?? '0') || 0) === 0 ? 'BW' : s.weight}
                        </Text>
                        {hasPr && (
                          isPr
                            ? <Ionicons name="trophy" size={14} color={PR_GOLD} style={styles.colPr} />
                            : <View style={styles.colPr} />
                        )}
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No exercises recorded</Text>
      }
    />

    {/* Off-screen share card (captured by handleShare) */}
    {shareData && (
      <View
        ref={shareCardRef}
        style={{ position: 'absolute', left: -9999, top: -9999 }}
        collapsable={false}
      >
        {shareData.kind === 'cardio' ? (
          <CardioShareCard
            activityName={shareData.activityName}
            date={shareData.date}
            distance={shareData.distance}
            distanceUnit={shareData.distanceUnit}
            durationMin={shareData.durationMin}
            elevationM={shareData.elevationM}
            coords={shareData.coords}
            accentColor={colors.accent}
          />
        ) : (
          <WorkoutShareCard
            workoutName={workout.name}
            date={shareData.date}
            totalVolume={totalVolume}
            totalSets={shareData.setCount}
            totalReps={shareData.totalReps}
            duration={workout.duration ?? null}
            weightUnit={weightUnit}
            exercises={shareData.exercises}
            prs={shareData.prs}
            accentColor={colors.accent}
          />
        )}
      </View>
    )}

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
    fontSize: typography.fontSize.xl,
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
  summaryLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
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
    fontSize: typography.fontSize.xs,
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
  colPr: { width: 24, alignItems: 'center' },
  prGoldText: { color: PR_GOLD, fontWeight: '700' },

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

  diagramCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  diagramLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    alignSelf: 'flex-start',
  },
  diagramMuscleList: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  prSection: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  prHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PR_GOLD, borderRadius: 10, padding: 12, marginBottom: 4 },
  prHeaderText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: PR_GOLD_TEXT, flex: 1 },
  prChevron: { fontSize: 12, color: PR_GOLD_TEXT },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PR_GOLD_BG, borderRadius: 10, padding: 12, marginTop: 4 },
  prRowText: { fontSize: typography.fontSize.sm, fontWeight: '500', color: PR_GOLD_TEXT, flex: 1 },
  exercisesLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
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
