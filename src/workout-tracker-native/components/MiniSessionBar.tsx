import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { motionSpring } from '../utils/motion';

// The look shared by the minimized workout and run bars, so the two can't drift
// apart. Each bar owns its data and actions; this only lays them out.

type Props = {
  title: string;
  subtitle: string;
  progressPct?: number;
  actionLabel: string;
  actionIcon: keyof typeof Ionicons.glyphMap;
  onOpen: () => void;
  onDiscard: () => void;
  openA11yLabel?: string;
  discardA11yLabel: string;
  // False when the tab bar area is already rising into view with this bar in it
  animateIn?: boolean;
};

const HIT_SLOP = { top: 10, bottom: 10, left: 6, right: 6 };

export default function MiniSessionBar({
  title, subtitle, progressPct, actionLabel, actionIcon, onOpen, onDiscard,
  openA11yLabel, discardA11yLabel, animateIn = true,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Read once: whether it slides up is decided by how it first appeared
  const entrance = useRef(new Animated.Value(animateIn ? 0 : 1)).current;

  useEffect(() => {
    if (!animateIn) return;
    motionSpring(entrance, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{
      opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onOpen}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={openA11yLabel}
      >
        {progressPct != null ? (
          <View style={[styles.progress, { width: `${progressPct}%` }]} />
        ) : null}
        <View style={styles.left}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={styles.openBtn}>
          <Ionicons name={actionIcon} size={14} color={colors.accentText} />
          <Text style={styles.openText}>{actionLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.discardBtn}
          onPress={onDiscard}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={discardA11yLabel}
        >
          <Ionicons name="trash-outline" size={14} color={colors.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + spacing.xs,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2.5,
    backgroundColor: colors.accent,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  left: { flex: 1, justifyContent: 'center' },
  title: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, marginTop: 1, color: colors.textSecondary },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  openText: { fontSize: 13, fontWeight: '600', color: colors.accentText },
  discardBtn: {
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
