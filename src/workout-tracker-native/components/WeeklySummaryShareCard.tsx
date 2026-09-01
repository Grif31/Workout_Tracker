import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ShareCardFrame,
  ShareCardHeader,
  ShareCardBanner,
  ShareCardHero,
  ShareCardHeroLabel,
  ShareCardStatsRow,
  ShareCardFooter,
  type ShareCardStatItem,
} from './share/ShareCardParts';
import { typography } from '../theme/typography';
import { SHARE_TEXT } from '../constants/shareCardTheme';

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
  mostImprovedLift?: { exercise_name: string } | null;
  mostImprovedCardio?: { exercise_name: string } | null;
  streak?: number | null;
  accentColor: string;
};

function fmtDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

const WeeklySummaryShareCard = forwardRef<View, WeeklySummaryShareCardProps>(
  ({
    dateRange, workouts, totalVolume, totalReps, totalDurationMin, weightUnit,
    prCount, prLabel, topMuscle, mostImprovedLift, mostImprovedCardio, streak, accentColor,
  }, ref) => {
    // All-bodyweight weeks have 0 volume — reps become the brag number
    const heroValue = totalVolume > 0 ? totalVolume.toLocaleString() : totalReps.toLocaleString();
    const heroLabel = totalVolume > 0 ? `Total Volume (${weightUnit})` : 'Total Reps';

    const highlights = [
      streak != null && streak >= 1 ? `🔥 ${streak} week streak` : null,
      topMuscle ? `${topMuscle} was the focus` : null,
      mostImprovedLift ? `Most Improved: ${mostImprovedLift.exercise_name}` : null,
      mostImprovedCardio ? `Most Improved Cardio: ${mostImprovedCardio.exercise_name}` : null,
    ].filter((s): s is string => !!s);

    const statItems: ShareCardStatItem[] = [
      { value: workouts, label: 'Workouts' },
      { value: totalReps, label: 'Reps' },
      { value: fmtDurationMin(totalDurationMin), label: 'Training Time' },
    ];

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date={dateRange} />

        <Text style={styles.title}>Weekly Summary</Text>

        <ShareCardHero value={heroValue} accentColor={accentColor}>
          <ShareCardHeroLabel>{heroLabel}</ShareCardHeroLabel>
        </ShareCardHero>

        <ShareCardStatsRow items={statItems} />

        {prCount > 0 && <ShareCardBanner text={prCount === 1 ? (prLabel ?? '') : `${prCount} New PRs`} />}

        {highlights.length > 0 && (
          <View style={styles.highlights}>
            {highlights.map((h, i) => (
              <Text key={i} style={styles.highlightText}>{h}</Text>
            ))}
          </View>
        )}

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

WeeklySummaryShareCard.displayName = 'WeeklySummaryShareCard';

export default WeeklySummaryShareCard;

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
    marginBottom: 14,
  },
  highlights: {
    gap: 6,
    marginBottom: 18,
  },
  highlightText: {
    fontSize: typography.fontSize.sm,
    color: SHARE_TEXT,
  },
});
