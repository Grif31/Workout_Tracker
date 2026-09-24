import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Switch, TextInput,
  KeyboardAvoidingView, Pressable, Platform, Keyboard,
} from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { DistanceUnit } from '../../utils/units';
import {
  DISTANCE_GOAL_DEFAULT, formatDistanceValue as formatGoal, parseDistanceGoalInput, stepDistanceGoal,
} from '../../utils/weeklyDistanceGoal';

type Props = {
  visible: boolean;
  weeklyGoal: number;
  onChangeGoal: (delta: number) => void;
  /** In the display unit; null when the user hasn't turned a distance goal on. */
  distanceGoal: number | null;
  distanceUnit: DistanceUnit;
  onChangeDistanceGoal: (value: number | null) => void;
  onClose: () => void;
};

const DISTANCE_STEPS = [-5, -1, 1, 5] as const;

export default function WeeklyGoalModal({
  visible, weeklyGoal, onChangeGoal, distanceGoal, distanceUnit, onChangeDistanceGoal, onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState(distanceGoal != null ? formatGoal(distanceGoal) : '');
  const editingRef = useRef(false);

  // Follow the saved goal (a step button, reopening the modal) unless the user
  // is mid-typing, which would otherwise have their input overwritten.
  useEffect(() => {
    if (!editingRef.current) setDraft(distanceGoal != null ? formatGoal(distanceGoal) : '');
  }, [distanceGoal, visible]);

  // What the field holds right now: a half-typed value counts, so tapping +1
  // straight after typing 12 gives 13 rather than stepping the old goal.
  const currentGoal = (): number | null => parseDistanceGoalInput(draft) ?? distanceGoal;

  const commitDraft = () => {
    editingRef.current = false;
    if (distanceGoal == null) return;
    const parsed = parseDistanceGoalInput(draft);
    if (parsed == null) {
      setDraft(formatGoal(distanceGoal));
      return;
    }
    setDraft(formatGoal(parsed));
    if (parsed !== distanceGoal) onChangeDistanceGoal(parsed);
  };

  const step = (delta: number) => {
    const base = currentGoal();
    if (base == null) return;
    editingRef.current = false;
    const next = stepDistanceGoal(base, delta);
    setDraft(formatGoal(next));
    onChangeDistanceGoal(next);
  };

  const close = () => {
    commitDraft();
    Keyboard.dismiss();
    onClose();
  };

  const unitLabel = distanceUnit === 'mi' ? 'mi' : 'km';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Weekly Goal</Text>

          <Text style={styles.sectionTitle}>Workouts</Text>
          <Text style={styles.modalDesc}>
            Set how many workouts you want to complete each week.
          </Text>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.btn} onPress={() => onChangeGoal(-1)} accessibilityLabel="Fewer workouts">
              <Text style={styles.btnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.value}>{weeklyGoal}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => onChangeGoal(1)} accessibilityLabel="More workouts">
              <Text style={styles.btnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.distanceHeader}>
            <View style={styles.distanceHeaderText}>
              <Text style={styles.sectionTitle}>Distance</Text>
              <Text style={styles.distanceDesc}>
                Track how far you run, walk or ride each week.
              </Text>
            </View>
            <Switch
              testID="distance-goal-switch"
              value={distanceGoal != null}
              onValueChange={on => {
                editingRef.current = false;
                onChangeDistanceGoal(on ? DISTANCE_GOAL_DEFAULT : null);
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>

          {distanceGoal != null && (
            <View style={styles.distanceControls}>
              {DISTANCE_STEPS.slice(0, 2).map(d => (
                <TouchableOpacity
                  key={d}
                  style={styles.stepBtn}
                  onPress={() => step(d)}
                  accessibilityLabel={`Decrease distance goal by ${-d}`}
                >
                  <Text style={styles.stepBtnText}>−{-d}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.distanceField}>
                <TextInput
                  testID="distance-goal-input"
                  style={styles.distanceInput}
                  value={draft}
                  onChangeText={t => { editingRef.current = true; setDraft(t); }}
                  onEndEditing={commitDraft}
                  onSubmitEditing={commitDraft}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  maxLength={5}
                  accessibilityLabel={`Weekly distance goal in ${unitLabel === 'mi' ? 'miles' : 'kilometers'}`}
                />
                <Text style={styles.distanceUnit}>{unitLabel}</Text>
              </View>
              {DISTANCE_STEPS.slice(2).map(d => (
                <TouchableOpacity
                  key={d}
                  style={styles.stepBtn}
                  onPress={() => step(d)}
                  accessibilityLabel={`Increase distance goal by ${d}`}
                >
                  <Text style={styles.stepBtnText}>+{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.done} onPress={close}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: spacing.lg, borderTopRightRadius: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  modalDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  btn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 24, color: colors.accent, fontWeight: '600', lineHeight: 28 },
  value: { fontSize: 48, fontWeight: '700', color: colors.textPrimary, minWidth: 60, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.lg },
  distanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  distanceHeaderText: { flex: 1 },
  distanceDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  distanceControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: typography.fontSize.sm, color: colors.accent, fontWeight: '700' },
  distanceField: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.xs, minWidth: 96, paddingHorizontal: spacing.sm, borderBottomWidth: 1.5, borderBottomColor: colors.border },
  distanceInput: { fontSize: typography.fontSize.xxl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', minWidth: 56, paddingVertical: spacing.xs },
  distanceUnit: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  done: { backgroundColor: colors.accent, borderRadius: spacing.sm, padding: spacing.md, alignItems: 'center' },
  doneText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
});
