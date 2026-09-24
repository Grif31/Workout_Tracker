import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { typography } from '../theme/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 108;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

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
};

/** Hero percentile ring shared by the Strength and Endurance score screens,
 *  which are meant to read as the same screen for two different metrics. */
export default function ScoreRing({ anim, color, trackColor }: Props) {
  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
          stroke={trackColor} strokeWidth={RING_STROKE} fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
          stroke={color} strokeWidth={RING_STROKE} fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE}`}
          strokeDashoffset={anim.interpolate({
            inputRange: [0, 1],
            outputRange: [RING_CIRCUMFERENCE, 0],
          })}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <AnimatedPercentText anim={anim} style={[styles.ringNum, { color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNum: { fontSize: typography.fontSize.xxl, fontWeight: '800' },
});
