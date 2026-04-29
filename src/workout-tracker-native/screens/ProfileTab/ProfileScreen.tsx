import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { useFocusEffect } from '@react-navigation/native';
import { typography } from 'theme/typography';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

type Workout = {
  id: number;
  name: string;
  date: string;
  notes?: string;
};

type ProfileStats = {
  total_workouts: number;
  longest_streak: number;
  total_volume: number;
};

export default function ProfileScreen({ navigation }: Props) {
  const { user, token, logout, loading } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = user?.name?.trim() || user?.username;

  const fetchAll = async () => {
    if (!token) return;
    try {
      const [workoutsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/workouts`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/stats/profile`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (workoutsRes.ok) setWorkouts(await workoutsRes.json());
      else if (workoutsRes.status === 401) await logout();
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to fetch profile data', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAll(); }, [token]));

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const fmtVolume = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
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
            {user?.bodyweight ? `${user.bodyweight} ${user.weight_unit || 'lbs'}` : 'Tap to track'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Workout History</Text>
    </View>
  );

  return (
    // Single FlatList instead of ScrollView + FlatList to avoid nested scroll issues
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
          style={[styles.workoutCard, { backgroundColor: colors.surface }]}
          onPress={() => navigation.navigate('WorkoutDetails', { workoutId: item.id })}
        >
          <Text style={styles.workoutName}>{item.name}</Text>
          <Text style={styles.workoutDate}>
            {new Date(item.date).toLocaleDateString()}
          </Text>
          {item.notes ? (
            <Text style={styles.workoutNotes} numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}
        </TouchableOpacity>
      )}
    />
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
    padding: spacing.md,
    borderRadius: spacing.sm,
  },
  workoutName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  workoutDate: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  workoutNotes: { fontSize: 13, color: colors.textSecondary },
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
  statBoxMiddle: {
    marginHorizontal: spacing.sm,
  },
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
});