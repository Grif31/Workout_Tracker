import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, AppState, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postLiveWorkoutNotification, cancelLiveWorkoutNotification } from '../utils/notifications';
import { onPendingCountChange, initPendingCount, flushQueue } from '../utils/offlineQueue';
import { showToast } from '../utils/toast';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { DashboardStack } from './DashboardStack';
import { ExercisesStack } from './ExercisesStack';
import { TrainingStack } from './TrainingStack';
import { ProfileStack } from './ProfileStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppStack } from './types';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useWorkoutSession } from '../context/WorkoutSessionContext';
import { navigationRef } from './navigationRef';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

const Tab = createBottomTabNavigator<AppStack>();

const ROOT_SCREENS: Record<string, string> = {
  DashboardTab: 'DashboardHome',
  ExercisesTab: 'ExercisesHome',
  TrainingTab:  'TrainingHome',
  ProfileTab:   'ProfileHome',
};

const isIOS = Platform.OS === 'ios';
const iosVersion = isIOS ? parseInt(String(Platform.Version), 10) : 0;
const isIOS18Plus = isIOS && iosVersion >= 18;

const TAB_CONFIG: Array<{ route: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
  { route: 'DashboardTab', icon: 'home',        label: 'Home'      },
  { route: 'ExercisesTab', icon: 'barbell',     label: 'Exercises' },
  { route: 'TrainingTab',  icon: 'stats-chart', label: 'Training'  },
  { route: 'ProfileTab',   icon: 'person',      label: 'Profile'   },
];

const ICON_SIZE = 24;
const ICON_LIFT = 5;

const screenFadeAnim = new Animated.Value(1);

// Fade wrapper applied per-scene so tab switches animate only the screen
// content — the tab bar and MiniWorkoutBar render inside Tab.Navigator and
// must stay solid.
const withScreenFade = (Stack: React.ComponentType<any>) => () => (
  <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
    <Stack />
  </Animated.View>
);
const FadedDashboardStack = withScreenFade(DashboardStack);
const FadedExercisesStack = withScreenFade(ExercisesStack);
const FadedTrainingStack  = withScreenFade(TrainingStack);
const FadedProfileStack   = withScreenFade(ProfileStack);

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
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const hadSessionRef = useRef(false);

  // Slide-up entrance when a session first appears (fresh minimize or a
  // crash-restored workout on cold start)
  useEffect(() => {
    if (session && !hadSessionRef.current) {
      entranceAnim.setValue(0);
      Animated.spring(entranceAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      }).start();
    }
    hadSessionRef.current = !!session;
  }, [session]);

  useEffect(() => {
    if (!session) { if (tickRef.current) clearInterval(tickRef.current); return; }
    const compute = () =>
      session.baseElapsed + Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    setElapsed(compute());
    tickRef.current = setInterval(() => setElapsed(compute()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session]);

  // Post live notification when app is backgrounded while workout is minimized
  useEffect(() => {
    if (!session) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background') {
        const liveOff = await AsyncStorage.getItem('live_workout_notif_enabled');
        if (liveOff === 'false') return;
        const done = session.exercises.flatMap(e => e.sets).filter(s => s.done).length;
        const total = session.exercises.flatMap(e => e.sets).length;
        const secs = session.baseElapsed + Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
        const currentExercise = (
          session.exercises.find(e => e.sets.some(s => !s.done)) ?? session.exercises[session.exercises.length - 1]
        )?.name;
        postLiveWorkoutNotification({
          workoutName: session.workoutName || 'Workout',
          elapsed: fmtElapsed(secs),
          setsDone: done,
          setsTotal: total,
          currentExercise,
        });
      } else if (nextState === 'active') {
        cancelLiveWorkoutNotification();
      }
    });
    return () => sub.remove();
  }, [session]);

  if (!session) return null;

  const setsDone = session.exercises.flatMap(e => e.sets).filter(s => s.done).length;
  const setsTotal = session.exercises.flatMap(e => e.sets).length;
  const progressPct = setsTotal > 0 ? Math.min(100, (setsDone / setsTotal) * 100) : 0;
  const currentExercise = (
    session.exercises.find(e => e.sets.some(s => !s.done)) ?? session.exercises[session.exercises.length - 1]
  )?.name;
  const subParts = [fmtElapsed(elapsed), currentExercise, `${setsDone}/${setsTotal} sets`].filter(Boolean);

  const handleResume = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DashboardTab', { screen: 'WorkoutLog', params: {}, initial: false });
    }
  };

  return (
    <Animated.View style={{
      opacity: entranceAnim,
      transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleResume}
        style={[styles.miniBar, {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }]}
      >
        <View style={[styles.miniProgress, { backgroundColor: colors.accent, width: `${progressPct}%` }]} />
        <View style={styles.miniLeft}>
          <Text style={[styles.miniName, { color: colors.textPrimary }]} numberOfLines={1}>
            {session.workoutName || 'Workout'}
          </Text>
          <Text style={[styles.miniSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {subParts.join(' · ')}
          </Text>
        </View>
        <View style={[styles.miniBtn, { backgroundColor: colors.accent }]}>
          <Ionicons name="play" size={14} color={colors.accentText} />
          <Text style={[styles.miniBtnText, { color: colors.accentText }]}>Resume</Text>
        </View>
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
      </TouchableOpacity>
    </Animated.View>
  );
}

function AnimatedTabBar({ state, navigation, colors, pendingCount }: {
  state: BottomTabBarProps['state'];
  navigation: BottomTabBarProps['navigation'];
  colors: Colors;
  pendingCount: number;
}) {
  const { bottom } = useSafeAreaInsets();

  const anims = useRef(
    state.routes.map((_, i) => new Animated.Value(i === state.index ? 1 : 0))
  ).current;

  useEffect(() => {
    state.routes.forEach((_, i) => {
      Animated.spring(anims[i], {
        toValue: i === state.index ? 1 : 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 260,
        mass: 0.65,
      }).start();
    });
  }, [state.index]);

  const borderStyle = isIOS18Plus
    ? { borderTopWidth: 0 }
    : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };

  return (
    <View style={[
      styles.animBar,
      borderStyle,
      { backgroundColor: colors.surface, paddingBottom: bottom || 8 },
    ]}>
      {state.routes.map((route, i) => {
        const isActive = state.index === i;
        const anim    = anims[i];
        const config  = TAB_CONFIG[i];
        const color   = isActive ? colors.accent : colors.textSecondary;

        const blockTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -ICON_LIFT] });
        const blockScale      = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
        const labelOpacity    = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.animTab}
            activeOpacity={1}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                Animated.timing(screenFadeAnim, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
                  navigation.navigate(route.name);
                  Animated.timing(screenFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
                });
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          >
            <Animated.View style={[
              styles.animTabContent,
              { transform: [{ translateY: blockTranslateY }, { scale: blockScale }] },
            ]}>
              {route.name === 'DashboardTab' && pendingCount > 0 ? (
                <View>
                  <Ionicons name={config.icon} size={ICON_SIZE} color={color} />
                  <View style={[styles.syncDot, { backgroundColor: colors.warmup }]} />
                </View>
              ) : (
                <Ionicons name={config.icon} size={ICON_SIZE} color={color} />
              )}
              <Animated.Text
                numberOfLines={1}
                style={[styles.animLabel, { color, opacity: labelOpacity }]}
              >
                {config.label}
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CustomTabBar(props: BottomTabBarProps) {
  const { colors } = useTheme();
  const { isWorkoutOpen } = useWorkoutSession();
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;
  const heightRef  = useRef(0);
  const prevSubScreen = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    initPendingCount();
    // The tab bar mounts on every login — flush the (re)authenticated user's
    // parked queue here, since NetInfo only triggers a flush when connectivity
    // actually changes.
    flushQueue().then(({ synced, dropped }) => {
      if (synced > 0) showToast(`${synced} workout${synced > 1 ? 's' : ''} synced`);
      if (dropped > 0) showToast(`${dropped} workout${dropped > 1 ? 's' : ''} couldn't sync and ${dropped > 1 ? 'were' : 'was'} removed`);
    });
    return onPendingCountChange(setPendingCount);
  }, []);

  const activeRoute = props.state.routes[props.state.index];
  const focusedRoute = getFocusedRouteNameFromRoute(activeRoute);
  const isOnSubScreen = focusedRoute !== undefined && focusedRoute !== ROOT_SCREENS[activeRoute.name];

  useEffect(() => {
    if (prevSubScreen.current === isOnSubScreen) return;
    prevSubScreen.current = isOnSubScreen;
    if (isOnSubScreen) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: heightRef.current, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,                 duration: 160, useNativeDriver: true }),
      ]).start(() => setCollapsed(true));
    } else {
      setCollapsed(false);
      translateY.setValue(heightRef.current);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180, mass: 0.8 }),
        Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [isOnSubScreen]);

  if (isWorkoutOpen) return null;
  return (
    <View style={{ backgroundColor: colors.surface }}>
      <MiniWorkoutBar />
      <Animated.View
        onLayout={e => { heightRef.current = e.nativeEvent.layout.height; }}
        style={{ opacity, transform: [{ translateY }], display: collapsed ? 'none' : 'flex' }}
        pointerEvents={isOnSubScreen ? 'none' : 'auto'}
      >
        <AnimatedTabBar
          state={props.state}
          navigation={props.navigation}
          colors={colors}
          pendingCount={pendingCount}
        />
      </Animated.View>
    </View>
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="DashboardTab" component={FadedDashboardStack} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="ExercisesTab" component={FadedExercisesStack} options={{ title: 'Exercises' }} />
      <Tab.Screen name="TrainingTab" component={FadedTrainingStack} options={{ title: 'Training' }} />
      <Tab.Screen name="ProfileTab" component={FadedProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  miniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  miniProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2.5,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  miniLeft: { flex: 1, justifyContent: 'center' },
  miniName: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  miniSub: { fontSize: 12, marginTop: 1 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  miniBtnText: { fontSize: 13, fontWeight: '600' },
  syncDot: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  animBar: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  animTab: {
    flex: 1,
    alignItems: 'center',
  },
  animTabContent: {
    alignItems: 'center',
    gap: 3,
  },
  animLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
