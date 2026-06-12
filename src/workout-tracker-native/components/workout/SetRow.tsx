import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type WorkoutSet, type PreviousSet, type SetType, NUMERIC_ACCESSORY_ID, colStyles } from './types';

type Props = {
  set: WorkoutSet;
  setIndex: number;
  prevSet?: PreviousSet;
  showRpe: boolean;
  bodyweight?: boolean;
  typeColor: string;
  setType: SetType;
  onCycleType: () => void;
  onChangeReps: (val: string) => void;
  onChangeWeight: (val: string) => void;
  onFocusReps: () => void;
  onFocusWeight: () => void;
  onBlur: () => void;
  onToggleDone: () => void;
  onOpenRpePicker: () => void;
  onDelete: () => void;
};

export default function SetRow({
  set,
  setIndex,
  prevSet,
  showRpe,
  bodyweight,
  typeColor,
  setType,
  onCycleType,
  onChangeReps,
  onChangeWeight,
  onFocusReps,
  onFocusWeight,
  onBlur,
  onToggleDone,
  onOpenRpePicker,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDone = set.done ?? false;
  const prevText = prevSet
    ? bodyweight ? `${prevSet.reps} reps` : `${prevSet.reps} x ${prevSet.weight}`
    : '—';

  return (
    <Swipeable
      renderRightActions={(progress) => {
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [80, 0],
        });
        return (
          <Animated.View style={{ transform: [{ translateX }] }}>
            {/* flex fills the stretched action container so the button matches
                the 44px set row exactly (marginBottom mirrors the row gap) */}
            <TouchableOpacity style={[styles.swipeDelete, { flex: 1 }]} onPress={onDelete}>
              <Text style={styles.swipeDeleteText}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      }}
    >
      <View style={[styles.setRow, isDone && styles.setRowDone]}>
        <TouchableOpacity
          style={[styles.setTypeBadge, colStyles.setType, { borderColor: typeColor }]}
          onPress={() => !isDone && onCycleType()}
        >
          <Text style={[styles.setTypeBadgeNum, { color: typeColor }]}>{setIndex + 1}</Text>
          {setType !== 'N' && <Text style={[styles.setTypeBadgeLabel, { color: typeColor }]}>{setType}</Text>}
        </TouchableOpacity>

        <Text style={[styles.prevCellText, colStyles.prev]}>{prevText}</Text>

        <TextInput
          style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
          placeholder="—"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          inputAccessoryViewID={Platform.OS === 'ios' ? NUMERIC_ACCESSORY_ID : undefined}
          editable={!isDone}
          value={set.reps}
          onChangeText={onChangeReps}
          onFocus={onFocusReps}
          onBlur={onBlur}
        />

        {!bodyweight && (
          <TextInput
            style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            inputAccessoryViewID={Platform.OS === 'ios' ? NUMERIC_ACCESSORY_ID : undefined}
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
          >
            <Text style={[styles.rpeValueText, !set.rpe && { color: colors.placeholder }]}>
              {set.rpe || '—'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[colStyles.check, { alignItems: 'center' }]}
          onPress={onToggleDone}
        >
          <Ionicons
            name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
            size={30}
            color={isDone ? '#34C759' : colors.textSecondary}
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
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: spacing.xs,
  },
  setRowDone: { backgroundColor: 'rgba(52,199,89,0.08)' },

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
    marginHorizontal: 4,
  },

  setInput: {
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

  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  swipeDeleteText: { color: '#fff', fontWeight: '700' },
});
