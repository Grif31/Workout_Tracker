import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  ScrollView, Dimensions, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import polylineLib from '@mapbox/polyline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';
import { estimateCalories } from '../../utils/cardioCalories';
import { fmtDuration, fmtPace } from '../../utils/cardioFormat';
import { captureAndShare } from '../../utils/shareCapture';
import CardioShareCard from '../../components/share/CardioShareCard';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { DashboardStackParamsList } from '../../navigation/types';

let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;

const MAP_HEIGHT = Dimensions.get('window').height * 0.65;

type Props = NativeStackScreenProps<DashboardStackParamsList, 'CardioDetails'>;

type Coord = { latitude: number; longitude: number };

interface CardioSet {
  cardio_duration: string | number | null;
  distance: string | number | null;
  distance_unit: 'km' | 'mi' | null;
  elevation_gain: string | number | null;
}

interface CardioExercise {
  name: string;
  exercise_type: string;
  route_polyline: string | null;
  sets: CardioSet[];
}

interface CardioWorkout {
  id: number;
  name: string;
  date: string | null;
  notes: string | null;
  exercises: CardioExercise[];
}


export default function CardioDetailsScreen({ navigation, route }: Props) {
  const { workoutId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { showActionSheetWithOptions } = useActionSheet();

  const [workout, setWorkout] = useState<CardioWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const shareCardRef = useRef<View>(null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');

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

  const { exercise, coords, mapRegion, durationMin, distanceKm, elevationGainM, calories } = useMemo(() => {
    if (!workout) return { exercise: null, coords: [], mapRegion: null, durationMin: 0, distanceKm: 0, elevationGainM: null, calories: 0 };

    const ex = workout.exercises?.[0] ?? null;
    const set = ex?.sets?.[0] ?? null;

    const dur = Number(set?.cardio_duration) || 0;
    const dist = Number(set?.distance) || 0;
    const elev = set?.elevation_gain != null ? Number(set.elevation_gain) : null;
    const speedKmH = dur > 0 && dist > 0 ? dist / (dur / 60) : 0;
    const kcal = estimateCalories(ex?.name ?? '', dur, weightKg, speedKmH);

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

    return { exercise: ex, coords: decodedCoords, mapRegion: region, durationMin: dur, distanceKm: dist, elevationGainM: elev, calories: kcal };
  }, [workout, weightKg]);

  const handleRename = async () => {
    const name = renameText.trim();
    if (!name) return;
    try {
      const res = await apiFetch(`/api/workouts/${workoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutName: name }),
      });
      if (!res.ok) {
        Alert.alert('Error', 'Failed to rename activity');
        return;
      }
      setWorkout(prev => prev ? { ...prev, name } : prev);
      setRenameVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to rename activity');
    }
  };

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

  const showOptions = () => {
    showActionSheetWithOptions(
      { options: ['Rename Activity', 'Delete Activity', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (index) => {
        if (index === 0) { setRenameText(workout?.name ?? ''); setRenameVisible(true); }
        else if (index === 1) handleDelete();
      },
    );
  };

  const handleShare = async () => {
    try {
      await captureAndShare(shareCardRef);
    } catch {
      // user cancelled or capture failed — no-op
    }
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
  const dateStr = workout.date
    ? new Date(workout.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      {/* Off-screen share card (captured by handleShare) */}
      <View
        ref={shareCardRef}
        style={{ position: 'absolute', left: -9999, top: -9999 }}
        collapsable={false}
      >
        <CardioShareCard
          activityName={workout.name || activityName}
          date={workout.date
            ? new Date(workout.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : ''}
          distance={distanceKm}
          distanceUnit={distanceUnit}
          durationMin={durationMin}
          elevationM={elevationGainM}
          coords={coords}
          accentColor={colors.accent}
        />
      </View>

      {/* Map area — explicit height so MapView doesn't overflow */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
        {MapView && mapRegion ? (
          <MapView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} initialRegion={mapRegion} scrollEnabled={false} zoomEnabled={false}>
            {coords.length >= 2 && Polyline && (
              <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.mapPlaceholderText, { color: colors.textSecondary }]}>
              {coords.length < 2 ? 'No route recorded' : 'Map unavailable'}
            </Text>
          </View>
        )}

        {/* Back button */}
        <TouchableOpacity
          style={[styles.overlayBtn, { top: insets.top + spacing.sm, left: spacing.md }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* More options */}
        <TouchableOpacity
          style={[styles.overlayBtn, { top: insets.top + spacing.sm, right: spacing.md }]}
          onPress={showOptions}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={[styles.overlayBtn, { top: insets.top + spacing.sm, right: spacing.md + 48 }]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Activity badge */}
        <View style={[styles.activityBadge, { top: insets.top + spacing.sm }]}>
          <Text style={styles.activityBadgeText}>{activityName}</Text>
        </View>
      </View>

      {/* Details panel */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.workoutTitle}>{workout.name || activityName}</Text>
        <Text style={styles.dateText}>{dateStr}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{durationMin > 0 ? fmtDuration(durationMin) : '--'}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{distanceKm > 0 ? distanceKm.toFixed(2) : '--'}</Text>
            <Text style={styles.statLabel}>{distanceUnit}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{fmtPace(durationMin, distanceKm)}</Text>
            <Text style={styles.statLabel}>/{distanceUnit} pace</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{calories > 0 ? `~${calories}` : '--'}</Text>
            <Text style={styles.statLabel}>kcal</Text>
          </View>
        </View>

        {elevationGainM != null && elevationGainM > 0 && (
          <View style={styles.elevationRow}>
            <Ionicons name="trending-up" size={16} color={colors.textSecondary} />
            <Text style={styles.elevationText}>
              {distanceUnit === 'mi'
                ? `${Math.round(elevationGainM * 3.28084)} ft elevation gain`
                : `${Math.round(elevationGainM)} m elevation gain`}
            </Text>
          </View>
        )}

        {!!workout.notes && (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{workout.notes}</Text>
          </View>
        )}
      </ScrollView>

      {/* Rename modal */}
      <Modal visible={renameVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Rename Activity</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              placeholder="Activity name"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.renameActions}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setRenameVisible(false)}>
                <Text style={[styles.renameBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.renameSaveBtn, { backgroundColor: colors.accent }]} onPress={handleRename}>
                <Text style={[styles.renameBtnText, { color: colors.accentText }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  mapContainer: { position: 'relative', overflow: 'hidden' },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mapPlaceholderText: { fontSize: typography.fontSize.sm },

  overlayBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activityBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.accentText,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  panel: { flex: 1 },
  panelContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  workoutTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  dateText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '500' },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  statValue: { fontSize: typography.fontSize.xxl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },

  elevationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  elevationText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  notesLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  notesText: { fontSize: typography.fontSize.sm, color: colors.textPrimary, lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  renameCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  renameTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  renameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  renameCancelBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  renameSaveBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  renameBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
});
