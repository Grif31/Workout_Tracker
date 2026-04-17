import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Alert,
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
import { colors } from 'theme/colors';
import { spacing } from 'theme/spacing';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ProfileHome'>;

type Workout = {
  id: number;
  name: string;
  date: string;
  notes?: string;
};

export default function ProfileScreen({ navigation }: Props) {
  const { user, token, logout, loading } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = user?.name?.trim() || user?.username;
  const workoutCount = workouts.length;

  // Fetch the user's workout history separately from AuthContext user data.
  // AuthContext holds identity/auth state — workout history is screen-level data.
  const fetchWorkouts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/workouts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkouts(data);
      } else if (res.status === 401) {
        await logout();
      }
    } catch (err) {
      console.error('Failed to fetch workouts', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [token])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchWorkouts();
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  // Rendered above the workout list via ListHeaderComponent
  const renderHeader = () => (
    <View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, typography.title]}>Profile</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
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
              {workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

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

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: 0,
  },
  title: { fontWeight: 'bold', color: colors.textPrimary },
  logoutText: { color: colors.danger, fontSize: 14 },
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
});