import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  Alert, ActivityIndicator, ScrollView, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// react-native-maps requires a development build — not available in Expo Go.
let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;
const MAPS_AVAILABLE = MapView !== null && Polyline !== null;
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import { enqueueWorkout } from '../../utils/offlineQueue';
import { getExerciseCache, setExerciseCache } from '../../utils/exerciseCache';
import { showToast } from '../../utils/toast';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { DashboardStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { estimateCalories } from '../../utils/cardioCalories';
import { fmtPaceValue } from '../../utils/cardioFormat';
import { GPS_DISTANCE_UNIT_KEY, toDisplayDistance, toDisplayPace } from '../../utils/units';
import {
  currentPaceMinPerKm, isCycling, speedInUnit, speedLabel, MIN_PACE_DISTANCE_KM,
} from '../../utils/gpsMetrics';
import {
  ACTIVITIES, ACTIVITY_TEMPLATE_NAME, buildGpsRunBody, runElapsedSeconds, type Activity,
} from '../../utils/gpsRun';
import { useGpsRun } from '../../context/GpsRunContext';
import { useAppActive } from '../../hooks/useAppActive';
import { splitAtGaps, thinSegments } from '../../utils/routeSegments';
import { alertWorkoutInProgress } from '../../utils/sessionConflict';


type Props = NativeStackScreenProps<DashboardStackParamsList, 'GPSCardio'>;

async function resolveCardioTemplateId(
  activity: Activity,
  userId?: number | string | null,
): Promise<number | null> {
  const templateName = ACTIVITY_TEMPLATE_NAME[activity];
  const findMatch = (list: any[]) =>
    list.find(ex => ex.name === templateName && ex.exercise_type === 'cardio' && !ex.equipment);

  const cached = await getExerciseCache(userId);
  if (cached) {
    const found = findMatch(cached);
    if (found) return found.id;
  }

  try {
    const res = await apiFetch('/api/exercises');
    if (res.ok) {
      const data = await res.json();
      setExerciseCache(data, userId);
      const found = findMatch(data);
      if (found) return found.id;
    }
  } catch {
    // offline — fall through to null, workout still saves without PR tracking
  }

  return null;
}

function fmtElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function GPSCardioScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The run itself (location, timer, checkpoint) lives in GpsRunContext so it
  // keeps going when this screen is left. This screen only shows and controls it.
  const {
    activity, setActivity, trackingState, run, timing,
    start, pause, resume, stop, clearRun, setScreenOpen, recovered,
  } = useGpsRun();
  // The mini bar stands in for this screen when it is left, so it hides while this shows
  useEffect(() => {
    setScreenOpen(true);
    return () => setScreenOpen(false);
  }, []);
  const { coords, distanceKm, elevationGainM } = run;
  // With the phone locked on this screen the run keeps recording in GpsRunProvider,
  // but nothing here needs to move: re-rendering the map every second and on
  // every fix while locked is the kind of background work iOS ends apps for
  // (TODO.md section 22). It all catches up the moment the app is back.
  const appActive = useAppActive();
  // The clock is a timestamp sum; this just re-renders each second while running
  const [, setTick] = useState(0);
  useEffect(() => {
    if (trackingState !== 'running' || !appActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [trackingState, appActive]);
  const elapsedSec = runElapsedSeconds(timing.base, timing.segmentStart, Date.now());
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [initialRegion, setInitialRegion] = useState<{
    latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
  } | undefined>(() => {
    // Reopened on a run in progress: start where it is
    const last = coords[coords.length - 1];
    return last ? { latitude: last.latitude, longitude: last.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined;
  });
  // Mounting MapView and firing off location-permission/GPS native calls
  // immediately competes with the tab bar's slide-out animation for native
  // rendering resources, cutting it short instead of letting it glide — wait
  // until the screen-transition interaction queue clears first.
  const [ready, setReady] = useState(false);

  const mapRef = useRef<any>(null);

  const displayDistance = toDisplayDistance(distanceKm, distanceUnit);
  // Nothing until there's enough distance: the first few meters gave paces like 99:59
  const hasPace = distanceKm >= MIN_PACE_DISTANCE_KM;
  const pace = hasPace ? elapsedSec / 60 / displayDistance : 0;
  // Rides read speed, the rest pace; "current" is roughly the last 30 seconds
  const cycling = isCycling(activity);
  const rateUnit = cycling ? speedLabel(distanceUnit) : `/${distanceUnit}`;
  const avgRateText = cycling
    ? (hasPace ? speedInUnit(distanceKm, elapsedSec / 60, distanceUnit).toFixed(1) : '--')
    : fmtPaceValue(pace);
  const currentPaceKm = trackingState === 'running' ? currentPaceMinPerKm(coords) : null;
  const currentRateText = currentPaceKm == null
    ? (cycling ? '--' : '--:--')
    : cycling
      ? (60 / toDisplayPace(currentPaceKm, distanceUnit)).toFixed(1)
      : fmtPaceValue(toDisplayPace(currentPaceKm, distanceUnit));

  // Follows the run on the map as fixes arrive, and jumps to where it is on return
  useEffect(() => {
    const last = coords[coords.length - 1];
    if (!last || trackingState !== 'running' || !appActive) return;
    mapRef.current?.animateToRegion({
      latitude: last.latitude,
      longitude: last.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  }, [coords, appActive]);

  // A tracked route can't be re-walked, so deleting one always asks twice
  const confirmDiscard = (onDiscard: () => void) => {
    Alert.alert(
      'Discard this activity?',
      "Its route and stats will be deleted and can't be recovered.",
      [
        { text: 'Keep It', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ],
    );
  };

  // A run brought back after the app was killed is finished: straight to the
  // save sheet, since on the paused screen it reads as already saved
  useEffect(() => {
    if (!recovered || trackingState !== 'paused') return;
    setWorkoutName(activity);
    setConfirmVisible(true);
  }, [recovered]);

  useEffect(() => {
    // Deferred until the screen-transition interaction queue clears — see
    // the `ready` declaration above for why.
    const task = InteractionManager.runAfterInteractions(() => {
      AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user?.id}`).then(v => {
        setDistanceUnit(v === 'km' ? 'km' : 'mi');
      });
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setInitialRegion(prev => prev ?? {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      })();
      setReady(true);
    });
    // Leaving the screen leaves the run going: that is minimizing it
    return () => task.cancel();
  }, []);

  const handleStart = async () => {
    const result = await start();
    if (result === 'denied') {
      Alert.alert('Permission needed', 'Location access is required to track your activity.');
    } else if (result === 'workout-active') {
      alertWorkoutInProgress({ beforeGo: () => navigation.goBack() });
    }
  };

  const handleStop = () => {
    stop();
    setWorkoutName(activity);
    setConfirmVisible(true);
  };

  // Stop is the end: it goes on to saving, and the run can't be picked back up.
  // Pause is the break, so say which this is.
  const confirmStop = () => {
    Alert.alert(
      'End this activity?',
      "Stopping ends the activity and takes you to save it. You won't be able to resume it. To take a break, use Pause.",
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'End Activity', style: 'destructive', onPress: handleStop },
      ],
    );
  };

  // Hides the mini bar's stand-in early: the bar belongs from the moment the map
  // starts sliding away, not after it has gone
  const leaveScreen = () => {
    setScreenOpen(false);
    navigation.goBack();
  };

  const handleDiscard = () => {
    setConfirmVisible(false);
    clearRun();
  };

  const handleSave = async () => {
    setSaving(true);
    const exerciseTemplateId = await resolveCardioTemplateId(activity, user?.id);
    const body = buildGpsRunBody({
      activity, workoutName, elapsedSec, distanceKm, distanceUnit, elevationGainM, coords,
      exerciseTemplateId, now: new Date(),
    });

    // A tracked run must never depend on one POST succeeding — queue it for
    // sync when there's no connection. CardioDetails needs a server id, so
    // offline saves return to the Dashboard instead.
    const saveOffline = async () => {
      await enqueueWorkout(body);
      clearRun();
      setConfirmVisible(false);
      showToast(
        "It's stored on this phone and will upload automatically when you're back online. It won't show in your history until then.",
        { title: 'Activity saved offline', icon: 'cloud-offline-outline', tone: 'warning', durationMs: 6500 },
      );
      navigation.goBack();
    };

    try {
      const net = await NetInfo.fetch();
      const online = net.isConnected && net.isInternetReachable !== false;
      if (!online) {
        await saveOffline();
        return;
      }

      const res = await apiFetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      clearRun();
      setConfirmVisible(false);
      navigation.replace('CardioDetails', { workoutId: data.id });
    } catch {
      // NetInfo said online but the request still died (flaky signal) —
      // offer the queue instead of a dead-end retry loop
      Alert.alert(
        'Save Failed',
        "Couldn't reach the server. Save this activity offline and sync later?",
        [
          { text: 'Try Again', style: 'cancel' },
          { text: 'Save Offline', onPress: () => { saveOffline(); } },
        ],
      );
    } finally {
      setSaving(false);
    }
  };

  const weightKg = useMemo(() => {
    if (!user) return 70;
    const bw = (user as any).bodyweight ?? 70;
    return (user as any).weight_unit === 'lbs' ? bw / 2.205 : bw;
  }, [user]);

  const speedKmH = elapsedSec > 0 ? distanceKm / (elapsedSec / 3600) : 0;
  const estimatedKcal = Math.round(estimateCalories(activity, elapsedSec / 60, weightKg, speedKmH));

  // Map rendering only needs a bounded number of vertices — a long run can
  // accumulate thousands of raw GPS points, and react-native-maps rebuilds
  // the entire native Polyline overlay on every coordinate change, so an
  // ever-growing array here is a real (and growing) memory cost over the
  // course of a tracked activity. `coords` itself stays full-resolution for
  // distance/elevation math, checkpointing, and the saved route_polyline.
  // In segments: a pause or a stretch with no GPS leaves a gap rather than a straight line
  const displaySegments = useMemo(() => thinSegments(splitAtGaps(coords)), [coords]);
  // The line on the map holds still in the background: the same array means the
  // native overlay isn't rebuilt
  const mapSegmentsRef = useRef(displaySegments);
  if (appActive) mapSegmentsRef.current = displaySegments;
  const mapSegments = mapSegmentsRef.current;

  if (!MAPS_AVAILABLE) {
    return (
      <View style={[styles.container, styles.unavailable]}>
        <Ionicons name="map-outline" size={48} color={colors.textSecondary} />
        <Text style={styles.unavailableTitle}>GPS Tracking Unavailable</Text>
        <Text style={styles.unavailableBody}>
          GPS tracking requires a development build.{'\n'}Run with{' '}
          <Text style={styles.unavailableCode}>npx expo run:ios</Text> or{' '}
          <Text style={styles.unavailableCode}>npx expo run:android</Text> to enable it.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.unavailableBack}>
          <Text style={styles.unavailableBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map — deferred until `ready` (see the mount effect) so mounting the
          native map surface doesn't compete with the tab bar's slide-out
          transition and cut it short. */}
      {ready ? (
        <MapErrorBoundary
          fallback={
            <View style={[styles.map, styles.mapFallback]}>
              <Ionicons name="map-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.mapFallbackTitle, { color: colors.textPrimary }]}>Map unavailable</Text>
              <Text style={[styles.mapFallbackSub, { color: colors.textSecondary }]}>
                GPS tracking still works. A Google Maps API key is required to show the map on Android.
              </Text>
            </View>
          }
        >
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation={appActive}
            followsUserLocation={trackingState === 'running' && appActive}
          >
            {mapSegments.filter(seg => seg.length >= 2).map((seg, i) => (
              <Polyline key={i} coordinates={seg} strokeColor={colors.accent} strokeWidth={4} />
            ))}
          </MapView>
        </MapErrorBoundary>
      ) : (
        <View style={styles.map} />
      )}

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + spacing.sm }]}
        onPress={leaveScreen}
        accessibilityRole="button"
        accessibilityLabel={trackingState === 'idle' ? 'Close' : 'Minimize'}
      >
        {/* Down, like the workout log's minimize: the screen slides down out of the way */}
        <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: colors.surface }]}>
        {trackingState === 'idle' && (
          <>
            <View style={styles.activityRow}>
              {ACTIVITIES.map(a => (
                <TouchableOpacity
                  key={a}
                  style={[styles.activityChip, activity === a && { backgroundColor: colors.accent }]}
                  onPress={() => setActivity(a)}
                >
                  <Text style={[styles.activityChipText, activity === a && { color: colors.accentText }]}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.save }]} onPress={handleStart}>
              <Ionicons name="play" size={28} color={colors.accentText} />
              <Text style={styles.mainBtnText}>Start</Text>
            </TouchableOpacity>
          </>
        )}

        {trackingState === 'running' && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{fmtElapsed(elapsedSec)}</Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{displayDistance.toFixed(2)}</Text>
                <Text style={styles.statLabel}>{distanceUnit}</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{currentRateText}</Text>
                <Text style={styles.statLabel}>now {rateUnit}</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{avgRateText}</Text>
                <Text style={styles.statLabel}>avg {rateUnit}</Text>
              </View>
            </View>
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.border }]} onPress={pause}>
                <Ionicons name="pause" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.danger }]} onPress={confirmStop}>
                <Ionicons name="stop" size={28} color={colors.accentText} />
                <Text style={styles.mainBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {trackingState === 'paused' && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{fmtElapsed(elapsedSec)}</Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{displayDistance.toFixed(2)}</Text>
                <Text style={styles.statLabel}>{distanceUnit}</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{avgRateText}</Text>
                <Text style={styles.statLabel}>avg {rateUnit}</Text>
              </View>
            </View>
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.border }]} onPress={resume}>
                <Ionicons name="play" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.danger }]} onPress={confirmStop}>
                <Ionicons name="stop" size={28} color={colors.accentText} />
                <Text style={styles.mainBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </View>

      {/* Confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Save Activity?</Text>

            <TextInput
              style={[styles.modalNameInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={workoutName}
              onChangeText={setWorkoutName}
              placeholder="Activity name"
              placeholderTextColor={colors.placeholder}
            />

            <View style={styles.modalStats}>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{fmtElapsed(elapsedSec)}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Duration</Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{displayDistance.toFixed(2)} {distanceUnit}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Distance</Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{avgRateText} {rateUnit}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>{cycling ? 'Avg Speed' : 'Avg Pace'}</Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>~{estimatedKcal} kcal</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Est. Calories</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ paddingBottom: spacing.xs }}>
              {coords.length >= 2 && (
                <MapView
                  style={styles.modalMap}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  initialRegion={{
                    latitude: coords[0].latitude,
                    longitude: coords[0].longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  {displaySegments.filter(seg => seg.length >= 2).map((seg, i) => (
                    <Polyline key={i} coordinates={seg} strokeColor={colors.accent} strokeWidth={3} />
                  ))}
                </MapView>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.border }]} onPress={() => confirmDiscard(handleDiscard)}>
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.save }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.accentText} size="small" />
                  : <Text style={[styles.modalBtnText, { color: colors.accentText }]}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  unavailable: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  unavailableTitle: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' },
  unavailableBody: { color: colors.textSecondary, fontSize: typography.fontSize.sm, textAlign: 'center', paddingHorizontal: spacing.xl },
  unavailableCode: { fontWeight: '600' },
  unavailableBack: { marginTop: spacing.sm },
  unavailableBackText: { color: colors.accent, fontWeight: '600' },
  container: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  mapFallback: { justifyContent: 'center', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: colors.background },
  mapFallbackTitle: { fontSize: typography.fontSize.md, fontWeight: '700' },
  mapFallbackSub: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: 20 },

  activityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  activityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700' },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statSep: { width: 1, height: 40, backgroundColor: colors.border },

  controls: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 50,
    minWidth: 160,
  },
  mainBtnText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
  runningBtns: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 50,
  },
  secondaryBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', textAlign: 'center' },
  modalNameInput: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  modalStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalStatItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  modalStatValue: { fontSize: 18, fontWeight: '700' },
  modalStatLabel: { fontSize: typography.fontSize.xs, marginTop: 2 },
  modalMap: { width: '100%', height: 120, borderRadius: radius.md, overflow: 'hidden' },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: typography.fontSize.md, fontWeight: '700' },
});
