import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { motionSpring } from '../utils/motion';

type Props<T extends string> = {
  tabs: readonly { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
};

const PAD = 3;

/** The segmented control at the top of the Progress and Coach tabs, with a thumb that slides to the one picked. */
export default function TopTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex(t => t.key === active));
  const x = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    motionSpring(x, { toValue: index, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start();
  }, [index, x]);

  // The thumb sits inside the padding, so it spans the inner width
  const tabW = Math.max(0, width - PAD * 2) / tabs.length;

  return (
    <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View
          style={[styles.thumb, {
            width: tabW,
            transform: [{ translateX: Animated.multiply(x, tabW) }],
          }]}
        />
      )}
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={styles.tab}
          onPress={() => onChange(t.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: t.key === active }}
        >
          <Text style={[styles.label, t.key === active && styles.labelActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Light mode follows iOS: a gray track with a white thumb. Dark inverts it, since white on near-black glares.
const createStyles = (colors: Colors, mode: 'light' | 'dark') => StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    padding: PAD,
    borderRadius: 12,
    backgroundColor: mode === 'light' ? colors.border : colors.surface,
  },
  thumb: {
    position: 'absolute', top: PAD, bottom: PAD, left: PAD,
    borderRadius: 9, backgroundColor: mode === 'light' ? colors.surface : colors.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  label: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.textPrimary },
});
