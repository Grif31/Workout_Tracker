import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
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
import { toDisplayVolume, roundTenth, type WeightUnit, GPS_DISTANCE_UNIT_KEY, toDisplayDistance } from 'utils/units';
import { toLocalDateStr } from 'utils/date';
import { GREEK_RANK_CACHED_KEY } from '../../constants/storageKeys';
import { apiFetch, resolveMediaUrl } from '../../utils/api';
import { appCache } from '../../utils/appCache';
import ProfileAvatarFrame, { GREEK_RANK_COLORS } from '../../components/ProfileAvatarFrame';
import { LaurelBranch } from '../../components/LaurelWreath';
import { PR_GOLD, PR_GOLD_TEXT, PR_GOLD_BG } from '../../constants/prColors';
import { fmtHold } from '../../components/workout/types';
import CalendarModal from '../../components/CalendarModal';
import SectionRule from '../../components/SectionRule';

const PR_PINS_BASE = '@pr_pins';
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
  num_exercises?: number;
};

type ProfileStats = {
  total_workouts: number;
  longest_streak: number;
  current_streak: number;
  total_volume: number;
};

// Unique exercises that have at least one PR record
type ExerciseOption = { exercise_template_id: number; exercise_name: string; equipment?: string | null; muscle_group?: string };
// A pinned PR slot — stores the exercise, which metric type, and (for contextual PRs) the context value
type Pin = { exerciseId: number; prType: PR['pr_type']; context: number | null } | null;

export default function ProfileScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';
  const prPinsKey = `${PR_PINS_BASE}_${user?.id}`;
  const weeklyGoalKey = `workout_weekly_goal_${user?.id}`;

  const [selectedFrame, setSelectedFrame] = useState('Neophyte');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);
  const [greekRank, setGreekRank]         = useState<string | null>(null);

  const [calendarVisible, setCalendarVisible]       = useState(false);

  const [workouts, setWorkouts]     = useState<Workout[]>([]);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalWorkouts, setTotalWorkouts] = useState<number | null>(null);
  const loadingMoreRef              = useRef(false);
  const [stats, setStats]           = useState<ProfileStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prs, setPrs]               = useState<PR[]>([]);
  const [pins, setPins]               = useState<Pin[]>([null, null, null]);
  // Which slot is being swapped (0/1/2), or -1 = modal closed
  const [swapSlot, setSwapSlot]       = useState<number>(-1);
  // Step 2 of modal: exercise chosen, waiting for PR type pick
  const [pendingExercise, setPendingExercise] = useState<{ id: number; name: string } | null>(null);
  const [prSearch, setPrSearch]       = useState('');
  const [prMuscle, setPrMuscle]       = useState<string | null>(null);

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
      AsyncStorage.getItem(prPinsKey).then(raw => {
        if (!raw) {
          const top = cachedPrs
            .filter(p => p.pr_type === 'max_weight')
            .sort((a, b) => b.value - a.value)
            .slice(0, DEFAULT_PIN_COUNT)
            .map(p => p.exercise_template_id);
          const filled: Pin[] = [null, null, null];
          top.forEach((id, i) => { filled[i] = { exerciseId: id, prType: 'max_weight', context: null }; });
          savePins(filled);
        }
      });
    }
    if (score?.greek_rank) {
      setGreekRank(score.greek_rank);
      AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, score.greek_rank);
    }
  }, []);

  // Load saved pins + profile frame + cached Greek rank from AsyncStorage once on mount
  useEffect(() => {
    AsyncStorage.multiGet([prPinsKey, `profile_frame_rank_${user?.id}`, GREEK_RANK_CACHED_KEY]).then(pairs => {
      const [pinsRaw, frameRaw, rankRaw] = pairs.map(p => p[1]);
      if (pinsRaw) {
        try {
          const parsed = JSON.parse(pinsRaw);
          const migrated: Pin[] = parsed.map((p: any) =>
            p == null ? null :
            typeof p === 'number' ? { exerciseId: p, prType: 'max_weight' as const, context: null } :
            p
          );
          setPins(migrated);
        } catch {}
      }
      if (frameRaw) setSelectedFrame(frameRaw);
      if (rankRaw) setGreekRank(rankRaw);
    });
  }, []);


  const savePins = (next: Pin[]) => {
    setPins(next);
    AsyncStorage.setItem(prPinsKey, JSON.stringify(next));
  };

  const fetchAll = async () => {
    try {
      const goalRaw = await AsyncStorage.getItem(weeklyGoalKey);
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
          AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, d.greek_rank);
        }
      }
      if (prsRes.ok) {
        const data: PR[] = await prsRes.json();
        setPrs(data);
        // Auto-populate empty pins with top max_weight exercises on first load
        AsyncStorage.getItem(prPinsKey).then(raw => {
          if (!raw) {
            const top = data
              .filter(p => p.pr_type === 'max_weight')
              .sort((a, b) => b.value - a.value)
              .slice(0, DEFAULT_PIN_COUNT)
              .map(p => p.exercise_template_id);
            const filled: Pin[] = [null, null, null];
            top.forEach((id, i) => { filled[i] = { exerciseId: id, prType: 'max_weight', context: null }; });
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
    AsyncStorage.getItem(`profile_frame_rank_${user?.id}`).then(val => {
      if (val) setSelectedFrame(val);
    });
  }, []));

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const handleSelectCalendarWorkout = (workout: { id: number; workout_type?: string }) => {
    setCalendarVisible(false);
    workout.workout_type === 'cardio'
      ? navigation.navigate('CardioDetails', { workoutId: workout.id })
      : navigation.navigate('WorkoutDetails', { workoutId: workout.id });
  };

  const fmtVolume = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
  };

  const fmtTime = (min: number) =>
    `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, '0')}`;

  const getPinnedPR = (pin: Pin): PR | undefined => {
    if (!pin) return undefined;
    const { exerciseId, prType, context } = pin;
    const matches = prs.filter(p => p.exercise_template_id === exerciseId && p.pr_type === prType);
    if (context != null) return matches.find(p => p.weight_context === context) ?? matches[0];
    if (prType === 'max_reps') return matches.sort((a, b) => b.value - a.value)[0];
    return matches[0];
  };

  // Unique exercises available to pin
  const exerciseOptions: ExerciseOption[] = useMemo(() => {
    const seen = new Set<number>();
    const out: ExerciseOption[] = [];
    for (const p of prs) {
      if (!seen.has(p.exercise_template_id)) {
        seen.add(p.exercise_template_id);
        out.push({ exercise_template_id: p.exercise_template_id, exercise_name: p.exercise_name, equipment: p.equipment, muscle_group: p.muscle_group });
      }
    }
    return out.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));
  }, [prs]);

  const prMuscleOptions: string[] = useMemo(() => {
    const muscles = new Set(exerciseOptions.map(e => e.muscle_group ?? 'Other'));
    return Array.from(muscles).sort();
  }, [exerciseOptions]);

  const filteredExerciseOptions = useMemo(() => {
    const q = prSearch.trim().toLowerCase();
    return exerciseOptions.filter(e =>
      (!q || e.exercise_name.toLowerCase().includes(q)) &&
      (!prMuscle || e.muscle_group === prMuscle)
    );
  }, [exerciseOptions, prSearch, prMuscle]);

  const handleSelectPin = (exerciseId: number, prType: PR['pr_type'], context: number | null) => {
    const next = [...pins];
    next[swapSlot] = { exerciseId, prType, context };
    savePins(next);
    setSwapSlot(-1);
    setPendingExercise(null);
    setPrSearch('');
    setPrMuscle(null);
  };

  // The whole box is the entry point into the PR Dashboard — the swap button
  // on each card is a nested Touchable, so tapping it claims the gesture
  // responder and doesn't also fire this outer navigation (standard RN
  // touch-responder behavior, not DOM bubbling).
  const renderPRBar = () => {
    if (prs.length === 0) return null;
    return (
      <TouchableOpacity
        style={styles.prSectionBox}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PRDashboard')}
      >
        <View style={styles.prSectionHeader}>
          <LaurelBranch height={16} color={PR_GOLD_TEXT} />
          <Text style={styles.prSectionTitle}>Personal Records</Text>
          <LaurelBranch side="right" height={16} color={PR_GOLD_TEXT} />
        </View>

        <View style={styles.prCards}>
          {pins.map((pin, slot) => {
            const pr = getPinnedPR(pin);
            return (
              <View key={slot} style={{ flex: 1 }}>
                <View style={[styles.prCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="trophy" size={22} color={PR_GOLD} style={styles.trophyIcon} />
                  {pr ? (
                    <>
                      <Text style={[styles.prCardName, { color: colors.textPrimary }]} numberOfLines={2}>
                        {pr.exercise_name}
                      </Text>
                      <Text style={[styles.prCardValue, { color: PR_GOLD_TEXT }]}>
                        {pr.pr_type === 'max_weight' || pr.pr_type === 'estimated_1rm'
                          ? `${pr.value} ${unit}`
                          : pr.pr_type === 'max_reps'
                            ? `${pr.value} reps`
                            : pr.pr_type === 'best_time'
                              ? fmtTime(pr.value)
                              : pr.pr_type === 'max_duration'
                                ? fmtHold(pr.value)
                                : `${toDisplayDistance(pr.value, distanceUnit).toFixed(1)} ${distanceUnit}`}
                      </Text>
                      <Text style={styles.prCardType}>
                        {pr.pr_type === 'max_weight' ? 'Max Weight'
                          : pr.pr_type === 'estimated_1rm' ? 'Est. 1RM'
                          : pr.pr_type === 'max_reps'
                            ? (pr.weight_context != null ? `@ ${pr.weight_context} ${unit}` : 'Max Reps')
                            : pr.pr_label}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.prCardEmpty}>Tap ↺ to{'\n'}pick exercise</Text>
                  )}
                  <TouchableOpacity
                    style={[styles.swapBtn, { backgroundColor: colors.background }]}
                    onPress={() => setSwapSlot(slot)}
                    hitSlop={6}
                    accessibilityLabel="Change pinned PR"
                  >
                    <Ionicons name="swap-horizontal" size={13} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </TouchableOpacity>
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
              style={[styles.rankBadgePill, { backgroundColor: (GREEK_RANK_COLORS[greekRank] ?? GREEK_RANK_COLORS.Neophyte) + '22', borderColor: GREEK_RANK_COLORS[greekRank] ?? GREEK_RANK_COLORS.Neophyte }]}
            >
              <Text style={[styles.rankBadgeText, { color: GREEK_RANK_COLORS[greekRank] ?? GREEK_RANK_COLORS.Neophyte }]}>
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
      <View style={[styles.statsRow, { borderTopColor: GREEK_RANK_COLORS[greekRank ?? 'Neophyte'] ?? GREEK_RANK_COLORS.Neophyte }]}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Workouts</Text>
          <Text style={styles.statValue}>{stats?.total_workouts ?? '—'}</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxDivider]}>
          <Text style={styles.statLabel}>Longest Streak</Text>
          <Text style={styles.statValue}>{stats ? `${stats.longest_streak}w` : '—'}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Volume</Text>
          <Text style={styles.statValue}>{stats ? `${fmtVolume(stats.total_volume)} ${unit}` : '—'}</Text>
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
        <View style={{ flex: 1 }}>
          <SectionRule label="Workout History" />
        </View>
        <TouchableOpacity onPress={() => setCalendarVisible(true)} hitSlop={8} style={styles.calendarIconBtn}>
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
                  <LaurelBranch height={16} color={PR_GOLD} />
                  <Text style={styles.prText}>{item.pr_count} PR{item.pr_count > 1 ? 's' : ''}</Text>
                  <LaurelBranch side="right" height={16} color={PR_GOLD} />
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
              <View style={styles.pillRow}>
                {!!item.num_exercises && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{item.num_exercises} exercise{item.num_exercises !== 1 ? 's' : ''}</Text>
                  </View>
                )}
                {item.volume != null && item.volume > 0 && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{toDisplayVolume(item.volume, weightUnit)}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Calendar modal */}
      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        onSelectWorkout={handleSelectCalendarWorkout}
      />

      {/* Exercise picker modal for swapping a pinned PR */}
      <Modal
        visible={swapSlot >= 0}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setSwapSlot(-1); setPendingExercise(null); setPrSearch(''); setPrMuscle(null); }}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          {pendingExercise ? (
            /* ── Step 2: pick PR type ── */
            <>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setPendingExercise(null)} hitSlop={8}>
                  <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {pendingExercise.name}
                </Text>
                <TouchableOpacity onPress={() => { setSwapSlot(-1); setPendingExercise(null); setPrSearch(''); setPrMuscle(null); }} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={(() => {
                  const exercisePRs = prs.filter(p => p.exercise_template_id === pendingExercise.id);
                  const opts: { label: string; value: string; prType: PR['pr_type']; context: number | null }[] = [];
                  const seen = new Set<string>();
                  for (const p of exercisePRs) {
                    const key = `${p.pr_type}:${p.weight_context ?? ''}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    let label = p.pr_label;
                    let valueStr = '';
                    if (p.pr_type === 'max_weight') { label = 'Max Weight'; valueStr = `${p.value} ${unit}`; }
                    else if (p.pr_type === 'estimated_1rm') { label = 'Est. 1RM'; valueStr = `${p.value} ${unit}`; }
                    else if (p.pr_type === 'max_reps') { label = 'Max Reps'; valueStr = `${p.value} reps${p.weight_context != null ? ` @ ${p.weight_context} ${unit}` : ''}`; }
                    else if (p.pr_type === 'best_time') { valueStr = fmtTime(p.value); }
                    else if (p.pr_type === 'best_distance') { valueStr = `${toDisplayDistance(p.value, distanceUnit).toFixed(1)} ${distanceUnit}`; }
                    else if (p.pr_type === 'max_duration') { label = 'Longest Hold'; valueStr = fmtHold(p.value); }
                    opts.push({ label, value: valueStr, prType: p.pr_type, context: p.weight_context ?? null });
                  }
                  return opts;
                })()}
                keyExtractor={item => `${item.prType}:${item.context}`}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                ListEmptyComponent={
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg }}>No PR data for this exercise</Text>
                }
                renderItem={({ item }) => {
                  const currentPin = swapSlot >= 0 ? pins[swapSlot] : null;
                  const selected = currentPin?.exerciseId === pendingExercise.id &&
                    currentPin.prType === item.prType && currentPin.context === item.context;
                  return (
                    <Pressable
                      style={[styles.optionRow, {
                        backgroundColor: selected ? colors.accent + '22' : colors.surface,
                        borderColor: selected ? colors.accent : 'transparent',
                      }]}
                      onPress={() => handleSelectPin(pendingExercise.id, item.prType, item.context)}
                    >
                      <View>
                        <Text style={[styles.optionName, { color: colors.textPrimary }]}>{item.label}</Text>
                        <Text style={[styles.optionEquipment, { color: colors.textSecondary }]}>{item.value}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </Pressable>
                  );
                }}
              />
            </>
          ) : (
            /* ── Step 1: pick exercise ── */
            <>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Choose Exercise</Text>
                <TouchableOpacity onPress={() => { setSwapSlot(-1); setPrSearch(''); setPrMuscle(null); }} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={[styles.prSearchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                <TextInput
                  style={[styles.prSearchInput, { color: colors.textPrimary }]}
                  value={prSearch}
                  onChangeText={setPrSearch}
                  placeholder="Search exercises…"
                  placeholderTextColor={colors.placeholder}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.prChipRow}>
                <TouchableOpacity
                  style={[styles.prChip, !prMuscle && { backgroundColor: colors.accent }]}
                  onPress={() => setPrMuscle(null)}
                >
                  <Text style={[styles.prChipText, { color: !prMuscle ? colors.accentText : colors.textSecondary }]}>All</Text>
                </TouchableOpacity>
                {prMuscleOptions.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.prChip, prMuscle === m && { backgroundColor: colors.accent }]}
                    onPress={() => setPrMuscle(prMuscle === m ? null : m)}
                  >
                    <Text style={[styles.prChipText, { color: prMuscle === m ? colors.accentText : colors.textSecondary }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <FlatList
                data={filteredExerciseOptions}
                keyExtractor={item => item.exercise_template_id.toString()}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                ListEmptyComponent={
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg }}>No exercises found</Text>
                }
                renderItem={({ item }) => {
                  const selected = swapSlot >= 0 && pins[swapSlot]?.exerciseId === item.exercise_template_id;
                  return (
                    <Pressable
                      style={[styles.optionRow, {
                        backgroundColor: selected ? colors.accent + '22' : colors.surface,
                        borderColor: selected ? colors.accent : 'transparent',
                      }]}
                      onPress={() => setPendingExercise({ id: item.exercise_template_id, name: item.exercise_name })}
                    >
                      <View>
                        <Text style={[styles.optionName, { color: colors.textPrimary }]}>
                          {item.exercise_name}
                          {item.equipment && item.equipment !== 'Bodyweight' && (
                            <Text style={styles.optionEquipment}> · {item.equipment}</Text>
                          )}
                        </Text>
                        {item.muscle_group && (
                          <Text style={[styles.optionEquipment, { color: colors.textSecondary }]}>{item.muscle_group}</Text>
                        )}
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </Pressable>
                  );
                }}
              />
            </>
          )}
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
  prText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: PR_GOLD_TEXT },
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
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  statBox: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  statBoxDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    borderRightColor: colors.border,
  },
  statValue: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },

  // PR section — the whole box is tappable, entry point into the PR Dashboard
  prSectionBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: PR_GOLD,
    borderRadius: 14,
    padding: spacing.sm,
  },
  prSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  prSectionTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: PR_GOLD_TEXT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prCards: {
    flexDirection: 'row',
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
  optionEquipment: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },

  prSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: spacing.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  prSearchInput: { flex: 1, fontSize: typography.fontSize.sm, paddingVertical: 4 },
  prChipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prChip: {
    height: 30,
    minWidth: 64,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prChipText: { fontSize: typography.fontSize.xs, fontWeight: '600' },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  calendarIconBtn: { padding: spacing.xs },
});
