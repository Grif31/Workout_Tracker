import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SegmentOption<T> = { key: T; label: string };

type Props<T> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

/** One connected bar of equal segments — the app-wide picker for a small,
 * mutually-exclusive set of options (PR type filters, metric selectors). */
export default function SegmentedControl<T>({ options, value, onChange, style }: Props<T>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { borderColor: colors.border }, style]}>
      {options.map((opt, i) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity
            key={String(opt.key)}
            style={[
              styles.segment,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
              active && { backgroundColor: colors.accent + '20' },
            ]}
            onPress={() => onChange(opt.key)}
          >
            <Text style={[styles.segmentText, { color: active ? colors.accent : colors.textSecondary }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
  },
  segmentText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
});
