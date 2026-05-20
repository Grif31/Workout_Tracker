import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type ExerciseEntry, type SetType, colStyles } from './types';
import SetRow from './SetRow';
import CardioSetRow from './CardioSetRow';

type Props = {
  exercise: ExerciseEntry;
  exIndex: number;
  collapsed: boolean;
  showRpe: boolean;
  weightUnit: string;
  setTypeColors: Record<SetType, string>;
  onUpdateNotes: (val: string) => void;
  onCycleSetType: (setIdx: number) => void;
  onUpdateSetField: (setIdx: number, field: 'reps' | 'weight', val: string) => void;
  onFocusInput: (setIdx: number, field: 'reps' | 'weight') => void;
  onBlurInput: () => void;
  onToggleSetDone: (setIdx: number) => void;
  onOpenRpePicker: (setIdx: number) => void;
  onOpenPlateCalc: (setIdx: number) => void;
  onDeleteSet: (setIdx: number) => void;
  onAddSet: () => void;
  onStartRest: () => void;
  onOpenMenu: (e: any) => void;
  onUpdateCardioField: (setIdx: number, field: string, value: string) => void;
};

export default function ExerciseBlock({
  exercise,
  exIndex,
  collapsed,
  showRpe,
  weightUnit,
  setTypeColors,
  onUpdateNotes,
  onCycleSetType,
  onUpdateSetField,
  onFocusInput,
  onBlurInput,
  onToggleSetDone,
  onOpenRpePicker,
  onOpenPlateCalc,
  onDeleteSet,
  onAddSet,
  onStartRest,
  onOpenMenu,
  onUpdateCardioField,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.exerciseBlock}>

        {/* Exercise header */}
        <View style={styles.exHeaderRow}>
          <View style={styles.exDiagramBtn}>
            {exercise.image_url ? (
              <Image source={{ uri: exercise.image_url }} style={styles.exDiagram} resizeMode="cover" />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={onStartRest} style={styles.exIconBtn}>
              <Ionicons name="timer-outline" size={20} color={colors.save} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onOpenMenu}
              style={styles.exIconBtn}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Inline exercise notes */}
        {exercise.notes !== undefined && !collapsed && (
          <TextInput
            style={[styles.exNotesInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
            placeholder="Exercise notes..."
            placeholderTextColor={colors.placeholder}
            value={exercise.notes}
            onChangeText={onUpdateNotes}
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
                    key={setIndex}
                    set={set}
                    setIndex={setIndex}
                    onChangeField={(field, value) => onUpdateCardioField(setIndex, field, value)}
                    onDelete={() => onDeleteSet(setIndex)}
                  />
                ))}
                <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet}>
                  <Ionicons name="add" size={15} color={colors.save} />
                  <Text style={styles.addSetText}>Add Bout</Text>
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
                  <Text style={[styles.setHeaderCell, colStyles.input]}>{weightUnit}</Text>
                  {showRpe && <Text style={[styles.setHeaderCell, colStyles.rpe]}>RPE</Text>}
                  <View style={colStyles.check} />
                </View>

                {exercise.sets.map((set, setIndex) => {
                  const type = (set.set_type as SetType) ?? 'N';
                  const tc = setTypeColors[type];
                  const prev = exercise.previousSets?.[setIndex];
                  return (
                    <SetRow
                      key={setIndex}
                      set={set}
                      setIndex={setIndex}
                      prevSet={prev}
                      showRpe={showRpe}
                      typeColor={tc}
                      setType={type}
                      onCycleType={() => onCycleSetType(setIndex)}
                      onChangeReps={val => onUpdateSetField(setIndex, 'reps', val)}
                      onChangeWeight={val => onUpdateSetField(setIndex, 'weight', val)}
                      onFocusReps={() => onFocusInput(setIndex, 'reps')}
                      onFocusWeight={() => onFocusInput(setIndex, 'weight')}
                      onBlur={onBlurInput}
                      onToggleDone={() => onToggleSetDone(setIndex)}
                      onOpenRpePicker={() => onOpenRpePicker(setIndex)}
                      onOpenPlateCalc={() => onOpenPlateCalc(setIndex)}
                      onDelete={() => onDeleteSet(setIndex)}
                    />
                  );
                })}

                <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet}>
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
    borderRadius: 8,
    marginRight: spacing.sm,
  },
  exDiagramPlaceholder: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  exerciseEquipment: { fontSize: typography.fontSize.sm, marginTop: 1 },
  exIconBtn: { padding: 4 },

  exNotesInput: {
    borderWidth: 1,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    minHeight: 36,
  },

  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addSetText: { fontSize: typography.fontSize.sm, color: colors.save, fontWeight: '600' },
});
