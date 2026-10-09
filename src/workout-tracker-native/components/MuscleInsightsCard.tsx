import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { CATEGORICAL_COLORS } from '../constants/categoricalColors';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import {
  fatigueBanner, longBelowMev, pplBalance, PPL_GROUPS, type FatigueKind, type PplGroup,
} from '../utils/muscleTrends';

type Props = {
  muscleSets: Record<string, number>;
  weeklyHistory?: Record<string, number[]>;
  /** Working sets so far this week and last week's up to the same weekday */
  setsToDate: number;
  lastWeekSetsToDate?: number;
  isPremium: boolean;
  onUnlock: () => void;
};

const GROUPS = Object.keys(PPL_GROUPS) as PplGroup[];

/** Under the muscle volume card: the fatigue monitor and push / pull / legs balance for Premium, one locked prompt for free. */
export default function MuscleInsightsCard({
  muscleSets, weeklyHistory, setsToDate, lastWeekSetsToDate, isPremium, onUnlock,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const palette = mode === 'dark' ? CATEGORICAL_COLORS.dark : CATEGORICAL_COLORS.light;

  if (!isPremium) {
    const muscle = longBelowMev(weeklyHistory);
    if (!muscle) return null;
    return (
      <TouchableOpacity style={[styles.card, styles.row]} onPress={onUnlock} accessibilityRole="button">
        <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
        <Text style={styles.lockText}>
          {muscle} has been under its minimum for 2 weeks.{' '}
          <Text style={{ color: colors.accent, fontWeight: '700' }}>See why</Text>
        </Text>
      </TouchableOpacity>
    );
  }

  const banner = lastWeekSetsToDate != null ? fatigueBanner(setsToDate, lastWeekSetsToDate) : null;
  const balance = pplBalance(muscleSets);
  if (!banner && !balance) return null;

  const bannerColor: Record<FatigueKind, string> = {
    ok: colors.accent, high: colors.warmup, spike: colors.danger, drop: colors.danger,
  };
  const toneColor = { good: colors.save, watch: colors.warmup, low: colors.danger };

  return (
    <View style={{ gap: spacing.md }}>
      {banner && (
        <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: bannerColor[banner.kind] }]}>
          <Text style={styles.title}>{banner.title}</Text>
          <Text style={styles.detail}>{banner.detail}</Text>
        </View>
      )}
      {balance && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Push / Pull / Legs</Text>
            {balance.ratio != null && balance.tone && (
              <Text style={[styles.badge, { color: toneColor[balance.tone], borderColor: toneColor[balance.tone] }]}>
                Pull : Push {balance.ratio.toFixed(1)} : 1
              </Text>
            )}
          </View>
          <View style={styles.bar} accessibilityLabel="Share of sets by push, pull, legs and core">
            {GROUPS.map((g, i) => balance.groups[g] > 0 && (
              <View key={g} style={{ flex: balance.groups[g], backgroundColor: palette[i] }} />
            ))}
          </View>
          <View style={styles.legend}>
            {GROUPS.map((g, i) => (
              <View key={g} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: palette[i] }]} />
                <Text style={styles.legendText}>{g} {Math.round(balance.groups[g])}</Text>
              </View>
            ))}
          </View>
          {balance.tone === 'low' && (
            <Text style={styles.detail}>Pulling less than pushing can strain the shoulders. Aim for at least as many pull sets as push sets.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary },
  title: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  detail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badge: {
    fontSize: typography.fontSize.xs, fontWeight: '700', borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2, overflow: 'hidden',
  },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginVertical: spacing.xs, backgroundColor: colors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
});
