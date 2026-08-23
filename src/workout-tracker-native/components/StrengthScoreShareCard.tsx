import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LaurelBranch } from './LaurelWreath';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { PR_GOLD, PR_GOLD_TEXT } from '../constants/prColors';
import { SHARE_BG, SHARE_SURFACE, SHARE_DIVIDER, SHARE_TEXT, SHARE_TEXT_MUTED, SHARE_TEXT_FOOTER } from '../constants/shareCardTheme';

type StrengthScoreShareCardProps = {
  score: number;
  rankLabel: string;
  exercisesUsed: number;
  muscleGroupsUsed: number;
  accentColor: string;
  date: string;
  /** Swaps in the gold/laurel "Rank Up!" treatment used for PR banners elsewhere. */
  isRankUp?: boolean;
};

const CARD_WIDTH = 360;

const StrengthScoreShareCard = forwardRef<View, StrengthScoreShareCardProps>(
  ({ score, rankLabel, exercisesUsed, muscleGroupsUsed, accentColor, date, isRankUp }, ref) => {
    return (
      <View ref={ref} style={styles.card}>
        <View style={[styles.accentEdge, { backgroundColor: accentColor }]} />
        <View style={styles.content}>
          {/* Brand + date */}
          <View style={styles.header}>
            <Image
              source={require('../assets/Arete_name.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.date}>{date}</Text>
          </View>

          <Text style={styles.title}>{isRankUp ? 'Rank Up!' : 'My Strength Score'}</Text>

          {isRankUp && (
            <View style={styles.rankUpBanner}>
              <LaurelBranch height={18} color={PR_GOLD_TEXT} />
              <Text style={styles.rankUpText}>Now: {rankLabel}</Text>
              <LaurelBranch side="right" height={18} color={PR_GOLD_TEXT} />
            </View>
          )}

          {/* Hero stat */}
          <View style={styles.hero}>
            <Text style={[styles.heroValue, { color: accentColor }]}>{score}</Text>
            <Text style={styles.heroLabel}>{rankLabel}</Text>
          </View>

          {/* Secondary stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{exercisesUsed}</Text>
              <Text style={styles.statLabel}>{exercisesUsed === 1 ? 'Exercise' : 'Exercises'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{muscleGroupsUsed}</Text>
              <Text style={styles.statLabel}>{muscleGroupsUsed === 1 ? 'Muscle Group' : 'Muscle Groups'}</Text>
            </View>
          </View>

          <Text style={styles.footer}>aretefitnessapp.com</Text>
        </View>
      </View>
    );
  }
);

StrengthScoreShareCard.displayName = 'StrengthScoreShareCard';

export default StrengthScoreShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: SHARE_BG,
    borderRadius: 20,
    overflow: 'hidden',
  },
  accentEdge: {
    height: 5,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  logo: {
    width: 86,
    height: 28,
  },
  date: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
    marginBottom: 14,
  },

  rankUpBanner: {
    backgroundColor: PR_GOLD,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: PR_GOLD_TEXT,
    flex: 1,
    textAlign: 'center',
  },

  hero: {
    marginBottom: spacing.md,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  heroLabel: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: SHARE_SURFACE,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 18,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: SHARE_TEXT,
  },
  statLabel: {
    fontSize: 10,
    color: SHARE_TEXT_MUTED,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: SHARE_DIVIDER,
    marginVertical: 2,
  },

  footer: {
    fontSize: typography.fontSize.xs,
    color: SHARE_TEXT_FOOTER,
    textAlign: 'center',
  },
});
