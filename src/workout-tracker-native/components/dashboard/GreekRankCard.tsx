import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GREEK_RANKS, GREEK_RANK_COLORS } from '../../constants/greekRanks';
import type { CardSize } from '../../constants/dashboardCards';

type Props = {
  rank: string | null;
  score: number | null;
  /** True when a performance gate is holding the user below their score's band. */
  heldByGate?: boolean;
  size: CardSize;
};

/**
 * Current Greek Rank and how far into it the user is.
 *
 * Progress is measured inside the band of the rank actually held, never the
 * raw score's band: a gated user sitting at 84 is still a Titan-gated
 * Olympian, and showing them filling the Titan bar would promise a rank the
 * gate won't give them.
 */
export default function GreekRankCard({ rank, score, heldByGate, size }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const index = GREEK_RANKS.findIndex(r => r.name === rank);
  const band = index >= 0 ? GREEK_RANKS[index] : null;
  const next = index >= 0 ? GREEK_RANKS[index + 1] ?? null : null;
  const color = (rank && GREEK_RANK_COLORS[rank]) || colors.accent;

  // Held by a gate means the bar is full but the next rank isn't coming from
  // points, so it fills rather than showing misleading progress.
  const progress = band && score != null && !heldByGate
    ? Math.min(1, Math.max(0, (score - band.low) / Math.max(1, band.high - band.low)))
    : heldByGate ? 1 : 0;

  const caption = !rank
    ? 'Log a workout to rank up'
    : heldByGate
      ? `${next?.name ?? 'Next rank'} needs a score`
      : next
        ? `${Math.max(0, Math.ceil((band?.high ?? 0) - (score ?? 0)))} to ${next.name}`
        : 'Top rank';

  return (
    <View style={[styles.card, size === 'half' && styles.cardHalf, { borderLeftColor: color }]}>
      <Text style={styles.label}>Greek Rank</Text>
      <View style={styles.nameRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.rankName, { color }]} numberOfLines={1}>{rank ?? '—'}</Text>
        {size === 'full' && score != null && (
          <Text style={styles.score}>{Math.round(score)}</Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.caption} numberOfLines={1}>{caption}</Text>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.md,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
  },
  cardHalf: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rankName: { fontSize: typography.fontSize.md, fontWeight: '800', flexShrink: 1 },
  score: { marginLeft: 'auto', fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: '100%', borderRadius: 3 },
  caption: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
});
