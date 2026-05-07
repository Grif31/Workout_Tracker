import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { toDisplayVolume, type WeightUnit } from 'utils/units';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PR_PINS_KEY = '@pr_pins';
const DEFAULT_PIN_COUNT = 3;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

type Workout = {
  id: number;
  name: string;
  date: string;
  notes?: string;
  duration?: number;
  volume?: number;
};

type ProfileStats = {
  total_workouts: number;
  longest_streak: number;
  total_volume: number;
};

// Unique exercises that have at least one PR record
type ExerciseOption = { exercise_template_id: number; exercise_name: string };

export default function ProfileScreen({ navigation }: Props) {
  const { user, token, logout, loading } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [workouts, setWorkouts]   = useState<Workout[]>([]);
  const [stats, setStats]         = useState<ProfileStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prs, setPrs]             = useState<PR[]>([]);
  // Indices into pinned exercise_template_ids; null = empty slot
  const [pins, setPins]           = useState<(number | null)[]>([null, null, null]);
  // Which slot is being swapped (0/1/2), or -1 = modal closed
  const [swapSlot, setSwapSlot]   = useState<number>(-1);

  const displayName = user?.name?.trim() || user?.username;
  const weightUnit: WeightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';

  // Load saved pins from AsyncStorage once on mount
  useEffect(() => {
    AsyncStorage.getItem(PR_PINS_KEY).then(raw => {
      if (raw) {
        try { setPins(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const savePins = (next: (number | null)[]) => {
    setPins(next);
    AsyncStorage.setItem(PR_PINS_KEY, JSON.stringify(next));
  };

  const fetchAll = async () => {
    if (!token) return;
    try {
      const [workoutsRes, statsRes, prsRes] = await Promise.all([
        fetch(`${API_URL}/api/workouts`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/stats/profile`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/personal-records`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (workoutsRes.ok) setWorkouts(await workoutsRes.json());
      else if (workoutsRes.status === 401) await logout();
      if (statsRes.ok) setStats(await statsRes.json());
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
    } catch (err) {
      console.error('Failed to fetch profile data', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAll(); }, [token]));

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

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
        out.push({ exercise_template_id: p.exercise_template_id, exercise_name: p.exercise_name });
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

  // Rendered above the workout list via ListHeaderComponent
  const renderHeader = () => (
    <View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, typography.title]}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.textPrimary} />
      ) : (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface, padding: spacing.md }]}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Image
            source={
              user?.profile_pic_url
                ? { uri: user.profile_pic_url }
                : require('../../assets/profile-placeholder.png')
            }
            style={styles.image}
          />
          <View style={styles.userInfo}>
            <Text style={[styles.value, { color: colors.textPrimary }]}>
              {displayName || '—'}
            </Text>
            <Text style={styles.workoutCount}>
              {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Stats boxes */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats?.total_workouts ?? '—'}</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Text style={styles.statValue}>{stats ? `${stats.longest_streak}d` : '—'}</Text>
          <Text style={styles.statLabel}>Longest Streak</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats ? fmtVolume(stats.total_volume) : '—'}</Text>
          <Text style={styles.statLabel}>Total Volume</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.weightRow}
        onPress={() => navigation.navigate('BodyweightLog')}
      >
        <View>
          <Text style={styles.weightRowLabel}>Bodyweight</Text>
          <Text style={styles.weightRowValue}>
            {user?.bodyweight ? `${user.bodyweight} ${unit}` : 'Tap to track'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {renderPRBar()}

      <Text style={styles.sectionTitle}>Workout History</Text>
    </View>
  );

  return (
    <>
      <FlatList
        style={styles.container}
        data={workouts}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No workouts logged yet</Text>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.workoutCard}
            onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.workoutName} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={styles.workoutDate}>
              {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {item.duration ? `  ·  ${item.duration} min` : ''}
            </Text>
            {(item.volume != null && item.volume > 0) && (
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{toDisplayVolume(item.volume, weightUnit)}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

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
                    {item.exercise_name}
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
  image: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eee',
    marginRight: spacing.md,
  },
  userInfo: { flex: 1 },
  value: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  workoutCount: { fontSize: 14, color: colors.textSecondary },
  sectionTitle: {
    fontSize: 16,
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
  workoutName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
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
  pillText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
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
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
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
  seeAll: { fontSize: 14, fontWeight: '600' },
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
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  swapBtn: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    padding: 4,
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
});
