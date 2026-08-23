import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = {
  visible: boolean;
  weeklyGoal: number;
  onChangeGoal: (delta: number) => void;
  onClose: () => void;
};

export default function WeeklyGoalModal({ visible, weeklyGoal, onChangeGoal, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Weekly Workout Goal</Text>
          <Text style={styles.modalDesc}>
            Set how many workouts you want to complete each week.
          </Text>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.btn} onPress={() => onChangeGoal(-1)}>
              <Text style={styles.btnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.value}>{weeklyGoal}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => onChangeGoal(1)}>
              <Text style={styles.btnText}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: spacing.lg, borderTopRightRadius: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  modalDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.xl },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.xl },
  btn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 24, color: colors.accent, fontWeight: '600', lineHeight: 28 },
  value: { fontSize: 48, fontWeight: '700', color: colors.textPrimary, minWidth: 60, textAlign: 'center' },
  done: { backgroundColor: colors.accent, borderRadius: spacing.sm, padding: spacing.md, alignItems: 'center' },
  doneText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
});
