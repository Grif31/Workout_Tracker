import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../constants/strengthRanks';
import { scoreChangeLabel } from '../utils/scoreTrend';
import ScoreRing from './ScoreRing';

// Smaller than the score screens' 108px hero ring; an empty half matches it, so the layout doesn't shift
const RING_SIZE = 84;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;

export type ScoreSummary = {
  percentile: number | null;
  rank: string | null;
  /** Points moved over the last 30 days; null until there's a month of history. */
  change: number | null;
};

type Props = {
  strength: ScoreSummary;
  endurance: ScoreSummary;
  onOpenStrength: () => void;
  onOpenEndurance: () => void;
};

/** Strength and Endurance side by side at equal weight, each opening its own score screen. */
export default function ScoresCard({ strength, endurance, onOpenStrength, onOpenEndurance }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ScoreHalf
          title="Strength"
          score={strength}
          emptyIcon="barbell-outline"
          emptyText="Set up your score"
          onPress={onOpenStrength}
          styles={styles}
          colors={colors}
        />
        <ScoreHalf
          title="Endurance"
          score={endurance}
          emptyIcon="walk-outline"
          emptyText="Log a run to unlock"
          onPress={onOpenEndurance}
          styles={styles}
          colors={colors}
        />
      </View>
    </View>
  );
}

function ScoreHalf({ title, score, emptyIcon, emptyText, onPress, styles, colors }: {
  title: string;
  score: ScoreSummary;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyText: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Colors;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const { percentile, rank, change } = score;
  const rankColor = rank ? (SCORE_RANK_COLORS[rank] ?? colors.accent) : colors.textSecondary;

  // strokeDashoffset is an SVG prop, which the native driver can't animate
  useEffect(() => {
    if (percentile == null) return;
    Animated.timing(anim, { toValue: percentile / 100, duration: 900, useNativeDriver: false }).start();
  }, [percentile, anim]);

  const label = percentile != null
    ? `${title} Score ${Math.round(percentile)}${rank ? `, ${rank}` : ''}. Open details`
    : `${title} Score. ${emptyText}`;

  return (
    <TouchableOpacity style={styles.half} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {percentile != null ? (
        <ScoreRing anim={anim} color={rankColor} trackColor={colors.border} size={RING_SIZE} />
      ) : (
        <View style={styles.emptyRing}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
              stroke={colors.border} strokeWidth={RING_STROKE} strokeDasharray="6 6" fill="none"
            />
          </Svg>
          <View style={styles.emptyIcon}>
            <Ionicons name={emptyIcon} size={22} color={colors.textSecondary} />
          </View>
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {percentile != null && rank ? (
        <View style={[styles.rankPill, { borderColor: rankColor, backgroundColor: rankColor + '22' }]}>
          <Ionicons name={SCORE_RANK_ICONS[rank] ?? 'ellipse-outline'} size={11} color={rankColor} />
          <Text style={[styles.rankText, { color: rankColor }]}>{rank}</Text>
        </View>
      ) : null}
      {percentile == null ? (
        <Text style={[styles.sub, { color: colors.accent }]}>{emptyText}</Text>
      ) : change != null ? (
        <Text style={[styles.sub, change > 0 && { color: colors.accent }]}>{scoreChangeLabel(change)}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  // No card around the rings: they sit on the screen background, between the cards above and below
  container: { paddingVertical: spacing.xs, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1, alignItems: 'center', gap: 4 },
  emptyRing: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { position: 'absolute' },
  title: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1,
  },
  rankText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
  sub: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
});
