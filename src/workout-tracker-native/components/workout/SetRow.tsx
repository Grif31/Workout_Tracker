import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type WorkoutSet, type PreviousSet, type SetType, SET_TYPE_NAMES, colStyles, fmtPrevSet } from './types';
import { motionTiming } from '../../utils/motion';
import SwipeToDelete from './SwipeToDelete';

type Props = {
  set: WorkoutSet;
  setIndex: number;
  prevSet?: PreviousSet;
  showRpe: boolean;
  bodyweight?: boolean;
  typeColor: string;
  setType: SetType;
  onOpenTypePicker: () => void;
  onChangeReps: (val: string) => void;
  onChangeWeight: (val: string) => void;
  onFocusReps: () => void;
  onFocusWeight: () => void;
  onBlur: () => void;
  onToggleDone: () => void;
  onOpenRpePicker: () => void;
  onDelete: () => void;
  /** Copies the Prev column into this set; absent when there's nothing to copy */
  onCopyPrevious?: () => void;
  /** Lets the keyboard toolbar's Next button focus specific inputs */
  registerInputRef?: (field: 'reps' | 'weight', ref: TextInput | null) => void;
  /** Near-PR hint shown under the row while this set is focused */
  prHint?: string | null;
};

function SetRow({
  set,
  setIndex,
  prevSet,
  showRpe,
  bodyweight,
  typeColor,
  setType,
  onOpenTypePicker,
  onChangeReps,
  onChangeWeight,
  onFocusReps,
  onFocusWeight,
  onBlur,
  onToggleDone,
  onOpenRpePicker,
  onDelete,
  onCopyPrevious,
  registerInputRef,
  prHint,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDone = set.done ?? false;
  const prevText = prevSet ? fmtPrevSet(prevSet, !!bodyweight) : '—';
  const canCopyPrevious = !!prevSet && !isDone && !!onCopyPrevious;

  // A short settle on the checkmark when a set is logged. Skips the first
  // render, so a restored or prefilled done set doesn't animate on open. Kept
  // small and bounce-free: it plays dozens of times a workout, and the light
  // haptic already marks the moment.
  const checkScale = useRef(new Animated.Value(1)).current;
  const wasDone = useRef(isDone);
  useEffect(() => {
    if (isDone && !wasDone.current) {
      checkScale.setValue(0.85);
      motionTiming(checkScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    wasDone.current = isDone;
  }, [isDone, checkScale]);

  return (
    <SwipeToDelete onDelete={onDelete} deleteLabel={`Delete set ${setIndex + 1}`}>
      <View style={[styles.setRow, isDone && styles.setRowDone]}>
        <TouchableOpacity
          style={[styles.setTypeBadge, colStyles.setType, { borderColor: typeColor }]}
          onPress={() => !isDone && onOpenTypePicker()}
          disabled={isDone}
          accessibilityRole="button"
          accessibilityLabel={`Set ${setIndex + 1}, ${SET_TYPE_NAMES[setType]}`}
          accessibilityHint={isDone ? undefined : 'Changes the set type'}
        >
          <Text style={[styles.setTypeBadgeNum, { color: typeColor }]}>{setIndex + 1}</Text>
          {setType !== 'N' && <Text style={[styles.setTypeBadgeLabel, { color: typeColor }]}>{setType}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={colStyles.prev}
          onPress={onCopyPrevious}
          disabled={!canCopyPrevious}
          accessibilityRole={canCopyPrevious ? 'button' : undefined}
          accessibilityLabel={canCopyPrevious ? `Use previous: ${prevText}` : undefined}
          hitSlop={4}
        >
          <Text style={[styles.prevCellText, canCopyPrevious && styles.prevCellTappable]}>{prevText}</Text>
        </TouchableOpacity>

        <TextInput
          ref={r => registerInputRef?.('reps', r)}
          style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
          placeholder="—"
          placeholderTextColor={colors.placeholder}
          // number-pad, not numeric: reps are whole numbers, and numeric's iOS
          // keypad offers a decimal point. Weight below stays numeric — it is
          // legitimately fractional.
          keyboardType="number-pad"
          accessibilityLabel={`Set ${setIndex + 1} reps`}
          editable={!isDone}
          value={set.reps}
          onChangeText={onChangeReps}
          onFocus={onFocusReps}
          onBlur={onBlur}
        />

        {!bodyweight && (
          <TextInput
            ref={r => registerInputRef?.('weight', r)}
            style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            accessibilityLabel={`Set ${setIndex + 1} weight`}
            editable={!isDone}
            value={set.weight}
            onChangeText={onChangeWeight}
            onFocus={onFocusWeight}
            onBlur={onBlur}
          />
        )}

        {showRpe && (
          <TouchableOpacity
            style={[styles.setInput, colStyles.rpe, styles.rpeTouchable, isDone && styles.setInputDone]}
            onPress={() => !isDone && onOpenRpePicker()}
            disabled={isDone}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Set ${setIndex + 1} RPE, ${set.rpe || 'not set'}`}
          >
            <Text style={[styles.rpeValueText, !set.rpe && { color: colors.placeholder }]}>
              {set.rpe || '—'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[colStyles.check, { alignItems: 'center' }]}
          onPress={onToggleDone}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone }}
          accessibilityLabel={`Set ${setIndex + 1} done`}
        >
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Ionicons
              name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
              size={30}
              color={isDone ? colors.save : colors.textSecondary}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
      {!!prHint && (
        <View style={styles.prHintRow}>
          <Ionicons name="trophy-outline" size={12} color={colors.prGold} />
          <Text style={styles.prHintText}>{prHint}</Text>
        </View>
      )}
    </SwipeToDelete>
  );
}

export default React.memo(SetRow);

const createStyles = (colors: Colors) => StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: spacing.xs,
  },
  setRowDone: { backgroundColor: colors.save + '14' },

  setTypeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  setTypeBadgeNum: { fontSize: 12, fontWeight: '700', lineHeight: 14 },
  setTypeBadgeLabel: { fontSize: 10, fontWeight: '600', lineHeight: 12 },

  prevCellText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginHorizontal: spacing.xs,
  },
  // Brighter than the plain Prev text marks the cell as tappable
  prevCellTappable: {
    color: colors.textPrimary,
  },

  setInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
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
  setInputDone: { opacity: 0.5 },

  rpeTouchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeValueText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  prHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  prHintText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.prGold,
  },
});
