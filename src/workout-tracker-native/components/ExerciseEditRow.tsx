import React, { useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

export type RowProgramming = { sets?: number | null; reps?: string | null; rpe?: number | null };

// Rows are fixed-height so DraggableList can compute drag slots
export const EXERCISE_ROW_HEIGHT = 56;

type Props = {
  name: string;
  muscleGroup?: string;
  programming?: RowProgramming | null;
  onDelete: () => void;
  onSwitch: () => void;
  onEdit: () => void;
  /** Row background — defaults to surface; pass colors.background when the row sits on a surface card. */
  rowColor?: string;
  /** Disable swipe while a drag is active — the swipe handler otherwise steals the touch natively mid-drag. */
  swipeEnabled?: boolean;
};

const ACTION_WIDTH = 64;

export default function ExerciseEditRow({
  name, muscleGroup, programming, onDelete, onSwitch, onEdit, rowColor, swipeEnabled = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const swipeRef = useRef<Swipeable>(null);

  const closeThen = (fn: () => void) => () => {
    swipeRef.current?.close();
    fn();
  };

  const prescription = programming?.sets
    ? `${programming.sets} × ${programming.reps || '?'}${programming.rpe != null ? `  @ RPE ${programming.rpe}` : ''}`
    : null;
  const subtitle = [muscleGroup, prescription].filter(Boolean).join('  ·  ');

  return (
    <Swipeable
      ref={swipeRef}
      enabled={swipeEnabled}
      renderRightActions={(progress) => {
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [ACTION_WIDTH * 3, 0],
        });
        return (
          <Animated.View style={[styles.actionsRow, { transform: [{ translateX }] }]}>
            <TouchableOpacity style={[styles.action, { backgroundColor: colors.accent }]} onPress={closeThen(onEdit)}>
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.action, { backgroundColor: colors.save }]} onPress={closeThen(onSwitch)}>
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
              <Text style={styles.actionText}>Switch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.action, styles.actionLast, { backgroundColor: colors.danger }]} onPress={closeThen(onDelete)}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.actionText}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      }}
    >
      <View style={[styles.row, { backgroundColor: rowColor ?? colors.surface }]}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <Ionicons name="reorder-three-outline" size={20} color={colors.textSecondary} />
      </View>
    </Swipeable>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: EXERCISE_ROW_HEIGHT,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },

  actionsRow: { flexDirection: 'row', marginLeft: spacing.xs, height: EXERCISE_ROW_HEIGHT },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionLast: {
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  actionText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
