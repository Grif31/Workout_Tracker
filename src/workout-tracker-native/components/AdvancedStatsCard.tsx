import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import SectionRule from './SectionRule';
import { CATEGORICAL_COLORS } from '../constants/categoricalColors';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { fatigueBanner, pplBalance, PPL_GROUPS, type FatigueKind, type PplGroup } from '../utils/muscleTrends';

export type DensityBucket = { label: string; density?: number };

type Props = {
  muscleSets: Record<string, number>;
  /** Working sets so far this week and last week's up to the same weekday */
  setsToDate: number;
  lastWeekSetsToDate?: number;
  densityBuckets: DensityBucket[];
  /** The user has ever logged a workout with both a duration and volume (metrics_logged.density) */
  hasDensity: boolean;
  weightUnit: string;
};

const GROUPS = Object.keys(PPL_GROUPS) as PplGroup[];
const DENSITY_BAR_HEIGHT = 84;
// Past this many bars, only every other bucket gets a label so they don't collide
const LABEL_EVERY_OTHER_OVER = 8;

/**
 * The Progress tab's premium stats under the muscle chart, as three
 * labelled sections on the page: how this week's load compares with last week's, push /
 * pull / legs balance, and workout density. A section with nothing to say is
 * left out; a free account sees the whole card blurred behind one lock.
 */
export default function AdvancedStatsCard({
  muscleSets, setsToDate, lastWeekSetsToDate, densityBuckets, hasDensity, weightUnit,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const palette = mode === 'dark' ? CATEGORICAL_COLORS.dark : CATEGORICAL_COLORS.light;

  const load = lastWeekSetsToDate != null ? fatigueBanner(setsToDate, lastWeekSetsToDate) : null;
  const balance = pplBalance(muscleSets);
  const densityValues = useMemo(() => densityBuckets.map(b => Math.round(b.density ?? 0)), [densityBuckets]);
  if (!load && !balance && !hasDensity) return null;

  const loadColor: Record<FatigueKind, string> = {
    ok: colors.accent, high: colors.warmup, spike: colors.danger, drop: colors.danger,
  };
  const toneColor = { good: colors.save, watch: colors.warmup, low: colors.danger };

  const timed = densityValues.filter(v => v > 0);
  const densityMax = Math.max(...densityValues, 1);
  const thin = densityBuckets.length > LABEL_EVERY_OTHER_OVER;

  return (
    <View style={styles.card}>
      {load && (
        <View style={styles.section}>
          <SectionRule label="Weekly load" />
          <View style={styles.loadRow} accessibilityLabel={load.title}>
            <View style={styles.loadNumber}>
              <Text style={[styles.bigNumber, { color: loadColor[load.kind] }]}>{load.pct > 0 ? '+' : ''}{load.pct}%</Text>
              <Text style={styles.caption}>vs last week</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headline}>{load.headline}</Text>
              <Text style={styles.detail}>{load.detail}</Text>
            </View>
          </View>
        </View>
      )}

      {balance && (
        <View style={styles.section}>
          <SectionRule label="Push / Pull / Legs" />
          <View style={styles.balanceHeader}>
            <Text style={styles.detail}>Share of this week's sets</Text>
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

      {hasDensity && (
        <View style={styles.section}>
          <SectionRule label="Workout density" />
          <Text style={styles.detail}>
            {timed.length
              ? `${weightUnit} lifted per minute, timed workouts only. Latest ${timed[timed.length - 1]}, average ${Math.round(timed.reduce((a, b) => a + b, 0) / timed.length)}.`
              : 'No timed workouts in this range yet.'}
          </Text>
          <View style={styles.densityBars} accessibilityLabel={`Density by period, ${weightUnit} per minute`}>
            {densityValues.map((v, i) => (
              <View key={`${densityBuckets[i].label}-${i}`} style={styles.densityCol}>
                <View style={styles.densityArea}>
                  <View
                    style={{
                      width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3,
                      height: Math.max(v > 0 ? 3 : 0, (v / densityMax) * DENSITY_BAR_HEIGHT),
                      backgroundColor: v > 0 ? colors.accent : colors.border,
                    }}
                  />
                </View>
                <Text style={styles.axis} numberOfLines={1}>
                  {!thin || (densityBuckets.length - 1 - i) % 2 === 0 ? densityBuckets[i].label : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  // No box of its own: the sections sit on the page under their hairline headings
  card: { gap: spacing.lg, marginBottom: spacing.md },
  section: { gap: spacing.sm },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  loadNumber: { alignItems: 'center', minWidth: 92 },
  bigNumber: { fontSize: typography.fontSize.xxl, fontWeight: '800' },
  caption: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  headline: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  detail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badge: {
    fontSize: typography.fontSize.xs, fontWeight: '700', borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2, overflow: 'hidden',
  },
  bar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  densityBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  densityCol: { flex: 1, alignItems: 'center' },
  densityArea: { height: DENSITY_BAR_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  axis: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 4 },
});
