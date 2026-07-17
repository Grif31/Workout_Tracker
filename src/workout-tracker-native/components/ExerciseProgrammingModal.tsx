import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

export type ProgrammingValue = { sets: number; reps: string; rpe: number | null };

type Props = {
  visible: boolean;
  exerciseName: string;
  initial?: { sets?: number | null; reps?: string | null; rpe?: number | null } | null;
  /** Timed-hold exercise — reps field is a hold duration (e.g. "40s") */
  isHold?: boolean;
  onClose: () => void;
  /** null = remove programming from the exercise */
  onSave: (value: ProgrammingValue | null) => void;
};

const RPE_OPTIONS = [5, 6, 7, 8, 9, 10];
const MAX_SETS = 10;

export default function ExerciseProgrammingModal({ visible, exerciseName, initial, isHold, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setSets(initial?.sets ?? 3);
      setReps(initial?.reps ?? '');
      setRpe(initial?.rpe ?? null);
    }
  }, [visible]);

  const hadProgramming = !!initial?.sets;
  const canSave = reps.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={1}>{exerciseName}</Text>

          <Text style={styles.fieldLabel}>Sets</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, sets <= 1 && styles.stepperBtnDisabled]}
              onPress={() => setSets(s => Math.max(1, s - 1))}
              disabled={sets <= 1}
            >
              <Ionicons name="remove" size={20} color={sets <= 1 ? colors.border : colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{sets}</Text>
            <TouchableOpacity
              style={[styles.stepperBtn, sets >= MAX_SETS && styles.stepperBtnDisabled]}
              onPress={() => setSets(s => Math.min(MAX_SETS, s + 1))}
              disabled={sets >= MAX_SETS}
            >
              <Ionicons name="add" size={20} color={sets >= MAX_SETS ? colors.border : colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>{isHold ? 'Hold Time' : 'Reps'}</Text>
          <TextInput
            style={styles.repsInput}
            value={reps}
            onChangeText={setReps}
            placeholder={isHold ? 'e.g. 40s or 30–60s' : 'e.g. 8–12 or 5'}
            placeholderTextColor={colors.placeholder}
          />

          <Text style={styles.fieldLabel}>RPE (optional)</Text>
          <View style={styles.rpeRow}>
            <TouchableOpacity
              style={[styles.rpeChip, rpe == null && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setRpe(null)}
            >
              <Text style={[styles.rpeChipText, rpe == null && { color: colors.accentText }]}>None</Text>
            </TouchableOpacity>
            {RPE_OPTIONS.map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.rpeChip, rpe === v && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => setRpe(v)}
              >
                <Text style={[styles.rpeChipText, rpe === v && { color: colors.accentText }]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}
              disabled={!canSave}
              onPress={() => onSave({ sets, reps: reps.trim(), rpe })}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          {hadProgramming && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => onSave(null)}>
              <Text style={[styles.clearBtnText, { color: colors.danger }]}>Remove programming</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.5 },
  stepperValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: 'center',
  },
  repsInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  rpeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  rpeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minWidth: 40,
    alignItems: 'center',
  },
  rpeChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: typography.fontSize.sm },
  saveBtn: {
    flex: 2,
    backgroundColor: colors.save,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
  clearBtn: { alignItems: 'center', marginTop: spacing.md },
  clearBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
});
