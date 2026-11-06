import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { BADGE_GLOW } from '../../constants/achievements';
import type { BadgeMetal } from '../../constants/badgeArt';

interface Props {
  metal: BadgeMetal;
  size: number;
  /** Lets the unlock sheet light the glow when the badge lands, without fading the badge */
  glowOpacity?: Animated.Value;
  children: React.ReactNode;
}

/** A badge on a soft round light in its own metal (unlock sheet, share card) */
export default function BadgeGlow({ metal, size, glowOpacity, children }: Props) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, glowOpacity && { opacity: glowOpacity }]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="badgeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={BADGE_GLOW[metal]} stopOpacity={1} />
              <Stop offset="0.68" stopColor={BADGE_GLOW[metal]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={r} cy={r} r={r} fill="url(#badgeGlow)" />
        </Svg>
      </Animated.View>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
