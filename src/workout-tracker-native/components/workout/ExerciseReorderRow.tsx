import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

// Rows are fixed-height so DraggableList can compute drag slots — same
// contract as components/ExerciseEditRow.tsx, which this mirrors.
export const EXERCISE_REORDER_ROW_HEIGHT = 56;

type Props = {
  name: string;
  muscleGroup?: string;
  setCount: number;
  exerciseType?: 'strength' | 'cardio' | 'duration';
};

export default function ExerciseReorderRow({ name, muscleGroup, setCount, exerciseType }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const setNoun = exerciseType === 'cardio' ? 'bout' : exerciseType === 'duration' ? 'hold' : 'set';
  const setsLabel = `${setCount} ${setNoun}${setCount === 1 ? '' : 's'}`;
  const subtitle = [muscleGroup, setsLabel].filter(Boolean).join('  ·  ');

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="reorder-three-outline" size={20} color={colors.textSecondary} />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: EXERCISE_REORDER_ROW_HEIGHT,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
});
