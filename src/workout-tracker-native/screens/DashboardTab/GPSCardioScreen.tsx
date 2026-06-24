import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// react-native-maps requires a development build — not available in Expo Go.
let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;
const MAPS_AVAILABLE = MapView !== null;
import polylineLib from '@mapbox/polyline';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { DashboardStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { estimateCalories } from '../../utils/cardioCalories';


type Props = NativeStackScreenProps<DashboardStackParamsList, 'GPSCardio'>;

type Coord = { latitude: number; longitude: number; altitude: number | null };

type TrackingState = 'idle' | 'running' | 'paused';

const ACTIVITIES = ['Run', 'Cycle', 'Walk', 'Hike'] as const;
type Activity = typeof ACTIVITIES[number];

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(paceMinPerKm: number): string {
  if (!isFinite(paceMinPerKm) || paceMinPerKm <= 0) return '--:--';
  const m = Math.floor(paceMinPerKm);
  const s = Math.round((paceMinPerKm - m) * 60);
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

  const [activity, setActivity] = useState<Activity>('Run');
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [coords, setCoords] = useState<Coord[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [initialRegion, setInitialRegion] = useState<{
    latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number;
  } | undefined>(undefined);

  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<any>(null);
  const lastAltRef = useRef<number | null>(null);
  const skipNextDistanceRef = useRef(false);

  const displayDistance = distanceUnit === 'mi' ? distanceKm * 0.621371 : distanceKm;
  const pace = displayDistance > 0 ? elapsedSec / 60 / displayDistance : 0;

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
  };

  const stopLocationWatch = async () => {
    if (locationSub.current) {
      await locationSub.current.remove();
      locationSub.current = null;
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('gps_distance_unit').then(v => {
      if (v === 'mi') setDistanceUnit('mi');
    });
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setInitialRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    })();
    return () => { clearTimer(); stopLocationWatch(); };
  }, []);

  const handleStart = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access is required to track your activity.');
      return;
    }

    lastAltRef.current = null;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      loc => {
        const newCoord: Coord = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? null,
        };
        const alt = newCoord.altitude;
        if (alt !== null && lastAltRef.current !== null) {
          const delta = alt - lastAltRef.current;
          if (delta > 2) setElevationGainM(g => g + delta);
        }
        if (alt !== null) lastAltRef.current = alt;
        setCoords(prev => {
          if (prev.length > 0 && !skipNextDistanceRef.current) {
            setDistanceKm(d => d + haversineKm(prev[prev.length - 1], newCoord));
          }
          skipNextDistanceRef.current = false;
          const updated = [...prev, newCoord];
          mapRef.current?.animateToRegion({
            latitude: newCoord.latitude,
            longitude: newCoord.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }, 500);
          return updated;
        });
      },
    );
    locationSub.current = sub;
    startTimer();
    setTrackingState('running');
  };

  const handlePause = () => {
    clearTimer();
    stopLocationWatch();
    setTrackingState('paused');
  };

  const handleResume = async () => {
    lastAltRef.current = null;
    skipNextDistanceRef.current = true;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      loc => {
        const newCoord: Coord = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? null,
        };
        const alt = newCoord.altitude;
        if (alt !== null && lastAltRef.current !== null) {
          const delta = alt - lastAltRef.current;
          if (delta > 2) setElevationGainM(g => g + delta);
        }
        if (alt !== null) lastAltRef.current = alt;
        setCoords(prev => {
          if (prev.length > 0) {
            setDistanceKm(d => d + haversineKm(prev[prev.length - 1], newCoord));
          }
          return [...prev, newCoord];
        });
      },
    );
    locationSub.current = sub;
    startTimer();
    setTrackingState('running');
  };

  const handleStop = () => {
    clearTimer();
    stopLocationWatch();
    setTrackingState('paused');
    setWorkoutName(activity);
    setConfirmVisible(true);
  };

  const handleDiscard = () => {
    setConfirmVisible(false);
    setCoords([]);
    setElapsedSec(0);
    setDistanceKm(0);
    setElevationGainM(0);
    lastAltRef.current = null;
    setTrackingState('idle');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const durationMin = elapsedSec / 60;
      const encodedPolyline = coords.length >= 2
        ? polylineLib.encode(coords.map(c => [c.latitude, c.longitude]))
        : null;
      const avgPace = distanceKm > 0 ? durationMin / distanceKm : null;

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const body = {
        workoutName: workoutName.trim() || activity,
        date: dateStr,
        duration: Math.round(durationMin),
        exercises: [{
          name: activity,
          exercise_type: 'cardio',
          route_polyline: encodedPolyline,
          sets: [{
            cardio_duration: durationMin,
            distance: displayDistance,
            distance_unit: distanceUnit,
            intensity: avgPace,
            elevation_gain: elevationGainM > 0 ? Math.round(elevationGainM) : null,
            reps: null,
            weight: null,
            set_type: 'N',
          }],
        }],
      };

      const res = await apiFetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setConfirmVisible(false);
      navigation.replace('CardioDetails', { workoutId: data.id });
    } catch {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
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

  if (!MAPS_AVAILABLE) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: spacing.md }]}>
        <Ionicons name="map-outline" size={48} color={colors.textSecondary} />
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>GPS Tracking Unavailable</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          GPS tracking requires a development build.{'\n'}Run with{' '}
          <Text style={{ fontWeight: '600' }}>npx expo run:ios</Text> or{' '}
          <Text style={{ fontWeight: '600' }}>npx expo run:android</Text> to enable it.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapErrorBoundary
        fallback={
          <View style={[styles.map, styles.mapFallback]}>
            <Ionicons name="map-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.mapFallbackTitle, { color: colors.textPrimary }]}>Map unavailable</Text>
            <Text style={[styles.mapFallbackSub, { color: colors.textSecondary }]}>
              GPS tracking still works — a Google Maps API key is required to show the map on Android.
            </Text>
          </View>
        }
      >
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          followsUserLocation={trackingState === 'running'}
        >
          {coords.length >= 2 && (
            <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} />
          )}
        </MapView>
      </MapErrorBoundary>

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + spacing.sm }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
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
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{fmtPace(pace)}</Text>
                <Text style={styles.statLabel}>/{distanceUnit}</Text>
              </View>
            </View>
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.border }]} onPress={handlePause}>
                <Ionicons name="pause" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.danger }]} onPress={handleStop}>
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
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{fmtPace(pace)}</Text>
                <Text style={styles.statLabel}>/{distanceUnit}</Text>
              </View>
            </View>
            <View style={styles.runningBtns}>
              <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.border }]} onPress={handleResume}>
                <Ionicons name="play" size={22} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.danger }]} onPress={handleStop}>
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
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>{fmtPace(pace)} /{distanceUnit}</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Avg Pace</Text>
              </View>
              <View style={styles.modalStatItem}>
                <Text style={[styles.modalStatValue, { color: colors.textPrimary }]}>~{estimatedKcal} kcal</Text>
                <Text style={[styles.modalStatLabel, { color: colors.textSecondary }]}>Est. Calories</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ paddingBottom: 4 }}>
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
                  <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={3} />
                </MapView>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.border }]} onPress={handleDiscard}>
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
