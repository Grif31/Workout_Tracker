import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LaurelBranch } from './LaurelWreath';
import { PR_GOLD, PR_GOLD_TEXT } from '../constants/prColors';

type WeeklySummaryShareCardProps = {
  dateRange: string;
  workouts: number;
  totalVolume: number;
  totalReps: number;
  totalDurationMin: number;
  weightUnit: string;
  prCount: number;
  prLabel?: string;
  topMuscle?: string | null;
  mostImprovedLift?: { exercise_name: string; gain: number } | null;
  streak?: number | null;
  accentColor: string;
};

const CARD_WIDTH = 360;

function fmtDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

const WeeklySummaryShareCard = forwardRef<View, WeeklySummaryShareCardProps>(
  ({
    dateRange, workouts, totalVolume, totalReps, totalDurationMin, weightUnit,
    prCount, prLabel, topMuscle, mostImprovedLift, streak, accentColor,
  }, ref) => {
    // All-bodyweight weeks have 0 volume — reps become the brag number
    const heroValue = totalVolume > 0 ? totalVolume.toLocaleString() : totalReps.toLocaleString();
    const heroLabel = totalVolume > 0 ? `Total Volume (${weightUnit})` : 'Total Reps';

    const highlights = [
      streak != null && streak >= 1 ? `🔥 ${streak} week streak` : null,
      topMuscle ? `${topMuscle} was the focus` : null,
      mostImprovedLift ? `${mostImprovedLift.exercise_name} up ${mostImprovedLift.gain} ${weightUnit}` : null,
    ].filter((s): s is string => !!s);

    return (
      <View ref={ref} style={styles.card}>
        <View style={[styles.accentEdge, { backgroundColor: accentColor }]} />
        <View style={styles.content}>
          {/* Brand + date range */}
          <View style={styles.header}>
            <Image
              source={require('../assets/Arete_name.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.date}>{dateRange}</Text>
          </View>

          <Text style={styles.title}>Weekly Summary</Text>

          {/* Hero stat */}
          <View style={styles.hero}>
            <Text style={[styles.heroValue, { color: accentColor }]}>{heroValue}</Text>
            <Text style={styles.heroLabel}>{heroLabel}</Text>
          </View>

          {/* Secondary stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{workouts}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalReps}</Text>
              <Text style={styles.statLabel}>Reps</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{fmtDurationMin(totalDurationMin)}</Text>
              <Text style={styles.statLabel}>Training Time</Text>
            </View>
          </View>

          {/* PR banner */}
          {prCount > 0 && (
            <View style={styles.prBanner}>
              <LaurelBranch height={18} color={PR_GOLD_TEXT} />
              <Text style={styles.prText}>{prCount === 1 ? prLabel : `${prCount} New PRs`}</Text>
              <LaurelBranch side="right" height={18} color={PR_GOLD_TEXT} />
            </View>
          )}

          {/* Highlights */}
          {highlights.length > 0 && (
            <View style={styles.highlights}>
              {highlights.map((h, i) => (
                <Text key={i} style={styles.highlightText}>{h}</Text>
              ))}
            </View>
          )}

          <Text style={styles.footer}>aretefitnessapp.com</Text>
        </View>
      </View>
    );
  }
);

WeeklySummaryShareCard.displayName = 'WeeklySummaryShareCard';

export default WeeklySummaryShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
  },
  accentEdge: {
    height: 5,
  },
  content: {
    padding: 24,
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
    color: '#8E8E93',
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 14,
  },

  hero: {
    marginBottom: 16,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  heroLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 2,
  },

  prBanner: {
    backgroundColor: PR_GOLD,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prText: {
    fontSize: 13,
    fontWeight: '700',
    color: PR_GOLD_TEXT,
    flex: 1,
    textAlign: 'center',
  },

  highlights: {
    gap: 6,
    marginBottom: 18,
  },
  highlightText: {
    fontSize: 14,
    color: '#FFFFFF',
  },

  footer: {
    fontSize: 11,
    color: '#636366',
    textAlign: 'center',
  },
});
