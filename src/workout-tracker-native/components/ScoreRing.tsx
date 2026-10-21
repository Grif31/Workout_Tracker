import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { typography } from '../theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 108;

/**
 * The count-up numeral is its own leaf component so the per-frame re-render it
 * needs doesn't cascade into whichever screen owns the animation. Exported
 * because the score screens also render the same driven number inline in their
 * "Stronger/Faster than N% of ..." line.
 */
export function AnimatedPercentText({ anim, style }: { anim: Animated.Value; style: any }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value * 100)));
    return () => anim.removeListener(id);
  }, [anim]);
  return <Text style={style}>{display}</Text>;
}

type Props = {
  /** Drives both the arc sweep and the numeral, over an input range of 0..1. */
  anim: Animated.Value;
  /** Rank color for the arc and the numeral. */
  color: string;
  /** Unfilled track behind the arc. */
  trackColor: string;
  /** Diameter; the score screens use the default, the Progress overview a smaller ring. */
  size?: number;
};

/** Hero percentile ring shared by the Strength and Endurance score screens,
 *  which are meant to read as the same screen for two different metrics. */
export default function ScoreRing({ anim, color, trackColor, size = RING_SIZE }: Props) {
  const stroke = Math.round(size * 10 / RING_SIZE);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const small = size < RING_SIZE;
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor} strokeWidth={stroke} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={anim.interpolate({
            inputRange: [0, 1],
            outputRange: [circumference, 0],
          })}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <AnimatedPercentText anim={anim} style={[styles.ringNum, small && styles.ringNumSmall, { color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontSize: typography.fontSize.xxl, fontWeight: '800' },
  ringNumSmall: { fontSize: typography.fontSize.xl },
});
