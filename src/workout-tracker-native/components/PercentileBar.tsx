import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

type Props = {
  percent: number;
  color: string;
  trackColor: string;
  delay?: number;
  /**
   * Floor applied to any non-zero percent. The Endurance screen uses it so a
   * real but tiny percentile still shows a sliver while a genuinely untracked
   * distance (0) stays empty, rather than both reading as "no data".
   */
  minPercent?: number;
};

/**
 * Animated percentile bar. Each row owns its Animated.Value so it animates in
 * on mount/update without the parent managing an array of refs, and it resets
 * correctly when the row list changes because call sites already key each row
 * by exercise or muscle-group name.
 */
export default function PercentileBar({
  percent, color, trackColor, delay = 0, minPercent = 0,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: percent > 0 ? Math.max(percent, minPercent) : 0,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width can't use the native driver
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent]);
  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
