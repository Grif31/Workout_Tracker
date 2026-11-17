import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { motionTiming } from '../utils/motion';

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
  /** Track overrides (height, radius, flex) for bars thicker than the 4px default */
  style?: StyleProp<ViewStyle>;
};

/**
 * Animated percentile bar. Each row owns its Animated.Value so it animates in
 * on mount/update without the parent managing an array of refs, and it resets
 * correctly when the row list changes because call sites already key each row
 * by exercise or muscle-group name.
 *
 * The fill is a full-width bar slid in with translateX on the native driver,
 * not an animated width. The score screens mount 15-30 of these at once, and
 * JS-driven width meant a JS commit plus a relayout of the whole screen every
 * frame for over a second, which starved the screens' Reanimated entrances
 * (blank or half-faded content after the push).
 */
export default function PercentileBar({
  percent, color, trackColor, delay = 0, minPercent = 0, style,
}: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const measured = trackWidth > 0;
  useEffect(() => {
    if (!measured) return;
    motionTiming(anim, {
      toValue: percent > 0 ? Math.max(percent, minPercent) : 0,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent, measured]);
  return (
    <View
      style={[styles.track, style, { backgroundColor: trackColor }]}
      onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {measured && (
        <Animated.View
          style={[
            styles.fill,
            {
              width: trackWidth,
              backgroundColor: color,
              transform: [{
                translateX: anim.interpolate({ inputRange: [0, 100], outputRange: [-trackWidth, 0], extrapolate: 'clamp' }),
              }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
