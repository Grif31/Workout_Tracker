import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle, Animated, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SegmentOption<T> = { key: T; label: string; icon?: React.ComponentProps<typeof Ionicons>['name'] };

/** Colours for screens outside the app theme, like the always-dark onboarding. */
export type SegmentPalette = {
  track: string;
  border: string;
  thumb: string;
  text: string;
  activeText: string;
};

type Props<T> = {
  options: readonly SegmentOption<T>[];
  /** null selects nothing: the thumb fades out until a segment is picked */
  value: T | null;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
  /** tint: a pale accent thumb with accent text. solid: an accent thumb with accentText on it. */
  appearance?: 'tint' | 'solid';
  palette?: Partial<SegmentPalette>;
  size?: 'sm' | 'md';
};

const BORDER = 1;
// Gap between the track's edge and the thumb
const INSET = 2;

/**
 * One connected bar of equal segments — the app-wide picker for a small,
 * mutually-exclusive set of options (PR filters, metric selectors, chart
 * ranges, units). The selection is a thumb that springs to the segment picked,
 * rather than a highlight that jumps.
 */
export default function SegmentedControl<T>({
  options, value, onChange, style, appearance = 'tint', palette, size = 'sm',
}: Props<T>) {
  const { colors } = useTheme();
  const p: SegmentPalette = {
    track: 'transparent',
    border: colors.border,
    thumb: appearance === 'solid' ? colors.accent : colors.accent + '24',
    text: colors.textSecondary,
    activeText: appearance === 'solid' ? colors.accentText : colors.accent,
    ...palette,
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const index = options.findIndex(o => o.key === value);
  const segWidth = trackWidth > 0 ? (trackWidth - 2 * BORDER - 2 * INSET) / options.length : 0;

  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(index >= 0 ? 1 : 0)).current;
  // The thumb jumps into place on first layout, and only slides after that
  const placed = useRef(false);

  useEffect(() => {
    if (segWidth <= 0) return;
    if (index >= 0) {
      const to = index * segWidth;
      if (placed.current) {
        Animated.spring(x, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
      } else {
        x.setValue(to);
        placed.current = true;
      }
    }
    Animated.timing(opacity, { toValue: index >= 0 ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [index, segWidth]);

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
  const md = size === 'md';

  return (
    <View
      onLayout={onLayout}
      style={[styles.track, { borderColor: p.border, backgroundColor: p.track, borderRadius: md ? 12 : radius.md }, style]}
    >
      {segWidth > 0 && (
        <Animated.View
          testID="segment-thumb"
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segWidth,
              backgroundColor: p.thumb,
              borderRadius: (md ? 12 : radius.md) - INSET,
              opacity,
              transform: [{ translateX: x }],
            },
          ]}
        />
      )}
      {options.map(opt => {
        const active = opt.key === value;
        const color = active ? p.activeText : p.text;
        return (
          <Pressable
            key={String(opt.key)}
            style={[styles.segment, md && styles.segmentMd]}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            {opt.icon && <Ionicons name={opt.icon} size={md ? 16 : 13} color={color} />}
            <Text
              style={[styles.segmentText, md && styles.segmentTextMd, { color }, active && styles.segmentTextActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: BORDER,
    padding: INSET,
  },
  thumb: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.xs,
  },
  segmentMd: { paddingVertical: 10 },
  segmentText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  segmentTextMd: { fontSize: typography.fontSize.sm },
  segmentTextActive: { fontWeight: '700' },
});
