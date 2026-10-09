import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { nextTarget, type LastSet, type OverloadTarget } from '../../utils/overloadTarget';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

/** The target for an exercise, or null when last session gives nothing to build on. */
export function targetFor(previousSets: LastSet[] | undefined, weightUnit: string): OverloadTarget | null {
  return nextTarget(previousSets, weightUnit === 'kg' ? 2.5 : 5);
}

type Props = {
  /** The exercise asked about; null keeps the sheet closed */
  exercise: { name: string; previousSets?: LastSet[] } | null;
  weightUnit: string;
  onClose: () => void;
};

/** Where to go next with an exercise: last session's top set, and what to try this time. */
export default function NextTargetModal({ exercise, weightUnit, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const target = exercise ? targetFor(exercise.previousSets, weightUnit) : null;
  // "8 x 185 @ 7" becomes "8 x 185 lbs @ 7"; whole-rep targets ("9 reps") carry no load to label
  const withUnit = (text: string) => text.replace(/^(\d+(?:\.\d+)? x \d+(?:\.\d+)?)/, `$1 ${weightUnit}`);

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{exercise?.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close target">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {target && (
            <>
              <View style={styles.block}>
                <Text style={styles.label}>Last session</Text>
                <Text style={styles.last}>{withUnit(target.last)}</Text>
              </View>
              <View style={styles.block}>
                <View style={styles.targetLabelRow}>
                  <Ionicons name={target.reason === 'hold' ? 'repeat' : 'trending-up'} size={14} color={colors.accent} />
                  <Text style={[styles.label, { color: colors.accent }]}>Target today</Text>
                </View>
                <Text style={styles.target}>{withUnit(target.target)}</Text>
                <Text style={styles.why}>{target.why}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  block: { gap: 2 },
  targetLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  last: { fontSize: typography.fontSize.lg, fontWeight: '600', color: colors.textSecondary },
  target: { fontSize: typography.fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  why: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
});
