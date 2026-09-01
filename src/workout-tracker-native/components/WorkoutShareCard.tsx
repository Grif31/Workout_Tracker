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
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { SHARE_TEXT } from '../constants/shareCardTheme';

export type ShareExercise = {
  name: string;
  bestSet?: { reps: number; weight: number } | null;
};

type WorkoutShareCardProps = {
  workoutName: string;
  date: string;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  /** workout duration in minutes */
  duration?: number | null;
  weightUnit: string;
  exercises: ShareExercise[];
  prs: { exercise_name: string; pr_type: string }[];
  accentColor: string;
};

const PR_TYPE_LABELS: Record<string, string> = {
  max_weight: 'Max Weight',
  max_reps: 'Rep Record',
  best_time: 'Best Time',
  best_distance: 'Best Distance',
};

function fmtDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function bestSetLabel(set: { reps: number; weight: number }, unit: string): string {
  // weight 0 = bodyweight set
  return set.weight > 0 ? `${set.weight} ${unit} × ${set.reps}` : `${set.reps} reps`;
}

const WorkoutShareCard = forwardRef<View, WorkoutShareCardProps>(
  ({ workoutName, date, totalVolume, totalSets, totalReps, duration, weightUnit, exercises, prs, accentColor }, ref) => {
    const prLabel =
      prs.length === 1
        ? `New ${prs[0].exercise_name} ${PR_TYPE_LABELS[prs[0].pr_type] ?? 'PR'}!`
        : `${prs.length} New PRs`;

    // All-bodyweight sessions have 0 volume — reps become the brag number
    const heroValue = totalVolume > 0 ? totalVolume.toLocaleString() : totalReps.toLocaleString();
    const heroLabel = totalVolume > 0 ? `Total Volume (${weightUnit})` : 'Total Reps';

    const statItems: ShareCardStatItem[] = [];
    if (duration != null && duration > 0) {
      statItems.push({ value: fmtDurationMin(duration), label: 'Duration' });
    }
    statItems.push({ value: totalSets, label: 'Sets' });
    statItems.push({ value: totalReps, label: 'Reps' });

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
