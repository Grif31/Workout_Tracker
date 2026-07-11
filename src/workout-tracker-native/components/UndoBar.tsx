import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** Height of any bar the UndoBar must float above (e.g. a bottom action bar). */
  bottomOffset?: number;
};

const AUTO_DISMISS_MS = 4000;

export default function UndoBar({ visible, message, onUndo, onDismiss, bottomOffset = 0 }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (visible) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          bottom: bottomOffset + spacing.sm,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <Text style={styles.message} numberOfLines={1}>{message}</Text>
      <TouchableOpacity onPress={onUndo} hitSlop={8}>
        <Text style={[styles.undoText, { color: colors.accent }]}>Undo</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  message: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
  },
  undoText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
});
