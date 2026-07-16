import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type WorkoutSet, type PreviousSet, colStyles, fmtHold } from './types';

// Timed-hold sets (planks, wall sits): SET | PREVIOUS | SECONDS | ✓
// The UI works in seconds; WorkoutLog converts to minutes for the payload.
type Props = {
  set: WorkoutSet;
  setIndex: number;
  prevSet?: PreviousSet;
  onChangeSeconds: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
};

export default function DurationSetRow({
  set, setIndex, prevSet, onChangeSeconds, onFocus, onBlur, onToggleDone, onDelete,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDone = set.done ?? false;

  const prevMinutes = prevSet?.cardio_duration ? parseFloat(prevSet.cardio_duration) : NaN;
  const prevText = !isNaN(prevMinutes) && prevMinutes > 0 ? fmtHold(prevMinutes) : '—';

  return (
    <Swipeable
      renderRightActions={(progress) => {
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [80, 0],
        });
        return (
          <Animated.View style={{ transform: [{ translateX }] }}>
            <TouchableOpacity style={[styles.swipeDelete, { flex: 1 }]} onPress={onDelete}>
              <Text style={styles.swipeDeleteText}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      }}
    >
      <View style={[styles.setRow, isDone && styles.setRowDone]}>
        <View style={[styles.setBadge, colStyles.setType]}>
          <Text style={[styles.setBadgeNum, { color: colors.textSecondary }]}>{setIndex + 1}</Text>
        </View>

        <Text style={[styles.prevCellText, colStyles.prev]}>{prevText}</Text>

        <View style={[styles.secondsWrap, colStyles.input]}>
          <TextInput
            style={[styles.setInput, isDone && styles.setInputDone]}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            editable={!isDone}
            value={set.cardio_duration ?? ''}
            onChangeText={onChangeSeconds}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <Text style={[styles.secondsSuffix, { color: colors.textSecondary }]}>sec</Text>
        </View>

        <TouchableOpacity style={[styles.checkBtn, colStyles.check]} onPress={onToggleDone} hitSlop={4}>
          <Ionicons
            name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={isDone ? colors.save : colors.border}
          />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginBottom: spacing.sm,
  },
  setRowDone: { opacity: 0.55 },
  setBadge: { alignItems: 'center', justifyContent: 'center' },
  setBadgeNum: { fontSize: 12, fontWeight: '700' },
  prevCellText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  secondsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  setInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    height: 44,
  },
  setInputDone: { borderColor: 'transparent' },
  secondsSuffix: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  checkBtn: { alignItems: 'center', justifyContent: 'center' },
  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  swipeDeleteText: { color: colors.accentText, fontWeight: '700' },
});
