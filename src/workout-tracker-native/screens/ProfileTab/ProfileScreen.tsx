import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { useFocusEffect } from '@react-navigation/native';
import { typography } from 'theme/typography';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import type { PR } from './PersonalRecordsScreen';
import { toDisplayVolume, roundTenth, type WeightUnit } from 'utils/units';
import { apiFetch, resolveMediaUrl } from '../../utils/api';
import { appCache } from '../../utils/appCache';
import ProfileAvatarFrame, { GREEK_RANK_COLORS } from '../../components/ProfileAvatarFrame';
import { LaurelBranch } from '../../components/LaurelWreath';
const PR_PINS_KEY = '@pr_pins';
const DEFAULT_PIN_COUNT = 3;
const PAGE_SIZE = 20;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

type Workout = {
  id: number;
  name: string;
  date: string;
  notes?: string;
  duration?: number;
  volume?: number;
  workout_type?: string;
  distance?: number;
  distance_unit?: string;
  pr_count?: number;
};

type ProfileStats = {
  total_workouts: number;
  longest_streak: number;
  current_streak: number;
  total_volume: number;
};

// Unique exercises that have at least one PR record
type ExerciseOption = { exercise_template_id: number; exercise_name: string; equipment?: string | null };

export default function ProfileScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [selectedFrame, setSelectedFrame] = useState('Neophyte');
  const [greekRank, setGreekRank]         = useState<string | null>(null);

  const [calendarVisible, setCalendarVisible]       = useState(false);
  const [calendarMonth, setCalendarMonth]           = useState(new Date());
  const [calView, setCalView]                       = useState<'month' | 'year' | 'multiyear'>('month');
  const [calYear, setCalYear]                       = useState(new Date().getFullYear());
  const [workoutDates, setWorkoutDates]             = useState<Set<string>>(new Set());
  const [datesLoading, setDatesLoading]             = useState(false);
  const [selectedCalDate, setSelectedCalDate]       = useState<string | null>(null);
  const [selectedDateWorkouts, setSelectedDateWorkouts] = useState<Workout[]>([]);
  const [selectedDateLoading, setSelectedDateLoading]   = useState(false);

  const [workouts, setWorkouts]     = useState<Workout[]>([]);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalWorkouts, setTotalWorkouts] = useState<number | null>(null);
  const loadingMoreRef              = useRef(false);
  const [stats, setStats]           = useState<ProfileStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prs, setPrs]               = useState<PR[]>([]);
  // Indices into pinned exercise_template_ids; null = empty slot
  const [pins, setPins]           = useState<(number | null)[]>([null, null, null]);
  // Which slot is being swapped (0/1/2), or -1 = modal closed
  const [swapSlot, setSwapSlot]   = useState<number>(-1);

  const displayName = user?.name?.trim() || user?.username;
  const weightUnit: WeightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';

  const avatarSource = useMemo(() =>
    user?.profile_pic_url
      ? { uri: resolveMediaUrl(user.profile_pic_url) }
      : require('../../assets/profile-placeholder.png'),
  [user?.profile_pic_url]);

  // Populate from preload cache instantly on mount
  useEffect(() => {
    const pw = appCache.get<{ workouts: Workout[]; total: number; has_more: boolean }>('profile_workouts');
    const ps = appCache.get<ProfileStats>('profile_stats');
    const cachedPrs = appCache.get<PR[]>('prs');
    const score = appCache.get<any>('strength_score');
    if (pw) {
      setWorkouts(pw.workouts ?? []);
      setTotalWorkouts(pw.total);
      setHasMore(pw.has_more);
    }
    if (ps) setStats(ps);
    if (cachedPrs) {
      setPrs(cachedPrs);
      AsyncStorage.getItem(PR_PINS_KEY).then(raw => {
        if (!raw) {
          const top = cachedPrs
            .filter(p => p.pr_type === 'max_weight')
            .sort((a, b) => b.value - a.value)
            .slice(0, DEFAULT_PIN_COUNT)
            .map(p => p.exercise_template_id);
          const filled: (number | null)[] = [null, null, null];
          top.forEach((id, i) => { filled[i] = id; });
          savePins(filled);
        }
      });
    }
    if (score?.greek_rank) {
      setGreekRank(score.greek_rank);
      AsyncStorage.setItem('greek_rank_cached', score.greek_rank);
    }
  }, []);

  // Load saved pins + profile frame + cached Greek rank from AsyncStorage once on mount
  useEffect(() => {
    AsyncStorage.multiGet([PR_PINS_KEY, 'profile_frame_rank', 'greek_rank_cached']).then(pairs => {
      const [pinsRaw, frameRaw, rankRaw] = pairs.map(p => p[1]);
      if (pinsRaw) { try { setPins(JSON.parse(pinsRaw)); } catch {} }
      if (frameRaw) setSelectedFrame(frameRaw);
      if (rankRaw) setGreekRank(rankRaw);
    });
  }, []);

  const savePins = (next: (number | null)[]) => {
    setPins(next);
    AsyncStorage.setItem(PR_PINS_KEY, JSON.stringify(next));
  };

  const fetchAll = async () => {
    try {
      const goalRaw = await AsyncStorage.getItem('workout_weekly_goal');
      const weeklyGoal = goalRaw ? (parseInt(goalRaw, 10) || 3) : 3;

      const [workoutsRes, statsRes, prsRes, scoreRes] = await Promise.all([
        apiFetch(`/api/workouts?page=1&per_page=${PAGE_SIZE}`),
        apiFetch(`/api/stats/profile?weekly_goal=${weeklyGoal}`),
        apiFetch('/api/personal-records'),
        apiFetch('/api/stats/strength-score'),
      ]);
      if (workoutsRes.ok) {
        const data = await workoutsRes.json();
        setWorkouts(data.workouts);
        setTotalWorkouts(data.total);
        setHasMore(data.has_more);
        setPage(1);
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (scoreRes.ok) {
        const d = await scoreRes.json();
        if (d.greek_rank) {
          setGreekRank(d.greek_rank);
          AsyncStorage.setItem('greek_rank_cached', d.greek_rank);
        }
      }
      if (prsRes.ok) {
        const data: PR[] = await prsRes.json();
        setPrs(data);
        // Auto-populate empty pins with top max_weight exercises on first load
        AsyncStorage.getItem(PR_PINS_KEY).then(raw => {
          if (!raw) {
            const top = data
              .filter(p => p.pr_type === 'max_weight')
              .sort((a, b) => b.value - a.value)
              .slice(0, DEFAULT_PIN_COUNT)
              .map(p => p.exercise_template_id);
            const filled: (number | null)[] = [null, null, null];
            top.forEach((id, i) => { filled[i] = id; });
            savePins(filled);
          }
        });
      }
    } catch {
    } finally {
      setRefreshing(false);
    }
  };

  const fetchMoreWorkouts = async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await apiFetch(`/api/workouts?page=${nextPage}&per_page=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setWorkouts(prev => [...prev, ...data.workouts]);
        setTotalWorkouts(data.total);
        setHasMore(data.has_more);
        setPage(nextPage);
      }
    } catch {
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchAll();
    AsyncStorage.getItem('profile_frame_rank').then(val => {
      if (val) setSelectedFrame(val);
    });
  }, []));

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const openCalendar = async () => {
    setCalendarVisible(true);
    if (workoutDates.size === 0) {
      setDatesLoading(true);
      try {
        const res = await apiFetch('/api/workouts/dates');
        if (res.ok) {
          const data = await res.json();
          setWorkoutDates(new Set(data.dates));
        }
      } catch {}
      setDatesLoading(false);
    }
  };

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

  const calendarGrid = (() => {
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
  })();

  const fmtVolume = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
  };

  // Best PR to display on the pinned card: max_weight first, then best rep PR (heaviest weight)
  const getPinnedPR = (exerciseTemplateId: number): PR | undefined => {
    const byWeight = prs.find(
      p => p.exercise_template_id === exerciseTemplateId && p.pr_type === 'max_weight'
    );
    if (byWeight) return byWeight;
    const repsPRs = prs.filter(
      p => p.exercise_template_id === exerciseTemplateId && p.pr_type === 'max_reps' && p.weight_context != null
    );
    return repsPRs.sort((a, b) => (b.weight_context ?? 0) - (a.weight_context ?? 0))[0];
  };

  // Unique exercises available to pin
  const exerciseOptions: ExerciseOption[] = useMemo(() => {
    const seen = new Set<number>();
    const out: ExerciseOption[] = [];
    for (const p of prs) {
      if (!seen.has(p.exercise_template_id)) {
        seen.add(p.exercise_template_id);
        out.push({ exercise_template_id: p.exercise_template_id, exercise_name: p.exercise_name, equipment: p.equipment });
      }
    }
    return out.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));
  }, [prs]);

  const handleSelectPin = (exerciseTemplateId: number) => {
    const next = [...pins];
    next[swapSlot] = exerciseTemplateId;
    savePins(next);
    setSwapSlot(-1);
  };

  const renderPRBar = () => {
    if (prs.length === 0) return null;
    return (
      <View style={styles.prSection}>
        <View style={styles.prSectionHeader}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PersonalRecords')}>
            <Text style={[styles.seeAll, { color: colors.accent }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.prCards}>
          {pins.map((pinnedId, slot) => {
            const pr = pinnedId != null ? getPinnedPR(pinnedId) : undefined;
            return (
              <View key={slot} style={[styles.prCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="trophy-outline" size={18} color={colors.accent} style={styles.trophyIcon} />
                {pr ? (
                  <>
                    <Text style={[styles.prCardName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {pr.exercise_name}
                    </Text>
                    <Text style={[styles.prCardValue, { color: colors.accent }]}>
                      {pr.pr_type === 'max_weight'
                        ? `${pr.value} ${unit}`
                        : `${pr.value} reps`}
                    </Text>
                    <Text style={styles.prCardType}>
                      {pr.pr_type === 'max_weight'
                        ? 'Max Weight'
                        : pr.weight_context != null
                          ? `@ ${pr.weight_context} ${unit}`
                          : 'Max Reps'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.prCardEmpty}>Tap ↺ to{'\n'}pick exercise</Text>
                )}
                <TouchableOpacity
                  style={[styles.swapBtn, { backgroundColor: colors.background }]}
                  onPress={() => setSwapSlot(slot)}
                  hitSlop={6}
                >
                  <Ionicons name="swap-horizontal" size={13} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Memoized as an element (not a function ref) so FlatList never remounts it
  // and the Image never reloads between tab visits.
  const listHeader = useMemo(() => (
    <View>
      <View style={styles.titleRow}>
        <View style={{ width: 24 }} />
        <View style={{ alignItems: 'center' }}>
          {greekRank ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('GreekRank')}
              style={[styles.rankBadgePill, { backgroundColor: (GREEK_RANK_COLORS[greekRank] ?? '#888') + '22', borderColor: GREEK_RANK_COLORS[greekRank] ?? '#888' }]}
            >
              <Text style={[styles.rankBadgeText, { color: GREEK_RANK_COLORS[greekRank] ?? '#888' }]}>
                {greekRank}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.title, typography.title]}>Profile</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, padding: spacing.md }]}
        onPress={() => navigation.navigate('EditProfile')}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={avatarSource}
            style={styles.image}
          />
          <ProfileAvatarFrame rankName={selectedFrame} size={72} avatarSize={64} />
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {displayName || '—'}
          </Text>
          {!!user?.bio && (
            <Text style={styles.workoutCount} numberOfLines={2}>{user.bio}</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Stats boxes */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats?.total_workouts ?? '—'}</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Text style={styles.statValue}>{stats ? `${stats.longest_streak}w` : '—'}</Text>
          <Text style={styles.statLabel}>Longest Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats ? fmtVolume(stats.total_volume) : '—'}</Text>
          <Text style={styles.statLabel}>Total Volume</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.weightRow}
        onPress={() => navigation.navigate('Measurements')}
      >
        <View>
          <Text style={styles.weightRowLabel}>Measurements</Text>
          <Text style={styles.weightRowValue}>
            {user?.bodyweight ? `${roundTenth(user.bodyweight)} ${unit}` : 'Tap to track'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {renderPRBar()}

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>Workout History</Text>
        <TouchableOpacity onPress={openCalendar} hitSlop={8} style={styles.calendarIconBtn}>
          <Ionicons name="calendar-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  ), [styles, avatarSource, selectedFrame, displayName, user, stats, greekRank, prs, pins, weightUnit, unit, colors]);

  return (
    <>
      <FlatList
        style={styles.container}
        data={workouts}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No workouts logged yet</Text>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.md }} /> : null}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={fetchMoreWorkouts}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.workoutCard}
            onPress={() =>
              item.workout_type === 'cardio'
                ? navigation.navigate('CardioDetails', { workoutId: item.id })
                : navigation.navigate('WorkoutDetails', { workoutId: item.id })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.workoutName} numberOfLines={1}>{item.name}</Text>
              {!!item.pr_count && (
                <View style={styles.prRow}>
                  <LaurelBranch height={16} color="#C9A84C" />
                  <Text style={styles.prText}>{item.pr_count} PR{item.pr_count > 1 ? 's' : ''}</Text>
                  <LaurelBranch side="right" height={16} color="#C9A84C" />
                </View>
              )}
            </View>
            <Text style={styles.workoutDate}>
              {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            {item.workout_type === 'cardio' ? (
              <View style={styles.pillRow}>
                {item.duration != null && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{item.duration} min</Text>
                  </View>
                )}
                {item.distance != null && item.distance > 0 && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{item.distance.toFixed(2)} {item.distance_unit || 'km'}</Text>
                  </View>
                )}
              </View>
            ) : (
              (item.volume != null && item.volume > 0) && (
                <View style={styles.pillRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{toDisplayVolume(item.volume, weightUnit)}</Text>
                  </View>
                </View>
              )
            )}
          </TouchableOpacity>
        )}
      />

      {/* Calendar modal */}
      <Modal
        visible={calendarVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={[styles.calModal, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.calModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.calModalTitle, { color: colors.textPrimary }]}>Workout Calendar</Text>
            <TouchableOpacity onPress={() => setCalendarVisible(false)} hitSlop={8}>
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
                          const iso = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
                                  styles.calDayText, { color: hasWorkout ? '#fff' : colors.textPrimary },
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
                        onPress={() => {
                          setCalendarVisible(false);
                          item.workout_type === 'cardio'
                            ? navigation.navigate('CardioDetails', { workoutId: item.id })
                            : navigation.navigate('WorkoutDetails', { workoutId: item.id });
                        }}
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

      {/* Exercise picker modal for swapping a pinned PR */}
      <Modal
        visible={swapSlot >= 0}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSwapSlot(-1)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Choose Exercise</Text>
            <TouchableOpacity onPress={() => setSwapSlot(-1)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={exerciseOptions}
            keyExtractor={item => item.exercise_template_id.toString()}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
            renderItem={({ item }) => {
              const selected = swapSlot >= 0 && pins[swapSlot] === item.exercise_template_id;
              return (
                <Pressable
                  style={[
                    styles.optionRow,
                    {
                      backgroundColor: selected ? colors.accent + '22' : colors.surface,
                      borderColor: selected ? colors.accent : 'transparent',
                    },
                  ]}
                  onPress={() => handleSelectPin(item.exercise_template_id)}
                >
                  <Text style={[styles.optionName, { color: colors.textPrimary }]}>
                    {item.equipment && item.equipment !== 'Bodyweight' ? `${item.exercise_name} · ${item.equipment}` : item.exercise_name}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: 0,
  },
  title: { fontWeight: 'bold', color: colors.textPrimary },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    borderRadius: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.border,
  },
  rankBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  rankBadgePill: {
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1.5,
  },
  rankBadgeText: { fontSize: typography.fontSize.sm, fontWeight: '700', letterSpacing: 0.5 },
  userInfo: { flex: 1 },
  value: { fontSize: typography.fontSize.md, fontWeight: '600', marginBottom: 4 },
  workoutCount: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  workoutCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  workoutName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  prText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: '#C9A84C' },
  workoutDate: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { fontSize: typography.fontSize.xs, fontWeight: '500', color: colors.textSecondary },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
  },
  weightRowLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  weightRowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  statBoxMiddle: { marginHorizontal: spacing.sm },
  statValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },

  // PR section
  prSection: { marginBottom: spacing.sm },
  prSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  seeAll: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  prCards: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  prCard: {
    flex: 1,
    borderRadius: 10,
    padding: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
    minHeight: 110,
  },
  trophyIcon: { marginBottom: spacing.xs },
  prCardName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  prCardValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  prCardType: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  prCardEmpty: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  swapBtn: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    padding: spacing.xs,
    borderRadius: 6,
  },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionName: { fontSize: 15, fontWeight: '500' },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.md,
  },
  calendarIconBtn: { padding: spacing.xs },

  // Calendar modal
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
