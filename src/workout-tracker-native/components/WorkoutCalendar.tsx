import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { apiFetch } from '../utils/api';
import { appCache } from '../utils/appCache';
import { mondayFirstMonthGrid, toLocalDateStr } from '../utils/date';

// Monday first, like every other week in the app (Weekly Summary, Coach)
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

type CalendarWorkout = {
  id: number;
  name: string;
  duration?: number;
  workout_type?: string;
  cardio_duration?: number | null;
};

// cardio_duration is the time logged; duration is only the logging screen's
// timer, ~0 for a run entered afterwards
const workoutMinutes = (w: CalendarWorkout) =>
  Math.round((w.workout_type === 'cardio' ? w.cardio_duration ?? w.duration : w.duration) ?? 0);
export type CalView = 'month' | 'year' | 'multiyear';

type Props = {
  view: CalView;
  /** Bumped by the parent to refetch the logged days (on focus, pull to refresh) */
  refreshKey: number;
  onSelectWorkout: (workout: CalendarWorkout) => void;
  /** Tapping a year (All Years) or a month (Year) opens it one level down */
  onChangeView: (view: CalView) => void;
};

// Memoized: it sits in the Profile's FlatList, which re-renders on every stats,
// PR or pin change, and All Years draws ~370 cells per year of history
export default memo(WorkoutCalendar);

function WorkoutCalendar({ view: calView, refreshKey, onSelectWorkout, onChangeView }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(
    () => new Set(appCache.get<{ dates: string[] }>('workout_dates')?.dates ?? []),
  );
  const [datesLoading, setDatesLoading] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [selectedDateWorkouts, setSelectedDateWorkouts] = useState<CalendarWorkout[]>([]);
  const [selectedDateLoading, setSelectedDateLoading] = useState(false);
  const [selectedDateFailed, setSelectedDateFailed] = useState(false);
  // The day whose workouts were asked for last, so a slow earlier answer
  // can't replace the list for a day tapped after it
  const latestDay = useRef<string | null>(null);

  // Only a load with nothing to show yet gets a spinner; later ones refresh in place
  useEffect(() => {
    let cancelled = false;
    if (workoutDates.size === 0) setDatesLoading(true);
    apiFetch('/api/workouts/dates')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data?.dates) setWorkoutDates(new Set(data.dates)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDatesLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const prevMonth = () => { setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); setSelectedCalDate(null); };
  const atCurrentMonth = (() => {
    const now = new Date();
    return calendarMonth.getFullYear() * 12 + calendarMonth.getMonth() >= now.getFullYear() * 12 + now.getMonth();
  })();
  const nextMonth = () => { setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); setSelectedCalDate(null); };

  const handleDayPress = async (iso: string) => {
    latestDay.current = iso;
    setSelectedCalDate(iso);
    setSelectedDateWorkouts([]);
    setSelectedDateFailed(false);
    setSelectedDateLoading(true);
    let workouts: CalendarWorkout[] | null = null;
    try {
      const res = await apiFetch(`/api/workouts?date=${iso}`);
      if (res.ok) workouts = await res.json();
    } catch {}
    if (latestDay.current !== iso) return;
    if (workouts) setSelectedDateWorkouts(workouts);
    else setSelectedDateFailed(true);
    setSelectedDateLoading(false);
  };

  const calendarGrid = useMemo(
    () => mondayFirstMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  );

  // Not a ScrollView: it sits inside the Profile's FlatList, which scrolls it
  return (
    datesLoading ? (
      <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
    ) : (
      <View style={styles.calBody}>
        {/* ── Month view ── */}
        {calView === 'month' && (() => {
          const todayIso = toLocalDateStr(new Date());
          return (
            <>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={prevMonth} hitSlop={8} style={styles.calNavBtn} accessibilityLabel="Previous month">
                  <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.calMonthLabel, { color: colors.textPrimary }]}>
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={nextMonth}
                  hitSlop={8}
                  style={styles.calNavBtn}
                  disabled={atCurrentMonth}
                  accessibilityLabel="Next month"
                >
                  <Ionicons name="chevron-forward" size={22} color={atCurrentMonth ? colors.border : colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.calDowRow}>
                {WEEKDAYS.map(d => (
                  <Text key={d} style={[styles.calDowLabel, { color: colors.textSecondary }]}>{d}</Text>
                ))}
              </View>

              {calendarGrid.map((week, wi) => (
                <View key={wi} style={styles.calWeekRow}>
                  {week.map((iso, di) => {
                    if (!iso) return <View key={di} style={styles.calCell} />;
                    const day = Number(iso.slice(8));
                    const hasWorkout = workoutDates.has(iso);
                    const isSelected = iso === selectedCalDate;
                    const isToday = iso === todayIso;
                    const DayCell = hasWorkout ? TouchableOpacity : View;
                    return (
                      <DayCell
                        key={di}
                        testID={`calendar-day-${iso}`}
                        style={styles.calCell}
                        onPress={hasWorkout ? () => handleDayPress(iso) : undefined}
                        activeOpacity={0.7}
                        accessibilityState={hasWorkout ? { selected: isSelected } : undefined}
                      >
                        <View style={[
                          styles.calDayCircle,
                          hasWorkout && { backgroundColor: colors.accent },
                          isToday && !hasWorkout && { borderWidth: 1.5, borderColor: colors.accent },
                          // A ring, since workout days are already filled
                          isSelected && styles.calDaySelected,
                        ]}>
                          <Text style={[
                            styles.calDayText, { color: hasWorkout ? colors.accentText : colors.textPrimary },
                            isToday && !hasWorkout && { color: colors.accent, fontWeight: '700' },
                          ]}>
                            {day}
                          </Text>
                        </View>
                      </DayCell>
                    );
                  })}
                </View>
              ))}

              <View style={styles.calLegend}>
                <View style={[styles.calLegendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>Workout logged</Text>
              </View>

              {selectedCalDate && (
                <View style={[styles.calDayHeader, { borderTopColor: colors.border }]}>
                  <Text style={[styles.calDayHeaderText, { color: colors.textPrimary }]}>
                    {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                  {selectedDateLoading && <ActivityIndicator size="small" color={colors.accent} />}
                </View>
              )}
              {selectedCalDate && !selectedDateLoading && selectedDateFailed && (
                <TouchableOpacity onPress={() => handleDayPress(selectedCalDate)}>
                  <Text style={[styles.calEmptyText, { color: colors.textSecondary }]}>
                    Couldn't load this day. Tap to try again.
                  </Text>
                </TouchableOpacity>
              )}
              {selectedCalDate && !selectedDateLoading && !selectedDateFailed && selectedDateWorkouts.length === 0 && (
                <Text style={[styles.calEmptyText, { color: colors.textSecondary }]}>No workouts found.</Text>
              )}
              {selectedDateWorkouts.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.calWorkoutRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => onSelectWorkout(item)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.calWorkoutName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name || 'Workout'}</Text>
                    {workoutMinutes(item) > 0 ? (
                      <Text style={[styles.calWorkoutMeta, { color: colors.textSecondary }]}>{workoutMinutes(item)} min</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </>
          );
        })()}

        {/* ── Year view: 12 mini-month grids ── */}
        {calView === 'year' && (() => {
          const currentY = new Date().getFullYear();
          const screenW = Dimensions.get('window').width;
          const MINI_GAP = 10;
          const miniW = Math.floor((screenW - 32 - MINI_GAP * 2) / 3);
          const boxSize = Math.max(4, Math.floor((miniW - 12) / 7));
          const MNAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const currentM = new Date().getMonth();
          return (
            <>
              <View style={styles.calNav}>
                <TouchableOpacity onPress={() => setCalYear(y => y - 1)} hitSlop={8} style={styles.calNavBtn} accessibilityLabel="Previous year">
                  <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.calMonthLabel, { color: colors.textPrimary }]}>{calYear}</Text>
                <TouchableOpacity onPress={() => setCalYear(y => Math.min(y + 1, currentY))} hitSlop={8} style={styles.calNavBtn} disabled={calYear >= currentY} accessibilityLabel="Next year">
                  <Ionicons name="chevron-forward" size={22} color={calYear >= currentY ? colors.border : colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: MINI_GAP }}>
                {MNAMES.map((mname, mi) => {
                  const rows = mondayFirstMonthGrid(calYear, mi);
                  // Month view can't go past this month, so neither does a tap here
                  const future = calYear === currentY && mi > currentM;
                  return (
                    <TouchableOpacity
                      key={mi}
                      testID={`calendar-month-${calYear}-${mi + 1}`}
                      style={{ width: miniW }}
                      disabled={future}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={new Date(calYear, mi, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      onPress={() => {
                        setCalendarMonth(new Date(calYear, mi, 1));
                        setSelectedCalDate(null);
                        onChangeView('month');
                      }}
                    >
                      <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {mname}
                      </Text>
                      {rows.map((row, ri) => (
                        <View key={ri} style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                          {row.map((iso, di) => {
                            if (!iso) return <View key={di} style={{ width: boxSize, height: boxSize }} />;
                            return (
                              <View key={di} style={{ width: boxSize, height: boxSize, borderRadius: 2, backgroundColor: workoutDates.has(iso) ? colors.accent : colors.border + '80' }} />
                            );
                          })}
                        </View>
                      ))}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.calLegend, { marginTop: spacing.lg }]}>
                <View style={[styles.calLegendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>Workout logged</Text>
              </View>
            </>
          );
        })()}

        {/* ── Multi-year view: GitHub-style heatmap per year ── */}
        {calView === 'multiyear' && (() => {
          if (workoutDates.size === 0) return (
            <Text style={[styles.calEmptyText, { color: colors.textSecondary, marginTop: spacing.xl }]}>No workout history yet.</Text>
          );
          const allDates = Array.from(workoutDates).sort();
          const firstYear = parseInt(allDates[0].slice(0, 4), 10);
          const currentYear = new Date().getFullYear();
          const NUM_WEEKS = 53;
          const BOX = 11;
          const GAP = 3;
          const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i).reverse();
          return (
            <>
              {years.map(year => {
                // Rows run Monday to Sunday
                const yearStartDow = (new Date(year, 0, 1).getDay() + 6) % 7;
                const daysInYear = isLeapYear(year) ? 366 : 365;
                return (
                  <View key={year} style={styles.calYearBlock}>
                    {/* Only the header opens the year: a touchable around the heatmap swallowed its horizontal swipes */}
                    <TouchableOpacity
                      testID={`calendar-year-${year}`}
                      style={styles.calYearRow}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`${year}`}
                      accessibilityHint="Shows this year by month"
                      onPress={() => { setCalYear(year); onChangeView('year'); }}
                    >
                      <Text style={[styles.calYearLabel, { color: colors.textPrimary }]}>{year}</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: GAP }}>
                        {Array.from({ length: NUM_WEEKS }, (_, wi) => (
                          <View key={wi} style={{ gap: GAP }}>
                            {Array.from({ length: 7 }, (_, dow) => {
                              const dayIndex = wi * 7 + dow - yearStartDow;
                              if (dayIndex < 0 || dayIndex >= daysInYear) {
                                return <View key={dow} style={{ width: BOX, height: BOX }} />;
                              }
                              const d = new Date(year, 0, 1 + dayIndex);
                              const iso = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                              return (
                                <View key={dow} style={{ width: BOX, height: BOX, borderRadius: 2, backgroundColor: workoutDates.has(iso) ? colors.accent : colors.border + '60' }} />
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}

              <View style={styles.calLegend}>
                <View style={[styles.calLegendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.calLegendText, { color: colors.textSecondary }]}>Workout logged</Text>
              </View>
            </>
          );
        })()}
      </View>
    )
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  calBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  calNavBtn: { padding: spacing.xs },
  calYearBlock: { marginBottom: spacing.lg },
  calYearRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, marginBottom: spacing.sm },
  calYearLabel: { fontSize: 13, fontWeight: '700' },
  calMonthLabel: { fontSize: typography.fontSize.md, fontWeight: '700' },
  calDowRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  calDowLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  calCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  calDaySelected: {
    borderWidth: 2.5,
    borderColor: colors.textPrimary,
  },
  calDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  calLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  calLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  calLegendText: { fontSize: 13 },

  calDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    marginBottom: spacing.sm,
  },
  calDayHeaderText: { fontSize: 15, fontWeight: '700' },
  calWorkoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  calWorkoutName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  calWorkoutMeta: { fontSize: 13 },
  calEmptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', marginTop: spacing.sm },
});
