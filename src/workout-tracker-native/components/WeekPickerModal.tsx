import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { apiFetch } from '../utils/api';
import { appCache } from '../utils/appCache';
import { mondayFirstMonthGrid, parseApiDate, toLocalDateStr } from '../utils/date';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Props = {
  visible: boolean;
  /** Monday of the week being shown, "YYYY-MM-DD". Its row is banded. */
  weekStart: string;
  /** Any day the user taps; the caller loads the week that contains it. */
  onSelectDate: (date: string) => void;
  onClose: () => void;
};

/**
 * Month calendar for picking a Weekly Summary week, with the days a workout
 * was logged filled in. It replaces the system date picker, which on both
 * platforms can't mark individual days.
 */
export default function WeekPickerModal({ visible, weekStart, onSelectDate, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [month, setMonth] = useState(() => startOfMonth(parseApiDate(weekStart)));
  // Seeded from the preload so the highlights paint instantly, then refreshed
  // on every open: the cache is from app start, and a workout logged since
  // would otherwise be missing.
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(
    () => new Set(appCache.get<{ dates: string[] }>('workout_dates')?.dates ?? []),
  );

  useEffect(() => {
    if (!visible) return;
    setMonth(startOfMonth(parseApiDate(weekStart)));
    let cancelled = false;
    apiFetch('/api/workouts/dates')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.dates) setWorkoutDates(new Set(data.dates)); })
      .catch(() => { /* keep whatever was cached */ });
    return () => { cancelled = true; };
  }, [visible, weekStart]);

  const today = toLocalDateStr(new Date());
  const weekEnd = toLocalDateStr(addDays(parseApiDate(weekStart), 6));
  const rows = useMemo(() => mondayFirstMonthGrid(month.getFullYear(), month.getMonth()), [month]);
  const thisMonth = startOfMonth(new Date());
  const atCurrentMonth = month.getTime() >= thisMonth.getTime();

  const shiftMonth = (delta: number) =>
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* A Pressable that swallows taps, so touching the card doesn't close it. */}
        <Pressable style={[styles.card, { marginTop: insets.top + 96 }]} onPress={() => {}}>
          <Text style={styles.title}>Pick a Week</Text>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              onPress={() => shiftMonth(1)}
              disabled={atCurrentMonth}
              hitSlop={8}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color={atCurrentMonth ? colors.border : colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map(d => <Text key={d} style={styles.weekday}>{d}</Text>)}
          </View>

          {rows.map((row, ri) => {
            const isShownWeek = row.some(iso => iso != null && iso >= weekStart && iso <= weekEnd);
            return (
              <View key={ri} style={[styles.row, styles.weekRow, isShownWeek && styles.shownWeek]}>
                {row.map((iso, di) => {
                  if (!iso) return <View key={di} style={styles.cell} />;
                  const isFuture = iso > today;
                  const hasWorkout = workoutDates.has(iso);
                  const isToday = iso === today;
                  const day = Number(iso.slice(8));
                  return (
                    <TouchableOpacity
                      key={di}
                      testID={`week-picker-day-${iso}`}
                      style={styles.cell}
                      disabled={isFuture}
                      onPress={() => { onSelectDate(iso); onClose(); }}
                      accessibilityLabel={`${parseApiDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${hasWorkout ? ', workout logged' : ''}`}
                    >
                      <View style={[
                        styles.dayCircle,
                        hasWorkout && styles.dayCircleWorkout,
                        isToday && !hasWorkout && styles.dayCircleToday,
                      ]}>
                        <Text style={[
                          styles.dayText,
                          hasWorkout && styles.dayTextWorkout,
                          isToday && !hasWorkout && styles.dayTextToday,
                          isFuture && styles.dayTextFuture,
                        ]}>
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          <View style={styles.legend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Workout logged</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

const createStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' },
  card: {
    width: '88%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs,
  },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xs, marginBottom: spacing.xs,
  },
  monthLabel: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  row: { flexDirection: 'row' },
  weekRow: { borderRadius: radius.sm },
  shownWeek: { backgroundColor: colors.accent + '18' },
  weekday: {
    flex: 1, textAlign: 'center', fontSize: typography.fontSize.xs, fontWeight: '600',
    color: colors.textSecondary, paddingVertical: spacing.xs,
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleWorkout: { backgroundColor: colors.accent },
  dayCircleToday: { borderWidth: 1.5, borderColor: colors.accent },
  dayText: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  dayTextWorkout: { color: colors.accentText, fontWeight: '700' },
  dayTextToday: { color: colors.accent, fontWeight: '700' },
  dayTextFuture: { color: colors.border },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  legendText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
});
