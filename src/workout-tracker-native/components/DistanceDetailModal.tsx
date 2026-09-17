import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { STRENGTH_TIERS, SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../constants/strengthRanks';
import { fmtRaceTime, fmtPaceForUnit } from '../utils/cardioFormat';
import type { DistanceUnit } from '../utils/units';
import SectionRule from './SectionRule';

export type DistanceEntry = {
  label: string;
  distance_km: number;
  pace_min_per_km: number;
  percentile: number;
  rank: { label: string; tier: number; display: string };
  tier: 'core' | 'speed';
  thresholds: { percentile: number; rank: string; pace_min_per_km: number }[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  distance: DistanceEntry | null;
  distanceUnit: DistanceUnit;
};

// The Endurance Score counterpart to LiftDetailModal: tap a distance row to
// see where the time ranks and what every rank asks for at that distance.
export default function DistanceDetailModal({ visible, onClose, distance, distanceUnit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          {distance && (() => {
            const color = SCORE_RANK_COLORS[distance.rank.label] ?? colors.accent;
            const pct = distance.percentile;
            // modalSheet has paddingHorizontal: spacing.lg on each side
            const BAR_W = Dimensions.get('window').width - spacing.lg * 2;
            const timeFor = (paceMinPerKm: number) => fmtRaceTime(paceMinPerKm * distance.distance_km);
            const paceLabel = distanceUnit === 'mi' ? '/mi' : '/km';
            // Pace only helps from 5K up, same rule as the distance rows
            const showPace = distance.tier === 'core';

            // thresholds are sorted by percentile (see _TIER_BOUNDARIES in
            // strength_score_routes.py), so the first one above is the next rank
            const next = distance.thresholds.find(t => t.percentile > pct) ?? null;
            const minutesToNext = next
              ? (distance.pace_min_per_km - next.pace_min_per_km) * distance.distance_km
              : null;

            return (
              <>
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{distance.label}</Text>

                {/* Hero stat */}
                <View style={styles.hero}>
                  <Text style={[styles.heroPercentile, { color }]}>
                    {pct < 10 ? '< 10th percentile' : `Faster than ${Math.round(pct)}%`}
                  </Text>
                  {pct >= 10 && <Text style={styles.heroSub}>of runners</Text>}
                  <View style={[styles.rankBadge, { backgroundColor: color + '22', borderColor: color }]}>
                    <Ionicons name={SCORE_RANK_ICONS[distance.rank.label] ?? 'ellipse-outline'} size={11} color={color} />
                    <Text style={[styles.rankBadgeText, { color }]}>{distance.rank.display}</Text>
                  </View>
                  <Text style={styles.bestTime}>
                    Best time: {timeFor(distance.pace_min_per_km)}
                    {showPace ? `  ·  ${fmtPaceForUnit(distance.pace_min_per_km, distanceUnit)}${paceLabel}` : ''}
                  </Text>
                  {next && minutesToNext != null && minutesToNext > 0 && (
                    <Text style={[styles.nextRankText, { color: colors.textPrimary }]}>
                      <Text style={styles.nextRankGap}>{fmtRaceTime(minutesToNext)}</Text> faster to reach {next.rank}
                    </Text>
                  )}
                </View>

                {/* Tier distribution bar */}
                <SectionRule label="Where You Rank" style={{ marginTop: spacing.sm }} />
                <View style={{ marginTop: spacing.xs }}>
                  <View style={styles.markerTrack}>
                    <View style={[styles.markerTriangle, { left: (pct / 100) * BAR_W - 6 }]} />
                  </View>
                  <View style={styles.tierBar}>
                    {STRENGTH_TIERS.map(tier => (
                      <View
                        key={tier.label}
                        style={{ flex: tier.high - tier.low, backgroundColor: tier.color, opacity: pct >= tier.low ? 1 : 0.25 }}
                      />
                    ))}
                  </View>
                  {/* Names only: a finish time won't fit under Legend's 5% slice,
                      so the times get their own list below */}
                  <View style={styles.tierLabelRow}>
                    {STRENGTH_TIERS.map(tier => (
                      <View key={tier.label} style={{ flex: tier.high - tier.low, alignItems: 'center' }}>
                        <Text
                          style={[styles.tierBarLabel, { color: pct >= tier.low ? tier.color : colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {tier.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Every rank and the time it takes */}
                <SectionRule label="Times By Rank" style={{ marginTop: spacing.sm }} />
                <View>
                  {STRENGTH_TIERS.map(tier => {
                    const threshold = distance.thresholds.find(t => t.rank === tier.label);
                    // Novice has no lower boundary: it's anything slower than Beginner
                    const beginner = distance.thresholds.find(t => t.rank === 'Beginner');
                    const reached = pct >= tier.low;
                    const isCurrent = tier.label === distance.rank.label;
                    return (
                      <View
                        key={tier.label}
                        testID={`distance-tier-${tier.label}${isCurrent ? '-current' : ''}`}
                        style={[styles.tierListRow, isCurrent && { backgroundColor: tier.color + '1F' }]}
                      >
                        <Ionicons
                          name={reached ? (SCORE_RANK_ICONS[tier.label] ?? 'ellipse-outline') : 'lock-closed'}
                          size={14}
                          color={reached ? tier.color : colors.textSecondary}
                        />
                        <Text style={[styles.tierListName, { color: reached ? tier.color : colors.textSecondary }, isCurrent && styles.tierListCurrent]}>
                          {tier.label}
                        </Text>
                        <View style={styles.tierListTimes}>
                          {threshold ? (
                            <>
                              <Text style={[styles.tierListTime, isCurrent && styles.tierListCurrent]}>
                                {timeFor(threshold.pace_min_per_km)}
                              </Text>
                              {showPace && (
                                <Text style={styles.tierListPace}>
                                  {fmtPaceForUnit(threshold.pace_min_per_km, distanceUnit)}{paceLabel}
                                </Text>
                              )}
                            </>
                          ) : beginner ? (
                            <Text style={styles.tierListPace}>Slower than {timeFor(beginner.pace_min_per_km)}</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Tier sub-rank dots */}
                <View style={[styles.tierRow, { marginTop: spacing.sm }]}>
                  {[1, 2, 3].map(t => (
                    <View key={t} style={[styles.tierDot, { backgroundColor: t <= distance.rank.tier ? color : colors.border }]} />
                  ))}
                  <Text style={[styles.tierLabel, { color: colors.textSecondary }]}>
                    Tier {distance.rank.tier}/3 within {distance.rank.label}
                  </Text>
                </View>
              </>
            );
          })()}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: spacing.xl * 2, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.sm,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  heroPercentile: { fontSize: 36, fontWeight: '800' },
  heroSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  rankBadge: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: spacing.xs,
  },
  rankBadgeText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  bestTime: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  nextRankText: { fontSize: typography.fontSize.sm, marginTop: 2 },
  nextRankGap: { fontWeight: '800' },
  markerTrack: { height: 12, position: 'relative', marginBottom: 2 },
  markerTriangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.textPrimary,
    top: 2,
  },
  tierBar: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden' },
  tierLabelRow: { flexDirection: 'row', marginTop: spacing.xs },
  tierBarLabel: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
  tierListRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm,
  },
  tierListName: { fontSize: typography.fontSize.sm, fontWeight: '600', flex: 1 },
  tierListTimes: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  tierListTime: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  tierListPace: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  tierListCurrent: { fontWeight: '800' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tierDot: { width: 12, height: 12, borderRadius: 6 },
  tierLabel: { fontSize: typography.fontSize.sm, marginLeft: spacing.xs },
});
