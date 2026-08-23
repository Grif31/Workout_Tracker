import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { STRENGTH_TIERS, SCORE_RANK_COLORS } from '../constants/strengthRanks';
import SectionRule from './SectionRule';

export type LiftEntry = {
  exercise: string;
  percentile: number | null;
  rank: { label: string; tier: number; display: string } | null;
  estimated_1rm?: number | null;
  thresholds?: { percentile: number; rank: string; weight: number }[];
  has_data: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  lift: LiftEntry | null;
  weightUnit: string;
};

// Shared between StrengthScoreScreen (tap a lift row) and ExerciseDetailScreen
// (tap the inline Strength Score card) — same percentile/rank breakdown either way.
export default function LiftDetailModal({ visible, onClose, lift, weightUnit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          {lift?.has_data && (() => {
            const liftColor = lift.rank ? (SCORE_RANK_COLORS[lift.rank.label] ?? colors.accent) : colors.accent;
            const pct = lift.percentile ?? 0;
            const TIERS = STRENGTH_TIERS;
            // modalSheet has paddingHorizontal: spacing.lg on each side
            const BAR_W = Dimensions.get('window').width - spacing.lg * 2;

            return (
              <>
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{lift.exercise}</Text>

                {/* Hero stat */}
                <View style={styles.liftHero}>
                  <Text style={[styles.liftPercentileText, { color: liftColor }]}>
                    {pct < 10 ? '< 10th percentile' : `Stronger than ${Math.round(pct)}%`}
                  </Text>
                  {pct >= 10 && (
                    <Text style={styles.liftPercentileSub}>of all lifters</Text>
                  )}
                  {lift.rank && (
                    <View style={[styles.miniRankBadge, { backgroundColor: liftColor + '22', borderColor: liftColor, alignSelf: 'center', marginTop: spacing.xs }]}>
                      <Text style={[styles.miniRankText, { color: liftColor }]}>{lift.rank.display}</Text>
                    </View>
                  )}
                  {lift.estimated_1rm != null && (
                    <Text style={styles.liftOneRM}>Est. 1RM: {lift.estimated_1rm} {weightUnit}</Text>
                  )}
                </View>

                {/* Rank tier distribution bar */}
                <SectionRule label="Where You Rank" style={{ marginTop: spacing.sm }} />
                <View style={{ marginTop: spacing.xs }}>
                  {/* Marker line */}
                  <View style={{ height: 12, position: 'relative', marginBottom: 2 }}>
                    <View style={[styles.markerTriangle, { left: (pct / 100) * BAR_W - 6 }]} />
                  </View>
                  {/* Segmented bar */}
                  <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden' }}>
                    {TIERS.map(tier => (
                      <View
                        key={tier.label}
                        style={{ flex: tier.high - tier.low, backgroundColor: tier.color, opacity: pct >= tier.low ? 1 : 0.25 }}
                      />
                    ))}
                  </View>
                  {/* Labels + weight thresholds */}
                  <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
                    {TIERS.map(tier => {
                      const threshold = lift.thresholds?.find(t => t.rank === tier.label);
                      const reached = pct >= tier.low;
                      return (
                        <View key={tier.label} style={{ flex: tier.high - tier.low, alignItems: 'center' }}>
                          <Text style={[styles.tierBarLabel, { color: reached ? tier.color : colors.textSecondary }]} numberOfLines={1}>
                            {tier.label}
                          </Text>
                          {threshold && (
                            <Text style={[styles.tierBarWeight, { color: reached ? tier.color : colors.textSecondary }]} numberOfLines={1}>
                              {threshold.weight} {weightUnit}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Tier sub-rank dots */}
                {lift.rank && (
                  <View style={[styles.tierRow, { marginTop: spacing.md }]}>
                    {[1, 2, 3].map(t => (
                      <View key={t} style={[styles.tierDot, { backgroundColor: t <= lift.rank!.tier ? liftColor : colors.border }]} />
                    ))}
                    <Text style={[styles.tierLabel, { color: colors.textSecondary }]}>
                      Tier {lift.rank.tier}/3 within {lift.rank.label}
                    </Text>
                  </View>
                )}
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
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tierDot: { width: 12, height: 12, borderRadius: 6 },
  tierLabel: { fontSize: typography.fontSize.sm, marginLeft: spacing.xs },
  liftHero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  liftPercentileText: { fontSize: 36, fontWeight: '800' },
  liftPercentileSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  liftOneRM: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
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
  tierBarLabel: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
  tierBarWeight: { fontSize: 7, textAlign: 'center', marginTop: 1 },
  miniRankBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  miniRankText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
});
