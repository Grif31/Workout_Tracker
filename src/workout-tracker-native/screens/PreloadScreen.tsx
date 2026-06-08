import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';
import { appCache } from '../utils/appCache';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = { onComplete: () => void };

function buildCalls() {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return [
    { key: 'me',               url: '/api/me' },
    { key: 'recent_workouts',  url: '/api/workouts/recent' },
    { key: 'workout_dates',    url: '/api/workouts/dates' },
    { key: 'profile_workouts', url: '/api/workouts?page=1&per_page=20' },
    { key: 'prs',              url: '/api/personal-records' },
    { key: 'strength_score',   url: '/api/stats/strength-score' },
    { key: 'templates',        url: '/api/workout-templates' },
    { key: 'routines',         url: '/api/routines' },
    { key: 'progress',         url: '/api/stats/progress?range=30d' },
    { key: 'muscle_volume',    url: `/api/stats/muscle-volume?local_date=${localDate}` },
  ];
}

export default function PreloadScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const completed = useRef(0);
  const CALLS = buildCalls();
  const total = CALLS.length + 1; // +1 for profile_stats (needs weekly goal from AsyncStorage)

  const tick = () => {
    completed.current += 1;
    Animated.timing(progress, {
      toValue: completed.current / total,
      duration: 120,
      useNativeDriver: false,
    }).start();
    if (completed.current >= total) {
      setTimeout(onComplete, 150);
    }
  };

  const fetchOne = async (key: string, url: string) => {
    try {
      const res = await apiFetch(url);
      if (res.ok) appCache.set(key, await res.json());
    } catch {}
    tick();
  };

  useEffect(() => {
    const run = async () => {
      // Fetch weekly goal from AsyncStorage first so profile_stats is accurate
      const goalRaw = await AsyncStorage.getItem('workout_weekly_goal');
      const weeklyGoal = goalRaw ? (parseInt(goalRaw, 10) || 3) : 3;

      // All calls in parallel
      await Promise.all([
        ...CALLS.map(({ key, url }) => fetchOne(key, url)),
        fetchOne('profile_stats', `/api/stats/profile?weekly_goal=${weeklyGoal}`),
      ]);
    };
    run();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Image
          source={require('../assets/Arete_icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={[styles.wordmark, { color: colors.textPrimary }]}>Aretē</Text>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: colors.textSecondary,
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xl * 2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  wordmark: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '700',
    letterSpacing: 1,
  },
  barTrack: {
    width: '50%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
