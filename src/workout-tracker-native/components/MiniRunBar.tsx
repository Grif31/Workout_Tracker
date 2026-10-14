import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useGpsRun } from '../context/GpsRunContext';
import { useTheme, type Colors } from '../context/ThemeContext';
import { navigationRef } from '../navigation/navigationRef';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { GPS_DISTANCE_UNIT_KEY, toDisplayDistance } from '../utils/units';
import { runElapsedSeconds } from '../utils/gpsRun';

// Stands in for GPSCardioScreen while a run is minimized, the way the workout
// mini bar stands in for WorkoutLog. Open goes back to the map; Discard asks
// first, since a tracked route can't be re-walked. Pause and Stop stay on the
// screen.

function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MiniRunBar() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { trackingState, activity, run, timing, clearRun, screenOpen, recovered } = useGpsRun();
  const [unit, setUnit] = useState<'km' | 'mi'>('mi');
  const [, setTick] = useState(0);

  // Read when a run shows up rather than once, so a change in Settings is seen by the next run
  const active = trackingState !== 'idle';
  useEffect(() => {
    if (!active) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user?.id}`).then(v => setUnit(v === 'km' ? 'km' : 'mi')).catch(() => {});
  }, [active, user?.id]);

  useEffect(() => {
    if (trackingState !== 'running' || screenOpen) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [trackingState, screenOpen]);

  // Slides up each time it appears, as the workout bar does: on minimizing the
  // run, and when a run comes back after a relaunch
  const visible = active && !screenOpen;
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      entranceAnim.setValue(0);
      Animated.spring(entranceAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      }).start();
    }
    wasVisible.current = visible;
  }, [visible]);

  if (!visible) return null;

  const elapsed = runElapsedSeconds(timing.base, timing.segmentStart, Date.now());
  const distance = toDisplayDistance(run.distanceKm, unit).toFixed(2);
  const paused = trackingState === 'paused';

  const resume = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DashboardTab', { screen: 'GPSCardio', initial: false });
    }
  };

  const discard = () => Alert.alert(
    'Discard this activity?',
    "Its route and stats will be deleted and can't be recovered.",
    [
      { text: 'Keep It', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: clearRun },
    ],
  );

  return (
    <Animated.View style={{
      opacity: entranceAnim,
      transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={resume}
        style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={recovered ? `Unsaved ${activity}. Review` : `${activity} in progress. Open`}
      >
        <View style={styles.left}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {recovered ? `Unsaved ${activity}` : paused ? `${activity} paused` : activity}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {`${distance} ${unit} · ${fmtElapsed(elapsed)}`}
          </Text>
        </View>
        <View style={[styles.btn, { backgroundColor: colors.accent }]}>
          <Ionicons name={recovered ? 'play' : 'chevron-up'} size={14} color={colors.accentText} />
          <Text style={[styles.btnText, { color: colors.accentText }]}>{recovered ? 'Review' : 'Open'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.btn, { borderWidth: 1, borderColor: colors.border }]}
          onPress={discard}
          accessibilityRole="button"
          accessibilityLabel="Discard activity"
        >
          <Ionicons name="trash-outline" size={14} color={colors.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  left: { flex: 1, justifyContent: 'center' },
  name: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 1 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  btnText: { fontSize: 13, fontWeight: '600' },
});
