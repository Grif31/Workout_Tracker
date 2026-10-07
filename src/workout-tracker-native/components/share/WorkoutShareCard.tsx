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
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { SHARE_TEXT } from '../../constants/shareCardTheme';
import { PR_TYPE_LABELS } from '../../utils/prFormat';
import { fmtHold } from '../workout/types';

export type ShareExercise = {
  name: string;
  bestSet?: { reps: number; weight: number } | null;
};

type WorkoutShareCardProps = {
  workoutName: string;
  date: string;
  /** Volume already converted and formatted in weightUnit; null for a session
   *  with none (all bodyweight), which leads with reps instead. Callers format
   *  it because only they know whether their figure is the API's lbs total. */
  volumeText: string | null;
  totalSets: number;
  totalReps: number;
  /** workout duration in minutes */
  duration?: number | null;
  /** Total time under tension across timed holds, in minutes. Leads the card
   *  for a session of planks and wall sits, which has no reps or volume. */
  holdMinutes?: number;
  weightUnit: string;
  exercises: ShareExercise[];
  prs: { exercise_name: string; pr_type: string }[];
  accentColor: string;
};

function fmtDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function bestSetLabel(set: { reps: number; weight: number }, unit: string): string {
  // weight 0 = bodyweight set
  // Reps first, like the workout log's columns
  return set.weight > 0 ? `${set.reps} × ${set.weight} ${unit}` : `${set.reps} reps`;
}

const WorkoutShareCard = forwardRef<View, WorkoutShareCardProps>(
  ({ workoutName, date, volumeText, totalSets, totalReps, duration, holdMinutes, weightUnit, exercises, prs, accentColor }, ref) => {
    const prLabel =
      prs.length === 1
        ? `New ${prs[0].exercise_name} ${PR_TYPE_LABELS[prs[0].pr_type] ?? 'PR'}`
        : `${prs.length} New PRs`;

    // The brag number is the first of these the session has: volume, reps (all
    // bodyweight), hold time (planks, wall sits), else the set count. Never a zero.
    const [heroValue, heroLabel] =
      volumeText ? [volumeText, `Total Volume (${weightUnit})`]
      : totalReps > 0 ? [totalReps.toLocaleString(), 'Total Reps']
      : holdMinutes && holdMinutes > 0 ? [fmtHold(holdMinutes), 'Total Hold Time']
      : [String(totalSets), totalSets === 1 ? 'Set' : 'Sets'];

    const statItems: ShareCardStatItem[] = [];
    if (duration != null && duration > 0) {
      statItems.push({ value: fmtDurationMin(duration), label: 'Duration' });
    }
    statItems.push({ value: totalSets, label: 'Sets' });
    // Not repeated under the headline when reps are the headline
    if (totalReps > 0 && volumeText) statItems.push({ value: totalReps, label: 'Reps' });

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date={date} />

        <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>

        <ShareCardHero value={heroValue} accentColor={accentColor}>
          <ShareCardHeroLabel>{heroLabel}</ShareCardHeroLabel>
        </ShareCardHero>

        <ShareCardStatsRow items={statItems} />

        {prs.length > 0 && <ShareCardBanner text={prLabel} />}

        {/* Top exercises with best sets */}
        {exercises.length > 0 && (
          <View style={styles.exercises}>
            {exercises.slice(0, 3).map((ex, i) => (
              <View key={i} style={styles.exerciseRow}>
                <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
                {ex.bestSet && (
                  <Text style={[styles.exerciseBest, { color: accentColor }]}>
                    {bestSetLabel(ex.bestSet, weightUnit)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

WorkoutShareCard.displayName = 'WorkoutShareCard';

export default WorkoutShareCard;

const styles = StyleSheet.create({
  workoutName: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
    marginBottom: 14,
  },
  exercises: {
    gap: spacing.sm,
    marginBottom: 18,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  exerciseName: {
    fontSize: typography.fontSize.sm,
    color: SHARE_TEXT,
    flexShrink: 1,
  },
  exerciseBest: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
});
