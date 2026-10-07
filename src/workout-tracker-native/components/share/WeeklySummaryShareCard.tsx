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
} from './ShareCardParts';
import { typography } from '../../theme/typography';
import { SHARE_TEXT } from '../../constants/shareCardTheme';
import StreakFlame from '../StreakFlame';

type WeeklySummaryShareCardProps = {
  dateRange: string;
  workouts: number;
  totalVolume: number;
  totalReps: number;
  totalDurationMin: number;
  weightUnit: string;
  /** Cardio distance for the week, already in distanceUnit; leads the card in a week with no lifting */
  distance?: number;
  distanceUnit?: 'km' | 'mi';
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
    dateRange, workouts, totalVolume, totalReps, totalDurationMin, weightUnit, distance, distanceUnit,
    prCount, prLabel, topMuscle, mostImprovedLift, mostImprovedCardio, streak, accentColor,
  }, ref) => {
    // The brag number is the first of these the week actually has: volume,
    // reps (an all-bodyweight week), distance (a runner's week), else the
    // workout count. Never a zero.
    const hasDistance = distance != null && distance > 0;
    const [heroValue, heroLabel] =
      totalVolume > 0 ? [totalVolume.toLocaleString(), `Total Volume (${weightUnit})`]
      : totalReps > 0 ? [totalReps.toLocaleString(), 'Total Reps']
      : hasDistance ? [distance!.toFixed(1), `Distance (${distanceUnit ?? 'km'})`]
      : [String(workouts), workouts === 1 ? 'Workout' : 'Workouts'];

    // `flame` draws the app's own streak flame in place of an emoji, which
    // renders at the mercy of the platform font in a captured image.
    const highlights = [
      streak != null && streak >= 1 ? { text: `${streak} week streak`, flame: true } : null,
      topMuscle ? { text: `${topMuscle} was the focus` } : null,
      mostImprovedLift ? { text: `Most Improved: ${mostImprovedLift.exercise_name}` } : null,
      mostImprovedCardio ? { text: `Most Improved Cardio: ${mostImprovedCardio.exercise_name}` } : null,
    ].filter((h): h is { text: string; flame?: boolean } => !!h);

    // Whatever became the headline isn't repeated in the row under it
    const workoutsLead = totalVolume <= 0 && totalReps <= 0 && !hasDistance;
    const statItems: ShareCardStatItem[] = workoutsLead ? [] : [{ value: workouts, label: 'Workouts' }];
    if (totalReps > 0 && totalVolume > 0) statItems.push({ value: totalReps, label: 'Reps' });
    // Shown beside lifting numbers; when distance is the headline it isn't repeated
    if (hasDistance && (totalVolume > 0 || totalReps > 0)) {
      statItems.push({ value: distance!.toFixed(1), label: distanceUnit === 'mi' ? 'Miles' : 'Km' });
    }
    statItems.push({ value: fmtDurationMin(totalDurationMin), label: 'Training Time' });

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
              <View key={i} style={styles.highlightRow}>
                {h.flame && <StreakFlame size={15} />}
                <Text style={styles.highlightText}>{h.text}</Text>
              </View>
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
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  highlightText: {
    fontSize: typography.fontSize.sm,
    color: SHARE_TEXT,
  },
});
