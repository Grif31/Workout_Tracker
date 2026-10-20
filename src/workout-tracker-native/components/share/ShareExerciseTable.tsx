import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { SHARE_SURFACE, SHARE_DIVIDER, SHARE_TEXT, SHARE_TEXT_MUTED } from '../../constants/shareCardTheme';

// The exercise list shared by TemplateShareCard and RoutineShareCard (one table per day)

export type ShareTemplateExercise = {
  name: string;
  muscleGroup?: string;
  equipment?: string;
  sets?: number | null;
  reps?: string | null;
  rpe?: number | null;
};

export type ShareTableColumns = { programming: boolean; rpe: boolean };

// A column nothing fills is dropped rather than shown as a stack of dashes.
// A routine works this out across every day so the days' columns line up.
export function tableColumns(exercises: ShareTemplateExercise[]): ShareTableColumns {
  return { programming: exercises.some(e => e.sets), rpe: exercises.some(e => e.rpe != null) };
}

export function totalProgrammedSets(exercises: ShareTemplateExercise[]): number {
  return exercises.reduce((sum, e) => sum + (e.sets ?? 0), 0);
}

const EMPTY = '-';

type ShareExerciseTableProps = {
  exercises: ShareTemplateExercise[];
  columns: ShareTableColumns;
  accentColor: string;
  /** Rows past this are counted as "+N more" so a long plan still fits a phone screen */
  maxRows: number;
};

export function ShareExerciseTable({ exercises, columns, accentColor, maxRows }: ShareExerciseTableProps) {
  const shown = exercises.slice(0, maxRows);
  const hidden = exercises.length - shown.length;
  const valueStyle = [styles.value, { color: accentColor }];

  return (
    <View style={styles.table}>
      {columns.programming && (
        <View style={[styles.row, styles.columnHeader]}>
          <Text style={[styles.headerLabel, styles.nameCol]}>Exercise</Text>
          <Text style={[styles.headerLabel, styles.numCol]}>Sets</Text>
          <Text style={[styles.headerLabel, styles.repsCol]}>Reps</Text>
          {columns.rpe && <Text style={[styles.headerLabel, styles.numCol]}>RPE</Text>}
        </View>
      )}
      {shown.map((ex, i) => {
        const details = [ex.muscleGroup, ex.equipment].filter(Boolean).join('  ·  ');
        return (
          <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
            <View style={styles.nameCol}>
              <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
              {details ? <Text style={styles.details} numberOfLines={1}>{details}</Text> : null}
            </View>
            {columns.programming && (
              <>
                <Text style={[valueStyle, styles.numCol]}>{ex.sets || EMPTY}</Text>
                <Text style={[valueStyle, styles.repsCol]} numberOfLines={1}>
                  {ex.sets ? ex.reps || EMPTY : EMPTY}
                </Text>
                {columns.rpe && <Text style={[valueStyle, styles.numCol]}>{ex.rpe ?? EMPTY}</Text>}
              </>
            )}
          </View>
        );
      })}
      {hidden > 0 && <Text style={[styles.more, styles.rowDivider]}>+{hidden} more</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: SHARE_SURFACE,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SHARE_DIVIDER,
  },
  columnHeader: {
    paddingBottom: spacing.xs,
  },
  headerLabel: {
    fontSize: 10,
    color: SHARE_TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  nameCol: {
    flex: 1,
    textAlign: 'left',
  },
  numCol: {
    width: 34,
    textAlign: 'center',
  },
  repsCol: {
    width: 52,
    textAlign: 'center',
  },
  exerciseName: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: SHARE_TEXT,
  },
  details: {
    fontSize: typography.fontSize.xs,
    color: SHARE_TEXT_MUTED,
    marginTop: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
  },
  more: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
