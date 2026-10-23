import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  Alert, ActivityIndicator, ScrollView, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

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
import { SAVE_TIMEOUT_MS, apiFetch } from '../../utils/api';
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
  currentSpeedKmh, isCycling, speedInUnit, speedLabel, MIN_PACE_DISTANCE_KM,
} from '../../utils/gpsMetrics';
import {
  ACTIVITIES, ACTIVITY_TEMPLATE_NAME, HEALTH_ACTIVITY, buildGpsRunBody, fmtClock, isAutoPaused, movingSeconds,
  runElapsedSeconds, runWindow, type Activity,
} from '../../utils/gpsRun';
import { GPS_KEEP_SCREEN_ON_KEY } from '../../constants/storageKeys';
import HoldButton from '../../components/HoldButton';
import { syncFinishedWorkout } from '../../utils/healthSync';
import { useGpsRun } from '../../context/GpsRunContext';
import { useAppActive } from '../../hooks/useAppActive';
import { splitAtGaps, thinSegments } from '../../utils/routeSegments';
import { alertWorkoutInProgress } from '../../utils/sessionConflict';


type Props = NativeStackScreenProps<DashboardStackParamsList, 'GPSCardio'>;

// Its own tag, so the screen's keep-awake and the provider's foreground-only
// fallback (default tag) can't switch each other off
const KEEP_AWAKE_TAG = 'gps-map-screen';
// A stretch of stops this long before the moving and elapsed clocks are both worth showing
const ELAPSED_SHOWN_AFTER_SEC = 5;

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
    start, pause, resume, stop, clearRun, setScreenOpen, recovered, clientId, stopBelowKmh,
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
  const now = Date.now();
  const elapsedSec = runElapsedSeconds(timing.base, timing.segmentStart, now);
  // Speed, pace, calories and the save all go by moving time; with auto-pause
  // off it is the elapsed time
  const movingSec = movingSeconds(run, timing, now, stopBelowKmh);
  const autoPaused = trackingState === 'running' && isAutoPaused(run, timing, now, stopBelowKmh);
  const showElapsed = elapsedSec - movingSec >= ELAPSED_SHOWN_AFTER_SEC;
  const [keepScreenOn, setKeepScreenOn] = useState(false);
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
  const pace = hasPace && movingSec > 0 ? movingSec / 60 / displayDistance : 0;
  // Rides read speed, the rest pace. "Now" is the GPS's own speed reading
  // (utils/gpsMetrics.currentSpeedKmh), nothing while stopped.
  const cycling = isCycling(activity);
  const rateUnit = cycling ? speedLabel(distanceUnit) : `/${distanceUnit}`;
  const avgRateText = cycling
    ? (hasPace && movingSec > 0 ? speedInUnit(distanceKm, movingSec / 60, distanceUnit).toFixed(1) : '--')
    : fmtPaceValue(pace);
  const currentKmh = trackingState === 'running' && !autoPaused ? currentSpeedKmh(coords, now) : null;
  const currentRateText = currentKmh == null || currentKmh <= 0
    ? (cycling ? (autoPaused ? '0.0' : '--') : '--:--')
    : cycling
      ? toDisplayDistance(currentKmh, distanceUnit).toFixed(1)
      : fmtPaceValue(toDisplayPace(60 / currentKmh, distanceUnit));
  const maxSpeedText = run.maxSpeedKmh > 0 ? toDisplayDistance(run.maxSpeedKmh, distanceUnit).toFixed(1) : '--';

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
      AsyncStorage.getItem(`${GPS_KEEP_SCREEN_ON_KEY}_${user?.id}`).then(v => setKeepScreenOn(v === 'true')).catch(() => {});
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

  // For a phone on a mount: the map stays readable while the activity runs.
  // Off with pause, stop and leaving the screen, so it never drains a pocket.
  useEffect(() => {
    if (!keepScreenOn || trackingState !== 'running') return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG); };
  }, [keepScreenOn, trackingState]);

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

  // Only for a run brought back after the app was killed: its GPS stopped with
  // the app, and this picks it back up. The time between is a gap, so the route
  // starts a new segment there (resume -> afterGap) rather than a straight line,
  // and no distance or time is counted across it. A run ended with Stop stays
  // ended: Stop already asked.
  const keepRecording = async () => {
    setConfirmVisible(false);
    await resume();
  };

  const handleSave = async () => {
    setSaving(true);
    const exerciseTemplateId = await resolveCardioTemplateId(activity, user?.id);
    const body = buildGpsRunBody({
      activity, workoutName, elapsedSec, movingSec, maxSpeedKmh: run.maxSpeedKmh, distanceKm, distanceUnit,
      elevationGainM, coords, exerciseTemplateId, now: new Date(), clientId,
    });

    // Apple Health / Health Connect get the activity's kind, distance and the
    // time it actually happened, not the moment of saving
    const ranAt = runWindow(coords, elapsedSec, Date.now());
    const health = { type: 'cardio' as const, activity: HEALTH_ACTIVITY[activity], distanceKm, ...ranAt };

    // A tracked run must never depend on one POST succeeding — queue it for
    // sync when there's no connection. The summary needs a server id, so
    // offline saves (no PRs until the upload) return to the Dashboard instead.
    const saveOffline = async () => {
      await enqueueWorkout(body, {
        type: 'cardio', activity: health.activity, distanceKm,
        startedAt: ranAt.startDate.toISOString(), endedAt: ranAt.endDate.toISOString(),
      });
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
        timeoutMs: SAVE_TIMEOUT_MS,
      });

      if (res.status >= 400 && res.status < 500) {
        // A refusal, not an outage: the queue would only be refused again, so
        // keep the run here and show why
        const data = await res.json().catch(() => ({}));
        Alert.alert("Couldn't Save Activity", data.message || 'Try again in a moment.');
        return;
      }
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      syncFinishedWorkout({ ...health, userId: user?.id, workoutId: data.id });
      clearRun();
      setConfirmVisible(false);
      // The summary is where PRs are celebrated; its View Full Details opens CardioDetails
      navigation.replace('WorkoutSummary', {
        workoutId: data.id,
        workoutName: body.workoutName,
        prs: data.new_prs ?? [],
        totalVolume: 0,
        totalReps: 0,
        totalSets: 0,
        muscles: [],
        isFirstWorkout: data.is_first_workout ?? false,
        isBestVolume: false,
        isBestReps: false,
      });
    } catch {
      // NetInfo said online but the request still died (flaky signal) or the
      // server failed: offer the queue instead of a dead-end retry loop
      Alert.alert(
        'Save Failed',
        "Couldn't save to the server right now. Save this activity offline and sync later?",
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

  const speedKmH = movingSec > 0 ? distanceKm / (movingSec / 3600) : 0;
  const estimatedKcal = estimateCalories(activity, movingSec / 60, weightKg, speedKmH, elevationGainM);

  const stat = (value: string, label: string) => (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  const statsRow = (items: [string, string][]) => (
    <View style={styles.statsRow}>
      {items.map(([value, label], i) => (
        <React.Fragment key={label}>
          {i > 0 && <View style={styles.statSep} />}
          {stat(value, label)}
        </React.Fragment>
      ))}
    </View>
  );
  const timeStat: [string, string] = [fmtClock(movingSec), stopBelowKmh != null ? 'Moving' : 'Time'];
  const distanceStat: [string, string] = [displayDistance.toFixed(2), distanceUnit];
  const avgStat: [string, string] = [avgRateText, `avg ${rateUnit}`];
  // A ride's live row: its speed is the hero above it
  const rideStats: [string, string][] = [timeStat, distanceStat, avgStat, [maxSpeedText, `max ${rateUnit}`]];
  const elapsedNote = showElapsed && (
    <Text style={styles.elapsedNote}>Elapsed {fmtClock(elapsedSec)}</Text>
  );
  // On a ride the phone is likely on the bars: Stop needs holding, so a bump can't end it
  const stopButton = cycling ? (
    <HoldButton
      label="Hold to Stop"
      icon="stop"
      color={colors.danger}
      onComplete={handleStop}
      onAccessibilityActivate={confirmStop}
    />
  ) : (
    <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.danger }]} onPress={confirmStop}>
      <Ionicons name="stop" size={28} color={colors.accentText} />
      <Text style={styles.mainBtnText}>Stop</Text>
    </TouchableOpacity>
  );

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
            {autoPaused && (
              <View style={[styles.autoPausedPill, { backgroundColor: colors.background }]} accessibilityLiveRegion="polite">
                <Ionicons name="pause" size={14} color={colors.textSecondary} />
                <Text style={styles.autoPausedText}>Auto-paused</Text>
              </View>
            )}
            {cycling ? (
              <>
                <View style={styles.heroStat} accessible accessibilityLabel={`${currentRateText} ${speedLabel(distanceUnit)}`}>
                  <Text style={[styles.heroValue, autoPaused && { color: colors.textSecondary }]}>{currentRateText}</Text>
                  <Text style={styles.heroLabel}>{speedLabel(distanceUnit)}</Text>
                </View>
                {statsRow(rideStats)}
              </>
            ) : (
              statsRow([timeStat, distanceStat, [currentRateText, `now ${rateUnit}`], avgStat])
            )}
            {elapsedNote}
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, cycling && styles.secondaryBtnLarge, { backgroundColor: colors.border }]} onPress={pause}>
                <Ionicons name="pause" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Pause</Text>
              </TouchableOpacity>
              {stopButton}
            </View>
          </>
        )}

        {trackingState === 'paused' && (
          <>
            {statsRow(cycling ? rideStats : [timeStat, distanceStat, avgStat])}
            {elapsedNote}
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, cycling && styles.secondaryBtnLarge, { backgroundColor: colors.border }]} onPress={resume}>
                <Ionicons name="play" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Resume</Text>
              </TouchableOpacity>
              {stopButton}
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
              style={[styles.modalNameInput, { color: colors.textPrimary, borderColor: colors.inputBorder }]}
              value={workoutName}
              onChangeText={setWorkoutName}
              placeholder="Activity name"
              placeholderTextColor={colors.placeholder}
            />

            <View style={styles.modalStats}>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{fmtClock(movingSec)}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>
                  {showElapsed ? `Moving · ${fmtClock(elapsedSec)} elapsed` : 'Duration'}
                </Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{displayDistance.toFixed(2)} {distanceUnit}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Distance</Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{avgRateText} {rateUnit}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>{cycling ? 'Avg Speed' : 'Avg Pace'}</Text>
              </View>
              {cycling && run.maxSpeedKmh > 0 && (
                <View style={styles.modalStatItem}>
                  <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{maxSpeedText} {rateUnit}</Text>
                  <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Max Speed</Text>
                </View>
              )}
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

            {recovered && (
              <TouchableOpacity
                style={[styles.keepRecordingBtn, { borderColor: colors.accent }]}
                onPress={keepRecording}
                disabled={saving}
                accessibilityRole="button"
              >
                <Ionicons name="play" size={18} color={colors.accent} />
                <Text style={[styles.modalBtnText, { color: colors.accent }]}>Keep Recording</Text>
              </TouchableOpacity>
            )}
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
  // A ride's current speed, read at arm's length on the handlebars
  heroStat: { alignItems: 'center' },
  heroValue: {
    fontSize: typography.fontSize.xxl * 2.5,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.fontSize.xxl * 2.8,
  },
  heroLabel: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textSecondary },
  autoPausedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 50,
  },
  autoPausedText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  elapsedNote: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

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
  // Matches the hold button's height, for a gloved thumb
  secondaryBtnLarge: { minHeight: 60, paddingHorizontal: spacing.xl },
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
  keepRecordingBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
