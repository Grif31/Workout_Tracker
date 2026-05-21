import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type WorkoutShareCardProps = {
  workoutName: string;
  date: string;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  weightUnit: string;
  exerciseNames: string[];
  prs: { exercise_name: string; pr_type: string }[];
  accentColor: string;
};

const CARD_WIDTH = 360;

const WorkoutShareCard = forwardRef<View, WorkoutShareCardProps>(
  ({ workoutName, date, totalVolume, totalSets, totalReps, weightUnit, exerciseNames, prs, accentColor }, ref) => {
    const prLabel =
      prs.length === 1
        ? `${prs[0].exercise_name} — new ${prs[0].pr_type.replace(/_/g, ' ')} PR!`
        : `${prs.length} New PRs`;

    return (
      <View ref={ref} style={styles.card}>
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="barbell-outline" size={18} color={accentColor} />
            <Text style={styles.brandName}>ARETĒ</Text>
          </View>

          {/* Workout name + date */}
          <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>
          <Text style={styles.date}>{date}</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: accentColor }]}>
                {totalVolume.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Volume ({weightUnit})</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: accentColor }]}>{totalSets}</Text>
              <Text style={styles.statLabel}>Sets</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: accentColor }]}>{totalReps}</Text>
              <Text style={styles.statLabel}>Reps</Text>
            </View>
          </View>

          {/* PR banner */}
          {prs.length > 0 && (
            <View style={styles.prBanner}>
              <Text style={styles.prText}>🥇 {prLabel}</Text>
            </View>
          )}

          {/* Exercises */}
          {exerciseNames.length > 0 && (
            <View style={styles.exercises}>
              {exerciseNames.map((name, i) => (
                <Text key={i} style={styles.exerciseName}>• {name}</Text>
              ))}
            </View>
          )}

          {/* Footer */}
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
    flexDirection: 'row',
  },

  accentBar: {
    width: 6,
  },

  content: {
    flex: 1,
    padding: 24,
    paddingLeft: 20,
    gap: 0,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  workoutName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
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
    marginBottom: 16,
  },
  prText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A5800',
  },

  exercises: {
    gap: 4,
    marginBottom: 20,
  },
  exerciseName: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },

  footer: {
    fontSize: 11,
    color: '#636366',
    textAlign: 'center',
  },
});
