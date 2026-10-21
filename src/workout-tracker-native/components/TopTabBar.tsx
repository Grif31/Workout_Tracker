import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutChangeEvent } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props<T extends string> = {
  tabs: readonly { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
};

/** The row of section tabs at the top of the Progress and Coach tabs, with an underline that slides to the one picked. */
export default function TopTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex(t => t.key === active));
  const x = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start();
  }, [index, x]);

  const tabW = width / tabs.length;
  const sliderW = tabW * 0.5;

  return (
    <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
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
      {width > 0 && (
        <Animated.View
          style={[styles.slider, {
            width: sliderW,
            transform: [{ translateX: Animated.add(Animated.multiply(x, tabW), (tabW - sliderW) / 2) }],
          }]}
        />
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  label: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1.2, paddingTop: spacing.sm, marginBottom: 6,
  },
  labelActive: { color: colors.accent },
  slider: { position: 'absolute', bottom: 0, left: 0, height: 2, borderRadius: 1, backgroundColor: colors.accent },
});
