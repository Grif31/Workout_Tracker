import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type VelocityStatus = 'gaining' | 'plateau' | 'declining' | 'insufficient';
export type LiftVelocity = {
  exercise_template_id: number;
  exercise_name: string | null;
  sessions: number;
  current_e1rm: number | null;
  status: VelocityStatus;
  rate_per_month: number | null;
  rate_pct_per_month: number | null;
};

type Props = {
  exerciseId: number;
  weightUnit: string;
  isPremium: boolean;
  onUnlock: () => void;
};

/** How fast this lift's estimated 1RM is climbing: the rate for Premium, a locked card for a free account. */
export default function ProgressRateCard({ exerciseId, weightUnit, isPremium, onUnlock }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lift, setLift] = useState<LiftVelocity | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLift(null);
    apiFetch(`/api/stats/pr-velocity?exercise_template_id=${exerciseId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setLift(data?.exercises?.[0] ?? null); })
      .catch(() => { if (!cancelled) setLift(null); });
    return () => { cancelled = true; };
  }, [exerciseId]);

  // Nothing to say about a lift that has not been logged in the last 12 weeks
  if (!lift) return null;

  if (!isPremium) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.locked]}
        onPress={onUnlock}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Progress rate, premium"
      >
        <View style={styles.lockCircle}>
          <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.label}>Progress rate</Text>
          <Text style={styles.sub}>See how fast this lift is gaining</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  const tone = {
    gaining: colors.save, plateau: colors.warmup, declining: colors.danger, insufficient: colors.textSecondary,
  }[lift.status];
  const rate = lift.rate_per_month;
  const headline = rate == null
    ? 'Not enough data yet'
    : `${rate > 0 ? '+' : ''}${rate} ${weightUnit}/month`;
  const detail = {
    gaining: `Estimated 1RM, about ${lift.rate_pct_per_month}% a month.`,
    plateau: 'Flat for 8 weeks. A lighter week, then a new rep range or variation, often gets it moving.',
    declining: 'Your estimated 1RM has been falling. Check sleep, food and how much you are doing around this lift.',
    insufficient: 'Log this lift on a few more days over several weeks to see its rate.',
  }[lift.status];

  return (
    <View style={styles.card} accessibilityLabel={`Progress rate ${headline}`}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <View style={styles.textCol}>
        <Text style={styles.label}>Progress rate</Text>
        <Text style={[styles.value, { color: tone }]}>{headline}</Text>
        <Text style={styles.sub}>{detail}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: spacing.sm + 4, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  locked: { opacity: 0.85 },
  lockCircle: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  textCol: { flex: 1, gap: 2 },
  label: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  value: { fontSize: typography.fontSize.lg, fontWeight: '800' },
  sub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
});
