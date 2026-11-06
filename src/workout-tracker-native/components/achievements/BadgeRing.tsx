import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import AchievementBadge from './AchievementBadge';

interface Props {
  badgeKey: string;
  threshold?: number;
  weightUnit?: string;
  /** 0 to 1 through the badge's rung */
  progress: number;
  size: number;
}

/** The next badge, locked, inside an accent ring showing how far along it is */
export default function BadgeRing({ badgeKey, threshold, weightUnit, progress, size }: Props) {
  const { colors } = useTheme();
  const stroke = size * 0.04;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const inner = size * 0.73;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.border} strokeWidth={stroke} />
        <Circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.accent} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${Math.max(0.001, progress) * circ} ${circ}`}
          rotation={-90} origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <AchievementBadge badgeKey={badgeKey} threshold={threshold} weightUnit={weightUnit} size={inner} locked />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
