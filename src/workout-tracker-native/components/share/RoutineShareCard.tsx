import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShareCardFrame, ShareCardHeader, ShareCardFooter } from './ShareCardParts';
import {
  ShareExerciseTable,
  tableColumns,
  totalProgrammedSets,
  type ShareTemplateExercise,
} from './ShareExerciseTable';
import { spacing } from '../../theme/spacing';
import { SHARE_TEXT, SHARE_TEXT_MUTED } from '../../constants/shareCardTheme';

export type ShareRoutineDay = { label: string; exercises: ShareTemplateExercise[] };

type RoutineShareCardProps = {
  routineName: string;
  description?: string | null;
  days: ShareRoutineDay[];
  accentColor: string;
};

// Lower than the template card's cap: a whole week of days stacks on one image
const MAX_ROWS_PER_DAY = 8;

const RoutineShareCard = forwardRef<View, RoutineShareCardProps>(
  ({ routineName, description, days, accentColor }, ref) => {
    const allExercises = days.flatMap(d => d.exercises);
    const columns = tableColumns(allExercises);

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date="Workout Routine" />

        <Text style={styles.routineName} numberOfLines={2}>{routineName}</Text>
        <Text style={styles.summary}>
          {days.length} {days.length === 1 ? 'day' : 'days'}  ·  {allExercises.length}{' '}
          {allExercises.length === 1 ? 'exercise' : 'exercises'}
        </Text>
        {description ? <Text style={styles.description} numberOfLines={3}>{description}</Text> : null}

        <View style={styles.days}>
          {days.map((day, i) => {
            const sets = totalProgrammedSets(day.exercises);
            return (
              <View key={i} style={styles.day}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayLabel, { color: accentColor }]} numberOfLines={1}>
                    {day.label}
                  </Text>
                  {sets > 0 && <Text style={styles.daySets}>{sets} {sets === 1 ? 'set' : 'sets'}</Text>}
                </View>
                {day.exercises.length > 0 ? (
                  <ShareExerciseTable
                    exercises={day.exercises}
                    columns={columns}
                    accentColor={accentColor}
                    maxRows={MAX_ROWS_PER_DAY}
                  />
                ) : (
                  <Text style={styles.empty}>No exercises</Text>
                )}
              </View>
            );
          })}
        </View>

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

RoutineShareCard.displayName = 'RoutineShareCard';

export default RoutineShareCard;

const styles = StyleSheet.create({
  routineName: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
  },
  summary: {
    fontSize: 13,
    color: SHARE_TEXT_MUTED,
    marginTop: spacing.xs,
  },
  description: {
    fontSize: 13,
    color: SHARE_TEXT,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  days: {
    marginBottom: 18,
  },
  day: {
    marginTop: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 6,
  },
  dayLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  daySets: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
  },
  empty: {
    fontSize: 13,
    color: SHARE_TEXT_MUTED,
    fontStyle: 'italic',
  },
});
