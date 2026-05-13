import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import MuscleDiagram from '../../components/MuscleDiagram';
import { DashboardStackParamsList } from '../../navigation/types';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutSummary'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SetData = { id: number; reps?: number; weight?: number; set_type: string; cardio_duration?: number; distance?: number };
type ExerciseData = { id: number; name: string; sets: SetData[] };

export default function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { workoutId, workoutName, prs, totalVolume, totalReps, totalSets, muscles, isFirstWorkout } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const weightUnit = user?.weight_unit ?? 'lbs';
  const confettiRef = useRef<ConfettiCannon>(null);

  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [prExpanded, setPrExpanded] = useState(false);

  const filteredPrs = prs.filter(pr => pr.pr_type !== 'estimated_1rm');

  useEffect(() => {
    apiFetch(`/api/workouts/${workoutId}`)
      .then(r => r.json())
      .then(data => setExercises(data.exercises ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workoutId]);

  useEffect(() => {
    if (isFirstWorkout) {
      setTimeout(() => confettiRef.current?.start(), 300);
    }
    if (filteredPrs.length > 0) {
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);
    }
  }, []);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
    closeBtn: { padding: 8 },
    closeText: { fontSize: 22, color: colors.textSecondary },
    hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20 },
    trophy: { fontSize: 48, marginBottom: 8 },
    headline: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    subline: { fontSize: 15, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    section: { paddingHorizontal: 20, marginBottom: 20 },
    prDropdownHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD700', borderRadius: 10, padding: 12, marginBottom: 8 },
    prBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3C4', borderRadius: 10, padding: 12, marginBottom: 8 },
    prIcon: { fontSize: 18, marginRight: 8 },
    prText: { fontSize: 14, fontWeight: '600', color: '#000', flex: 1 },
    prChevron: { fontSize: 13, color: '#7A5800', marginLeft: 4 },
    statsRow: { flexDirection: 'row', gap: 10 },
    statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 14, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    diagramCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, alignItems: 'center' },
    diagramTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
    exCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
    exName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
    setBadge: { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    setBadgeText: { fontSize: 12, color: colors.textSecondary },
    detailsBtn: { backgroundColor: colors.accent, borderRadius: 12, margin: 20, marginTop: 4, padding: 16, alignItems: 'center' },
    detailsBtnText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
  });

  function goToDetails() {
    navigation.replace('WorkoutDetails', { workoutId });
  }

  function formatSet(set: SetData) {
    if (set.cardio_duration) {
      const parts = [];
      if (set.cardio_duration) parts.push(`${set.cardio_duration}min`);
      if (set.distance) parts.push(`${set.distance}km`);
      return parts.join(' · ') || '—';
    }
    if (set.reps && set.weight) return `${set.reps} × ${set.weight}${weightUnit}`;
    if (set.reps) return `${set.reps} reps`;
    return '—';
  }

  return (
    <View style={s.container}>
      {isFirstWorkout && (
        <ConfettiCannon
          ref={confettiRef}
          count={200}
          origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
          fadeOut
          autoStart={false}
        />
      )}

      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.navigate('DashboardHome')}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={s.hero}>
          <Text style={s.trophy}>🏆</Text>
          <Text style={s.headline}>
            {isFirstWorkout ? 'Your first workout — incredible!' : 'Great workout!'}
          </Text>
          <Text style={s.subline}>"{workoutName}"</Text>
        </Animated.View>

        {filteredPrs.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
            {filteredPrs.length === 1 ? (
              <View style={s.prDropdownHeader}>
                <Text style={s.prIcon}>🥇</Text>
                <Text style={s.prText}>
                  {filteredPrs[0].exercise_name} — new {filteredPrs[0].pr_type.replace(/_/g, ' ')} PR!
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.prDropdownHeader}
                  onPress={() => setPrExpanded(v => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={s.prIcon}>🥇</Text>
                  <Text style={s.prText}>
                    {filteredPrs.length} Personal Records
                  </Text>
                  <Text style={s.prChevron}>{prExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {prExpanded && filteredPrs.map((pr, i) => (
                  <View key={i} style={s.prBanner}>
                    <Text style={s.prIcon}>🥇</Text>
                    <Text style={s.prText}>
                      {pr.exercise_name} — new {pr.pr_type.replace(/_/g, ' ')} PR!
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={s.section}>
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{totalVolume.toLocaleString()}</Text>
              <Text style={s.statLabel}>Volume ({weightUnit})</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{totalSets}</Text>
              <Text style={s.statLabel}>Sets</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{totalReps}</Text>
              <Text style={s.statLabel}>Reps</Text>
            </View>
          </View>
        </Animated.View>

        {muscles.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={s.section}>
            <View style={s.diagramCard}>
              <Text style={s.diagramTitle}>Muscles Worked</Text>
              <MuscleDiagram muscles={muscles} />
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={s.section}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            exercises.map(ex => (
              <View key={ex.id} style={s.exCard}>
                <Text style={s.exName}>{ex.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ex.sets.map((set, i) => (
                    <View key={i} style={s.setBadge}>
                      <Text style={s.setBadgeText}>{formatSet(set)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(400)}>
          <TouchableOpacity style={s.detailsBtn} onPress={goToDetails}>
            <Text style={s.detailsBtnText}>View Full Details</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
