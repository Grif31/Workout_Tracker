import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { createBottomTabNavigator, BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { DashboardStack } from './DashboardStack';
import { ExercisesStack } from './ExercisesStack';
import { TrainingStack } from './TrainingStack';
import { ProfileStack } from './ProfileStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppStack } from './types';
import { useTheme } from '../context/ThemeContext';
import { useWorkoutSession } from '../context/WorkoutSessionContext';
import { navigationRef } from './navigationRef';

const Tab = createBottomTabNavigator<AppStack>();

const isIOS = Platform.OS === 'ios';
const iosVersion = isIOS ? parseInt(String(Platform.Version), 10) : 0;
const isIOS18Plus = isIOS && iosVersion >= 18;

function fmtElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60)}m`;
}

function MiniWorkoutBar() {
  const { colors } = useTheme();
  const { session, clearSession } = useWorkoutSession();
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) { if (tickRef.current) clearInterval(tickRef.current); return; }
    const compute = () =>
      session.baseElapsed + Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    setElapsed(compute());
    tickRef.current = setInterval(() => setElapsed(compute()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session]);

  if (!session) return null;

  const setsDone = session.exercises.flatMap(e => e.sets).filter(s => s.done).length;
  const setsTotal = session.exercises.flatMap(e => e.sets).length;

  const handleResume = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DashboardTab', { screen: 'WorkoutLog', params: {} });
    }
  };

  return (
    <View style={[styles.miniBar, {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    }]}>
      <View style={styles.miniLeft}>
        <Text style={[styles.miniName, { color: colors.textPrimary }]} numberOfLines={1}>
          {session.workoutName || 'Workout'}
        </Text>
        <Text style={[styles.miniSub, { color: colors.textSecondary }]}>
          {fmtElapsed(elapsed)} · {setsDone}/{setsTotal} sets
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.miniBtn, { backgroundColor: colors.accent }]}
        onPress={handleResume}
      >
        <Ionicons name="play" size={14} color={colors.accentText} />
        <Text style={[styles.miniBtnText, { color: colors.accentText }]}>Resume</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.miniBtn, { borderWidth: 1, borderColor: colors.border }]}
        onPress={() => {
          Alert.alert(
            'Discard Workout',
            'Are you sure you want to discard this workout? All progress will be lost.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: clearSession },
            ]
          );
        }}
      >
        <Ionicons name="trash-outline" size={14} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

function CustomTabBar(props: BottomTabBarProps) {
  const { isWorkoutOpen } = useWorkoutSession();
  if (isWorkoutOpen) return null;
  return (
    <View>
      <MiniWorkoutBar />
      <BottomTabBar {...props} />
    </View>
  );
}

export function AppTabs() {
  const { colors } = useTheme();

  // On iOS 18+, remove the top border so the tab bar blends cleanly with
  // the system's adaptive appearance. On Android / older iOS keep the border.
  const tabBarStyle = isIOS18Plus
    ? { backgroundColor: colors.surface, borderTopWidth: 0, elevation: 0 }
    : { backgroundColor: colors.surface, borderTopColor: colors.border };

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle,
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'DashboardTab') iconName = 'home';
          else if (route.name === 'ExercisesTab') iconName = 'barbell';
          else if (route.name === 'TrainingTab') iconName = 'trophy';
          else if (route.name === 'ProfileTab') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="ExercisesTab" component={ExercisesStack} options={{ title: 'Exercises' }} />
      <Tab.Screen name="TrainingTab" component={TrainingStack} options={{ title: 'Training' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  miniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  miniLeft: { flex: 1, justifyContent: 'center' },
  miniName: { fontSize: 14, fontWeight: '700' },
  miniSub: { fontSize: 12, marginTop: 1 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  miniBtnText: { fontSize: 13, fontWeight: '600' },
});
