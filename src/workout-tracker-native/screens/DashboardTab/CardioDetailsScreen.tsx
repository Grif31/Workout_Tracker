import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import polylineLib from '@mapbox/polyline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';
import { estimateCalories } from '../../utils/cardioCalories';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { DashboardStackParamsList } from '../../navigation/types';

let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;

type Props = NativeStackScreenProps<DashboardStackParamsList, 'CardioDetails'>;

type Coord = { latitude: number; longitude: number };

const ACTIVITY_ICONS: Record<string, string> = {
  Run: '🏃', Cycle: '🚴', Walk: '🚶', Hike: '🥾',
};

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.round((minutes % 1) * 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtPace(durationMin: number, distanceKm: number): string {
  if (distanceKm <= 0) return '--:--';
  const paceMinPerKm = durationMin / distanceKm;
  const m = Math.floor(paceMinPerKm);
  const s = Math.round((paceMinPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CardioDetailsScreen({ navigation, route }: Props) {
  const { workoutId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');

  useEffect(() => {
    AsyncStorage.getItem('gps_distance_unit').then(v => {
      if (v === 'mi') setDistanceUnit('mi');
    });
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    apiFetch(`/api/workouts/${workoutId}`)
      .then(r => r.json())
      .then(data => { setWorkout(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [workoutId]));

  const weightKg = useMemo(() => {
    if (!user) return 70;
    const bw = (user as any).bodyweight ?? 70;
    return (user as any).weight_unit === 'lbs' ? bw / 2.205 : bw;
  }, [user]);

  const { exercise, coords, mapRegion, durationMin, distanceKm, calories } = useMemo(() => {
    if (!workout) return { exercise: null, coords: [], mapRegion: null, durationMin: 0, distanceKm: 0, calories: 0 };

    const ex = workout.exercises?.[0] ?? null;
    const set = ex?.sets?.[0] ?? null;

    const dur = parseFloat(set?.cardio_duration) || 0;
    const dist = parseFloat(set?.distance) || 0;
    const kcal = estimateCalories(ex?.name ?? '', dur, weightKg);

    let decodedCoords: Coord[] = [];
    let region = null;
    if (ex?.route_polyline) {
      try {
        decodedCoords = polylineLib.decode(ex.route_polyline).map(([lat, lng]: [number, number]) => ({
          latitude: lat, longitude: lng,
        }));
        if (decodedCoords.length >= 2) {
          const lats = decodedCoords.map(c => c.latitude);
          const lngs = decodedCoords.map(c => c.longitude);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
          const pad = 0.002;
          region = {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max(maxLat - minLat + pad, 0.005),
            longitudeDelta: Math.max(maxLng - minLng + pad, 0.005),
          };
        }
      } catch {}
    }

    return { exercise: ex, coords: decodedCoords, mapRegion: region, durationMin: dur, distanceKm: dist, calories: kcal };
  }, [workout, weightKg]);

  const handleDelete = () => {
    Alert.alert('Delete Activity', 'This activity will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await apiFetch(`/api/workouts/${workoutId}`, { method: 'DELETE' });
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: spacing.md }]}>
        <Text style={{ color: colors.textPrimary }}>Activity not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.accent }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activityName = exercise?.name ?? workout.name ?? 'Activity';
  const activityIcon = ACTIVITY_ICONS[activityName] ?? '🏃';
  const dateStr = workout.date
    ? new Date(workout.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      {/* Map area */}
      <View style={styles.mapContainer}>
        {MapView && mapRegion ? (
          <MapView style={styles.map} initialRegion={mapRegion} scrollEnabled={false} zoomEnabled={false}>
            {coords.length >= 2 && Polyline && (
              <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} />
            )}
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Ionicons name="map-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.mapPlaceholderText, { color: colors.textSecondary }]}>
              {coords.length < 2 ? 'No route recorded' : 'Map unavailable'}
            </Text>
          </View>
        )}

        {/* Back button */}
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + spacing.sm }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Activity badge */}
        <View style={[styles.activityBadge, { bottom: spacing.md, left: spacing.md }]}>
          <Text style={styles.activityBadgeText}>{activityIcon} {activityName}</Text>
        </View>
      </View>

      {/* Details panel */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {/* Date */}
        <Text style={styles.dateText}>{dateStr}</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{fmtDuration(durationMin)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.statLabel}>{distanceUnit}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{fmtPace(durationMin, distanceKm)}</Text>
            <Text style={styles.statLabel}>/{distanceUnit} pace</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>~{calories}</Text>
            <Text style={styles.statLabel}>kcal</Text>
          </View>
        </View>

        {/* Notes */}
        {!!workout.notes && (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{workout.notes}</Text>
          </View>
        )}

        {/* Delete */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={16} color="#e53935" />
          <Text style={styles.deleteBtnText}>Delete Activity</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  mapContainer: { flex: 55, position: 'relative' },
  map: { flex: 1 },
  mapPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mapPlaceholderText: { fontSize: typography.fontSize.sm },

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
  activityBadge: {
    position: 'absolute',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  activityBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  panel: { flex: 45 },
  panelContent: {
    padding: spacing.md,
    gap: spacing.md,
  },

  dateText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  notesLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  notesText: { fontSize: typography.fontSize.sm, color: colors.textPrimary, lineHeight: 20 },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteBtnText: { fontSize: typography.fontSize.sm, color: '#e53935', fontWeight: '600' },
});
