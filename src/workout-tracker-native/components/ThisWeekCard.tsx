import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatDistanceValue, type DistanceGoalProgress } from '../utils/weeklyDistanceGoal';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Props = {
  /** Monday first. */
  trainedDays: boolean[];
  /** 0 = Monday. */
  todayIndex: number;
  done: number;
  goal: number;
  distance: (DistanceGoalProgress & { unit: 'km' | 'mi' }) | null;
  lastWeekText: string;
  onEditGoal: () => void;
  onOpenLastWeek: () => void;
};

export default function ThisWeekCard({
  trainedDays, todayIndex, done, goal, distance, lastWeekText, onEditGoal, onOpenLastWeek,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const trainedNames = DAY_NAMES.filter((_, i) => trainedDays[i]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>This week</Text>
        <View style={styles.headerRight}>
          {done >= goal && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
          <Text style={styles.count}>
            {done} <Text style={styles.countOf}>of {goal} workouts</Text>
          </Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={onEditGoal}
            accessibilityLabel="Edit weekly goal"
            hitSlop={6}
          >
            <Ionicons name="pencil" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={styles.daysRow}
        accessible
        accessibilityLabel={trainedNames.length
          ? `Trained ${trainedNames.join(', ')} this week`
          : 'No workouts yet this week'}
      >
        {DAY_LETTERS.map((letter, i) => {
          const trained = trainedDays[i];
          const isToday = i === todayIndex;
          return (
            <View key={i} style={styles.dayCol}>
              <Text style={[styles.dayLetter, isToday && { color: colors.accent }]}>{letter}</Text>
              <View
                style={[
                  styles.dayDot,
                  trained
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { borderColor: isToday ? colors.accent : colors.border },
                ]}
              >
                {trained && <Ionicons name="checkmark" size={16} color={colors.accentText} />}
              </View>
            </View>
          );
        })}
      </View>

      {distance && (
        <View
          accessible
          accessibilityLabel={`${formatDistanceValue(distance.done)} of ${formatDistanceValue(distance.goal)} ${distance.unit === 'mi' ? 'miles' : 'kilometers'} this week`}
        >
          <View style={styles.distanceLabelRow}>
            <Text style={styles.distanceTitle}>Distance goal</Text>
            <View style={styles.distanceValueRow}>
              {distance.complete && <Ionicons name="checkmark-circle" size={12} color={colors.accent} />}
              <Text style={styles.distanceValue}>
                {formatDistanceValue(distance.done)} / {formatDistanceValue(distance.goal)} {distance.unit}
              </Text>
            </View>
          </View>
          <View style={styles.distanceTrack}>
            <View testID="distance-goal-fill" style={[styles.distanceFill, { width: `${distance.fill * 100}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.divider} />

      <TouchableOpacity style={styles.lastWeekRow} onPress={onOpenLastWeek}>
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
        <View style={styles.lastWeekText}>
          <Text style={styles.lastWeekTitle}>Last week</Text>
          <Text style={styles.lastWeekSub} numberOfLines={1}>{lastWeekText}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: spacing.sm, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md, gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  countOf: { fontWeight: '500', color: colors.textSecondary },
  editBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLetter: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  dayDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  distanceLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  distanceTitle: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  distanceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distanceValue: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textPrimary },
  distanceTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  distanceFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  divider: { height: 1, backgroundColor: colors.border },
  lastWeekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  lastWeekText: { flex: 1 },
  lastWeekTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  lastWeekSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
});
