import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Alert, AppState, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIVE_WORKOUT_NOTIF_KEY } from '../constants/storageKeys';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postLiveWorkoutNotification, cancelLiveWorkoutNotification } from '../utils/notifications';
import { endLiveActivity, isLiveActivityActive } from '../utils/liveActivity';
import MiniRunBar from '../components/MiniRunBar';
import MiniSessionBar from '../components/MiniSessionBar';
import { useGpsRunStatus } from '../context/GpsRunContext';
import { fmtElapsed } from '../components/workout/types';
import { currentExerciseName } from '../utils/liveActivityProps';
import { onPendingCountChange, initPendingCount, flushQueue, announceFlushResult } from '../utils/offlineQueue';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { DashboardStack } from './DashboardStack';
import { ProgressStack } from './ProgressStack';
import { TrainingStack } from './TrainingStack';
import { ProfileStack } from './ProfileStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppStack } from './types';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useWorkoutSession, sessionElapsedSeconds } from '../context/WorkoutSessionContext';
import { navigationRef } from './navigationRef';
import { useWidgetLinks } from './useWidgetLinks';
import WidgetDiagramRenderer from '../components/WidgetDiagramRenderer';
import { motionTiming, motionSpring } from '../utils/motion';

const Tab = createBottomTabNavigator<AppStack>();

const ROOT_SCREENS: Record<string, string> = {
  DashboardTab: 'DashboardHome',
  ProgressTab:  'ProgressHome',
  TrainingTab:  'TrainingHome',
  ProfileTab:   'ProfileHome',
};

const isIOS = Platform.OS === 'ios';
const iosVersion = isIOS ? parseInt(String(Platform.Version), 10) : 0;
const isIOS18Plus = isIOS && iosVersion >= 18;

const TAB_CONFIG: Array<{ route: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
  { route: 'DashboardTab', icon: 'home',        label: 'Home'      },
  { route: 'ProgressTab',  icon: 'stats-chart', label: 'Progress'  },
  { route: 'TrainingTab',  icon: 'barbell',     label: 'Coach'     },
  { route: 'ProfileTab',   icon: 'person',      label: 'Profile'   },
];

const ICON_SIZE = 24;
const ICON_LIFT = 5;

// Screens that take the whole window: the tab area is gone while one is in the stack
const FULL_SCREEN_ROUTES = ['WorkoutLog', 'GPSCardio'];
const BAR_SPRING = { damping: 20, stiffness: 180, mass: 0.8 };

function MiniWorkoutBar({ animateIn }: { animateIn: boolean }) {
  const { session, clearSession, isWorkoutOpen } = useWorkoutSession();
  // Ref so the AppState closure reads the live value without resubscribing
  const workoutOpenRef = useRef(isWorkoutOpen);
  workoutOpenRef.current = isWorkoutOpen;
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) { if (tickRef.current) clearInterval(tickRef.current); return; }
    const compute = () => sessionElapsedSeconds(session);
    setElapsed(compute());
    tickRef.current = setInterval(() => setElapsed(compute()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [session]);

  // Post live notification when app is backgrounded while workout is minimized
  useEffect(() => {
    if (!session) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background') {
        // WorkoutLog posts with fresher state when it's open — never both
        if (workoutOpenRef.current) return;
        const liveOff = await AsyncStorage.getItem(LIVE_WORKOUT_NOTIF_KEY);
        if (liveOff === 'false') return;
        // The Live Activity is already on the lock screen; the notification is its fallback
        if (isLiveActivityActive()) return;
        const done = session.exercises.flatMap(e => e.sets).filter(s => s.done).length;
        const total = session.exercises.flatMap(e => e.sets).length;
        const secs = sessionElapsedSeconds(session);
        const currentExercise = currentExerciseName(session.exercises);
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
  const currentExercise = currentExerciseName(session.exercises);
  const subParts = [fmtElapsed(elapsed), currentExercise, `${setsDone}/${setsTotal} sets`].filter(Boolean);

  const handleResume = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DashboardTab', { screen: 'WorkoutLog', params: {}, initial: false });
    }
  };

  const handleDiscard = () => Alert.alert(
    'Discard Workout?',
    'Your logged sets will be lost.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { endLiveActivity(); clearSession(); } },
    ]
  );

  return (
    <MiniSessionBar
      title={session.workoutName || 'Workout'}
      subtitle={subParts.join(' · ')}
      progressPct={progressPct}
      actionLabel="Open"
      actionIcon="chevron-up"
      onOpen={handleResume}
      onDiscard={handleDiscard}
      discardA11yLabel="Discard workout"
      animateIn={animateIn}
    />
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
      motionSpring(anims[i], {
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
    <View
      accessibilityRole="tabbar"
      style={[
        styles.animBar,
        borderStyle,
        { backgroundColor: colors.surface, paddingBottom: bottom || 8 },
      ]}
    >
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
            accessibilityRole="tab"
            accessibilityLabel={config.label}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              // No screen fade: tabs are switched dozens of times a session, and
              // the old 80ms fade-out delayed every switch. The icon lift above
              // is the feedback.
              if (!isActive && !event.defaultPrevented) navigation.navigate(route.name);
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
  const { bottom } = useSafeAreaInsets();
  const { session } = useWorkoutSession();
  const run = useGpsRunStatus();
  const hasMiniBar = !!session || (run.trackingState !== 'idle' && !run.screenOpen);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    initPendingCount();
    // The tab bar mounts on every login — flush the (re)authenticated user's
    // parked queue here, since NetInfo only triggers a flush when connectivity
    // actually changes.
    flushQueue().then(announceFlushResult);
    return onPendingCountChange(setPendingCount);
  }, []);

  const activeRoute = props.state.routes[props.state.index];
  const focusedRoute = getFocusedRouteNameFromRoute(activeRoute);
  const isOnSubScreen = focusedRoute !== undefined && focusedRoute !== ROOT_SCREENS[activeRoute.name];
  // From navigation state, which changes in the render that starts the push or
  // pop. The screens' own open flags lag by a whole slide: the bars used to
  // appear only once a minimized workout had finished sliding away.
  const stackRoutes = activeRoute.state?.routes.map(r => r.name) ?? (focusedRoute ? [focusedRoute] : []);
  const fullScreen = stackRoutes.some(name => FULL_SCREEN_ROUTES.includes(name));

  // The bars are an overlay pinned to the bottom edge, and a spacer under them
  // holds the room the screen gives up. The tab bar is never unmounted, only
  // moved below the edge, so no animation has to be undone when it ends.
  const [chromeH, setChromeH] = useState(0);
  const [tabH, setTabH] = useState(0);
  // With a mini bar, the tab bar's safe-area strip stays up as the mini bar's home indicator clearance
  const travel = hasMiniBar ? Math.max(0, tabH - bottom) : tabH;

  const chromeY = useRef(new Animated.Value(0)).current;
  const chromeOpacity = useRef(new Animated.Value(fullScreen ? 0 : 1)).current;
  const tabOpacity = useRef(new Animated.Value(isOnSubScreen ? 0 : 1)).current;
  const prev = useRef({ sub: isOnSubScreen, full: fullScreen });
  const gen = useRef(0);
  const animating = useRef(false);
  const riseOnLayout = useRef(fullScreen);
  const [holding, setHolding] = useState<'tabs' | 'all' | null>(null);

  // Room is given up at once, so a pushed screen lays out at full height from
  // its first frame, and taken back only once the bars are up, so the screen
  // leaving doesn't jump. The render that starts a change, before its effect, holds too.
  const justShowedTabs = prev.current.sub && !isOnSubScreen && !prev.current.full && !fullScreen;
  const justLeftFullScreen = prev.current.full && !fullScreen;
  const hold = holding ?? (justLeftFullScreen ? 'all' : justShowedTabs ? 'tabs' : null);
  const spacerH = hold === 'all' ? 0
    : isOnSubScreen || hold === 'tabs' ? Math.max(0, chromeH - travel)
    : chromeH;

  useEffect(() => {
    const was = prev.current;
    prev.current = { sub: isOnSubScreen, full: fullScreen };
    if (was.sub === isOnSubScreen && was.full === fullScreen) return;
    if (was.full && !fullScreen) {
      tabOpacity.setValue(isOnSubScreen ? 0 : 1);
      // The rise is onChromeLayout's, which may already have run: bumping gen
      // here would orphan its completion and hold the room forever
      if (riseOnLayout.current) setHolding('all');
      return;
    }
    const g = ++gen.current;
    const done = () => {
      if (g !== gen.current) return;
      animating.current = false;
      setHolding(null);
    };
    if (fullScreen) {
      animating.current = false;
      setHolding(null);
      chromeOpacity.setValue(0);
      riseOnLayout.current = true;
      return;
    }
    animating.current = true;
    if (isOnSubScreen) {
      setHolding(null);
      Animated.parallel([
        motionTiming(chromeY, { toValue: travel, duration: 220, useNativeDriver: true }),
        motionTiming(tabOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(done);
    } else {
      setHolding('tabs');
      Animated.parallel([
        motionSpring(chromeY, { toValue: 0, useNativeDriver: true, ...BAR_SPRING }),
        motionTiming(tabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(done);
    }
  }, [isOnSubScreen, fullScreen]);

  // A mini bar coming or going on a sub-screen changes how far down the tab bar sits
  useEffect(() => {
    if (animating.current || fullScreen) return;
    chromeY.setValue(isOnSubScreen ? travel : 0);
  }, [travel]);

  // Back from the workout log or the map: the bars rise from below the edge as
  // the screen slides down behind them. Started here because the height to rise
  // from is only known once the bars, now with a mini bar in them, are laid out.
  const onChromeLayout = (h: number) => {
    setChromeH(h);
    if (!riseOnLayout.current) return;
    riseOnLayout.current = false;
    const g = ++gen.current;
    animating.current = true;
    setHolding('all');
    chromeY.setValue(h);
    Animated.parallel([
      motionSpring(chromeY, { toValue: isOnSubScreen ? travel : 0, useNativeDriver: true, ...BAR_SPRING }),
      motionTiming(chromeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      if (g !== gen.current) return;
      animating.current = false;
      setHolding(null);
    });
  };

  // Gone at once rather than sliding away, so nothing sits over the workout log
  // or the map as it slides up
  if (fullScreen) return null;
  // A mini bar that arrives inside the rise shouldn't slide up a second time
  const miniAnimateIn = !riseOnLayout.current;
  return (
    <View style={{ height: spacerH, backgroundColor: colors.surface }}>
      <Animated.View
        onLayout={e => onChromeLayout(e.nativeEvent.layout.height)}
        style={[styles.chrome, { opacity: chromeOpacity, transform: [{ translateY: chromeY }] }]}
      >
        <MiniWorkoutBar animateIn={miniAnimateIn} />
        <MiniRunBar animateIn={miniAnimateIn} />
        <Animated.View
          onLayout={e => { const h = e.nativeEvent.layout.height; if (h > 0) setTabH(h); }}
          style={{ opacity: tabOpacity }}
          pointerEvents={isOnSubScreen ? 'none' : 'auto'}
          accessibilityElementsHidden={isOnSubScreen}
          importantForAccessibility={isOnSubScreen ? 'no-hide-descendants' : 'auto'}
        >
          <AnimatedTabBar
            state={props.state}
            navigation={props.navigation}
            colors={colors}
            pendingCount={pendingCount}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function AppTabs() {
  useWidgetLinks();
  return (
    <>
      {/* Behind the navigator, which covers it: renders Up Next's muscle diagrams for the iOS widget */}
      {Platform.OS === 'ios' ? <WidgetDiagramRenderer /> : null}
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Dashboard' }} />
        <Tab.Screen name="ProgressTab" component={ProgressStack} options={{ title: 'Progress' }} />
        <Tab.Screen name="TrainingTab" component={TrainingStack} options={{ title: 'Coach' }} />
        <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
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
