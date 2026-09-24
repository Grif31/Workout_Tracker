import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { CardSize } from '../../constants/dashboardCards';

const RING = 62;
const STROKE = 7;
const R = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Props = {
  /** Workouts logged since Monday. */
  done: number;
  /** The user's weekly target, from workout_weekly_goal_${uid}. */
  goal: number;
  size: CardSize;
};

/**
 * Workouts done against the weekly target.
 *
 * Built for half width — the ring and the fraction are the whole widget. Full
 * width adds the remaining-count line beside it rather than growing the ring,
 * so the two sizes read as the same thing at two scales.
 */
export default function WeeklyGoalCard({ done, goal, size }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const target = Math.max(1, goal);
  const progress = Math.min(1, done / target);
  const remaining = Math.max(0, target - done);
  const complete = done >= target;
  const arcColor = complete ? colors.save : colors.accent;

  const caption = complete
    ? 'Goal met'
    : `${remaining} to go`;

  return (
    <View style={[styles.card, size === 'half' && styles.cardHalf]}>
      <Text style={styles.label}>Weekly Goal</Text>
      <View style={[styles.body, size === 'half' && styles.bodyHalf]}>
        <View style={styles.ringWrap}>
          <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
            <Circle
              cx={RING / 2} cy={RING / 2} r={R}
              stroke={colors.border} strokeWidth={STROKE} fill="none"
            />
            <Circle
              cx={RING / 2} cy={RING / 2} r={R}
              stroke={arcColor} strokeWidth={STROKE} fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              // Sweeps clockwise from twelve o'clock rather than three
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            {/* Two boxes: the outer one centres the pair in the circle, the
                inner one sits the small target on the big number's baseline.
                One box can't do both — baseline alignment is a cross-axis
                rule, so using it here left the text off-centre vertically. */}
            <View style={styles.ringCenterText}>
              <Text style={styles.ringValue}>{done}</Text>
              <Text style={styles.ringTarget}>/{target}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.caption, complete && { color: colors.save }]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHalf: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Half width has no room for a ring and a caption side by side
  bodyHalf: { flexDirection: 'column', alignItems: 'center', gap: spacing.xs },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterText: { flexDirection: 'row', alignItems: 'baseline' },
  // includeFontPadding is Android-only and ignored on iOS: without it the
  // extra padding Android reserves above and below the glyphs is asymmetric,
  // which nudges the text down inside the ring even once it's centred.
  ringValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    includeFontPadding: false,
  },
  ringTarget: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    includeFontPadding: false,
  },
  caption: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
});
