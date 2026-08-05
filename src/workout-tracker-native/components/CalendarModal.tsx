import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { apiFetch } from '../utils/api';
import { toLocalDateStr } from '../utils/date';

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

type CalendarWorkout = { id: number; name: string; duration?: number; workout_type?: string };
type CalView = 'month' | 'year' | 'multiyear';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectWorkout: (workout: CalendarWorkout) => void;
};

export default function CalendarModal({ visible, onClose, onSelectWorkout }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [calView, setCalView] = useState<CalView>('month');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());
  const [datesLoading, setDatesLoading] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [selectedDateWorkouts, setSelectedDateWorkouts] = useState<CalendarWorkout[]>([]);
  const [selectedDateLoading, setSelectedDateLoading] = useState(false);

  // The Modal's children stay mounted across visible toggles (only the native
  // overlay hides), so this fires once per app session — same lazy-load-once
  // behavior as the old inline openCalendar().
  useEffect(() => {
    if (!visible || workoutDates.size > 0) return;
    setDatesLoading(true);
    apiFetch('/api/workouts/dates')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setWorkoutDates(new Set(data.dates)); })
      .catch(() => {})
      .finally(() => setDatesLoading(false));
  }, [visible]);

  const prevMonth = () => { setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); setSelectedCalDate(null); };
  const nextMonth = () => { setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); setSelectedCalDate(null); };

  const handleDayPress = async (iso: string) => {
    setSelectedCalDate(iso);
    setSelectedDateWorkouts([]);
    setSelectedDateLoading(true);
    try {
      const res = await apiFetch(`/api/workouts?date=${iso}`);
      if (res.ok) setSelectedDateWorkouts(await res.json());
    } catch {}
    setSelectedDateLoading(false);
  };

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [calendarMonth]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.calModal, { backgroundColor: colors.background }]}>
        {/* Modal header */}
        <View style={[styles.calModalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.calModalTitle, { color: colors.textPrimary }]}>Workout Calendar</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* View switcher */}
        <View style={[styles.calViewSwitcher, { borderBottomColor: colors.border }]}>
          {([
            { key: 'month', label: 'Month' },
            { key: 'year', label: 'Year' },
            { key: 'multiyear', label: 'All Years' },
          ] as const).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.calViewBtn, calView === key && { borderBottomColor: colors.accent }]}
              onPress={() => setCalView(key)}
            >
              <Text style={[styles.calViewBtnText, { color: calView === key ? colors.accent : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {datesLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.calBody}>
            {/* ── Month view ── */}
            {calView === 'month' && (() => {
              const today = new Date();
              return (
                <>
                  <View style={styles.calNav}>
                    <TouchableOpacity onPress={prevMonth} hitSlop={8} style={styles.calNavBtn}>
                      <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.calMonthLabel, { color: colors.textPrimary }]}>
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity onPress={nextMonth} hitSlop={8} style={styles.calNavBtn}>
                      <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.calDowRow}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                      <Text key={d} style={[styles.calDowLabel, { color: colors.textSecondary }]}>{d}</Text>
                    ))}
                  </View>

                  {calendarGrid.map((week, wi) => (
                    <View key={wi} style={styles.calWeekRow}>
                      {week.map((day, di) => {
                        if (!day) return <View key={di} style={styles.calCell} />;
                        const iso = toLocalDateStr(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                        const hasWorkout = workoutDates.has(iso);
                        const isSelected = iso === selectedCalDate;
                        const isToday = day === today.getDate() && calendarMonth.getMonth() === today.getMonth() && calendarMonth.getFullYear() === today.getFullYear();
                        const DayCell = hasWorkout ? TouchableOpacity : View;
                        return (
                          <DayCell key={di} style={styles.calCell} onPress={hasWorkout ? () => handleDayPress(iso) : undefined} activeOpacity={0.7}>
                            <View style={[
                              styles.calDayCircle,
                              hasWorkout && { backgroundColor: colors.accent },
                              isSelected && { backgroundColor: colors.accent },
                              isToday && !hasWorkout && { borderWidth: 1.5, borderColor: colors.accent },
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
                  {selectedCalDate && !selectedDateLoading && selectedDateWorkouts.length === 0 && (
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
                        {item.duration ? <Text style={[styles.calWorkoutMeta, { color: colors.textSecondary }]}>{item.duration} min</Text> : null}
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
              return (
                <>
                  <View style={styles.calNav}>
                    <TouchableOpacity onPress={() => setCalYear(y => y - 1)} hitSlop={8} style={styles.calNavBtn}>
                      <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.calMonthLabel, { color: colors.textPrimary }]}>{calYear}</Text>
                    <TouchableOpacity onPress={() => setCalYear(y => Math.min(y + 1, currentY))} hitSlop={8} style={styles.calNavBtn} disabled={calYear >= currentY}>
                      <Ionicons name="chevron-forward" size={22} color={calYear >= currentY ? colors.border : colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: MINI_GAP }}>
                    {MNAMES.map((mname, mi) => {
                      const firstDow = new Date(calYear, mi, 1).getDay();
                      const daysInMonth = new Date(calYear, mi + 1, 0).getDate();
                      const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
                      while (cells.length % 7 !== 0) cells.push(null);
                      const rows: (number | null)[][] = [];
                      for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
                      return (
                        <View key={mi} style={{ width: miniW }}>
                          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {mname}
                          </Text>
                          {rows.map((row, ri) => (
                            <View key={ri} style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                              {row.map((day, di) => {
                                if (!day) return <View key={di} style={{ width: boxSize, height: boxSize }} />;
                                const iso = `${calYear}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                return (
                                  <View key={di} style={{ width: boxSize, height: boxSize, borderRadius: 2, backgroundColor: workoutDates.has(iso) ? colors.accent : colors.border + '80' }} />
                                );
                              })}
                            </View>
                          ))}
                        </View>
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
                    const yearStartDow = new Date(year, 0, 1).getDay();
                    const daysInYear = isLeapYear(year) ? 366 : 365;
                    return (
                      <View key={year} style={{ marginBottom: spacing.lg }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>{year}</Text>
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
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  calModal: { flex: 1 },
  calViewSwitcher: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  calViewBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  calViewBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  calModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  calModalTitle: { fontSize: 18, fontWeight: '700' },
  calBody: { padding: spacing.md },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  calNavBtn: { padding: spacing.xs },
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
    marginBottom: 4,
  },
  calCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
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
