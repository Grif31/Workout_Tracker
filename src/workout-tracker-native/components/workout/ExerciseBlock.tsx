import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { resolveMediaUrl } from '../../utils/api';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type ExerciseEntry, type SetType, colStyles, isBodyweight, isDuration } from './types';
import SetRow from './SetRow';
import CardioSetRow from './CardioSetRow';
import DurationSetRow from './DurationSetRow';

type Props = {
  exercise: ExerciseEntry;
  exIndex: number;
  collapsed: boolean;
  showRpe: boolean;
  weightUnit: string;
  setTypeColors: Record<SetType, string>;
  // All callbacks below take exIndex as their first argument and are stable
  // (useCallback'd) references from WorkoutLog — that's what lets this
  // component be React.memo'd: WorkoutLog passes the SAME function to every
  // exercise block on every render instead of a freshly-bound closure per
  // block, so memo can actually skip re-rendering exercises the user isn't
  // editing.
  onUpdateNotes: (exIndex: number, val: string) => void;
  autoFocusNotes?: boolean;
  onCycleSetType: (exIndex: number, setIdx: number) => void;
  onUpdateSetField: (exIndex: number, setIdx: number, field: 'reps' | 'weight', val: string) => void;
  onFocusInput: (exIndex: number, setIdx: number, field: 'reps' | 'weight') => void;
  onBlurInput: () => void;
  onToggleSetDone: (exIndex: number, setIdx: number) => void;
  onOpenRpePicker: (exIndex: number, setIdx: number) => void;
  onDeleteSet: (exIndex: number, setIdx: number) => void;
  onAddSet: (exIndex: number) => void;
  onStartRest: () => void;
  onOpenMenu: (exIndex: number, e: any) => void;
  onUpdateCardioField: (exIndex: number, setIdx: number, field: string, value: string) => void;
  onRegisterInput?: (exIndex: number, setIdx: number, field: 'reps' | 'weight', ref: any) => void;
  /** Near-PR hint for the currently focused set in this exercise, if any */
  prHint?: { setIdx: number; text: string } | null;
};

function ExerciseBlock({
  exercise,
  exIndex,
  collapsed,
  showRpe,
  weightUnit,
  setTypeColors,
  onUpdateNotes,
  autoFocusNotes,
  onCycleSetType,
  onUpdateSetField,
  onFocusInput,
  onBlurInput,
  onToggleSetDone,
  onOpenRpePicker,
  onDeleteSet,
  onAddSet,
  onStartRest,
  onOpenMenu,
  onUpdateCardioField,
  onRegisterInput,
  prHint,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const bodyweight = isBodyweight(exercise);

  return (
    <View style={styles.exerciseBlock}>

        {/* Exercise header */}
        <View style={styles.exHeaderRow}>
          <View style={styles.exDiagramBtn}>
            {exercise.image_url ? (
              <Image source={{ uri: resolveMediaUrl(exercise.image_url) }} style={styles.exDiagram} resizeMode="cover" />
            ) : (
              <View style={[styles.exDiagram, styles.exDiagramPlaceholder]}>
                <Ionicons name="barbell-outline" size={22} color={colors.textSecondary} />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            {!!exercise.equipment && (
              <Text style={[styles.exerciseEquipment, { color: colors.textSecondary }]}>{exercise.equipment}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TouchableOpacity onPress={onStartRest} style={styles.exIconBtn}>
              <Ionicons name="timer-outline" size={20} color={colors.save} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={e => onOpenMenu(exIndex, e)}
              style={styles.exIconBtn}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Inline exercise notes */}
        {exercise.notes !== undefined && !collapsed && (
          <TextInput
            style={[styles.exNotesInput, { color: colors.textSecondary }]}
            placeholder="Add notes..."
            placeholderTextColor={colors.placeholder}
            value={exercise.notes}
            onChangeText={val => onUpdateNotes(exIndex, val)}
            autoFocus={autoFocusNotes}
            multiline
          />
        )}

        {!collapsed && (
          <>
            {exercise.exercise_type === 'cardio' ? (
              // ── Cardio sets ──────────────────────────────────────
              <>
                {exercise.sets.map((set, setIndex) => (
                  <CardioSetRow
                    key={set.uid}
                    set={set}
                    setIndex={setIndex}
                    onChangeField={(field, value) => onUpdateCardioField(exIndex, setIndex, field, value)}
                    onDelete={() => onDeleteSet(exIndex, setIndex)}
                  />
                ))}
                <TouchableOpacity style={styles.addSetBtn} onPress={() => onAddSet(exIndex)}>
                  <Ionicons name="add" size={15} color={colors.save} />
                  <Text style={styles.addSetText}>Add Bout</Text>
                </TouchableOpacity>
              </>
            ) : isDuration(exercise) ? (
              // ── Timed hold sets (planks etc.) ─────────────────────
              <>
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderCell, colStyles.setType]}>#</Text>
                  <Text style={[styles.setHeaderCell, colStyles.prev]}>Prev</Text>
                  <Text style={[styles.setHeaderCell, colStyles.input]}>Time</Text>
                  <View style={colStyles.check} />
                </View>

                {exercise.sets.map((set, setIndex) => (
                  <DurationSetRow
                    key={set.uid}
                    set={set}
                    setIndex={setIndex}
                    prevSet={exercise.previousSets?.[setIndex]}
                    onChangeSeconds={val => onUpdateCardioField(exIndex, setIndex, 'cardio_duration', val)}
                    onBlur={onBlurInput}
                    onToggleDone={() => onToggleSetDone(exIndex, setIndex)}
                    onDelete={() => onDeleteSet(exIndex, setIndex)}
                  />
                ))}

                <TouchableOpacity style={styles.addSetBtn} onPress={() => onAddSet(exIndex)}>
                  <Ionicons name="add" size={15} color={colors.save} />
                  <Text style={styles.addSetText}>Add Set</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ── Strength sets ─────────────────────────────────────
              <>
                {/* Column headers */}
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderCell, colStyles.setType]}>#</Text>
                  <Text style={[styles.setHeaderCell, colStyles.prev]}>Prev</Text>
                  <Text style={[styles.setHeaderCell, colStyles.input]}>Reps</Text>
                  {!bodyweight && <Text style={[styles.setHeaderCell, colStyles.input]}>{weightUnit}</Text>}
                  {showRpe && <Text style={[styles.setHeaderCell, colStyles.rpe]}>RPE</Text>}
                  <View style={colStyles.check} />
                </View>

                {exercise.sets.map((set, setIndex) => {
                  const type = (set.set_type as SetType) ?? 'N';
                  const tc = setTypeColors[type];
                  const prev = exercise.previousSets?.[setIndex];
                  return (
                    <SetRow
                      key={set.uid}
                      set={set}
                      setIndex={setIndex}
                      prevSet={prev}
                      showRpe={showRpe}
                      bodyweight={bodyweight}
                      typeColor={tc}
                      setType={type}
                      onCycleType={() => onCycleSetType(exIndex, setIndex)}
                      onChangeReps={val => onUpdateSetField(exIndex, setIndex, 'reps', val)}
                      onChangeWeight={val => onUpdateSetField(exIndex, setIndex, 'weight', val)}
                      onFocusReps={() => onFocusInput(exIndex, setIndex, 'reps')}
                      onFocusWeight={() => onFocusInput(exIndex, setIndex, 'weight')}
                      onBlur={onBlurInput}
                      onToggleDone={() => onToggleSetDone(exIndex, setIndex)}
                      onOpenRpePicker={() => onOpenRpePicker(exIndex, setIndex)}
                      onDelete={() => onDeleteSet(exIndex, setIndex)}
                      registerInputRef={(field, ref) => onRegisterInput?.(exIndex, setIndex, field, ref)}
                      prHint={prHint?.setIdx === setIndex ? prHint.text : null}
                    />
                  );
                })}

                <TouchableOpacity style={styles.addSetBtn} onPress={() => onAddSet(exIndex)}>
                  <Ionicons name="add" size={15} color={colors.save} />
                  <Text style={styles.addSetText}>Add Set</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
    </View>
  );
}

export default React.memo(ExerciseBlock);

const createStyles = (colors: Colors) => StyleSheet.create({
  exerciseBlock: {
    backgroundColor: colors.surface,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'visible',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  exHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  exDiagramBtn: {
    marginRight: spacing.sm,
  },
  exDiagram: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  exDiagramPlaceholder: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  exerciseEquipment: { fontSize: typography.fontSize.sm, marginTop: 1 },
  exIconBtn: { padding: spacing.xs },

  exNotesInput: {
    fontStyle: 'italic',
    fontSize: typography.fontSize.sm,
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },

  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addSetText: { fontSize: typography.fontSize.sm, color: colors.save, fontWeight: '600' },
});
