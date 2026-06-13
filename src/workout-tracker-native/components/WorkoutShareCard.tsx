import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LaurelBranch } from './LaurelWreath';

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

const CARD_WIDTH = 360;

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

          <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>

          {/* Hero stat */}
          <View style={styles.hero}>
            <Text style={[styles.heroValue, { color: accentColor }]}>{heroValue}</Text>
            <Text style={styles.heroLabel}>{heroLabel}</Text>
          </View>

          {/* Secondary stats */}
          <View style={styles.statsRow}>
            {duration != null && duration > 0 && (
              <>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{fmtDurationMin(duration)}</Text>
                  <Text style={styles.statLabel}>Duration</Text>
                </View>
                <View style={styles.statDivider} />
              </>
            )}
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalSets}</Text>
              <Text style={styles.statLabel}>Sets</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalReps}</Text>
              <Text style={styles.statLabel}>Reps</Text>
            </View>
          </View>

          {/* PR banner */}
          {prs.length > 0 && (
            <View style={styles.prBanner}>
              <LaurelBranch height={18} color="#7A5800" />
              <Text style={styles.prText}>{prLabel}</Text>
              <LaurelBranch side="right" height={18} color="#7A5800" />
            </View>
          )}

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

          <Text style={styles.footer}>aretefitnessapp.com</Text>
        </View>
      </View>
    );
  }
);

WorkoutShareCard.displayName = 'WorkoutShareCard';

export default WorkoutShareCard;

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

  workoutName: {
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
    backgroundColor: '#FFD700',
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
    color: '#7A5800',
    flex: 1,
    textAlign: 'center',
  },

  exercises: {
    gap: 8,
    marginBottom: 18,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  exerciseName: {
    fontSize: 14,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  exerciseBest: {
    fontSize: 14,
    fontWeight: '700',
  },

  footer: {
    fontSize: 11,
    color: '#636366',
    textAlign: 'center',
  },
});
