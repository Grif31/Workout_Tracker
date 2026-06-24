import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ConfettiCannon from 'react-native-confetti-cannon';
import { captureAndShare } from '../../utils/shareCapture';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import ProfileAvatarFrame, { GREEK_RANK_COLORS } from '../../components/ProfileAvatarFrame';
import { GREEK_RANKS } from '../ProfileTab/GreekRankScreen';
import MuscleDiagram from '../../components/MuscleDiagram';
import WorkoutShareCard from '../../components/WorkoutShareCard';
import { LaurelBranch } from '../../components/LaurelWreath';
import { DashboardStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutSummary'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SetData = { id: number; reps?: number; weight?: number; set_type: string; cardio_duration?: number; distance?: number };
type ExerciseData = { id: number; name: string; sets: SetData[] };

export default function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { workoutId, workoutName, prs, totalVolume, totalReps, totalSets, muscles, isFirstWorkout } = route.params;
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const weightUnit = user?.weight_unit ?? 'lbs';
  const confettiRef = useRef<ConfettiCannon>(null);
  const shareCardRef = useRef<View>(null);

  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [prExpanded, setPrExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [greekRank, setGreekRank] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');

  const PR_TYPE_ORDER: Record<string, number> = { max_weight: 0, max_reps: 1, best_distance: 2, best_time: 3 };
  const filteredPrs = prs
    .filter(pr => pr.pr_type !== 'estimated_1rm')
    .sort((a, b) => {
      const typeOrder = (PR_TYPE_ORDER[a.pr_type] ?? 9) - (PR_TYPE_ORDER[b.pr_type] ?? 9);
      if (typeOrder !== 0) return typeOrder;
      return (b.value ?? 0) - (a.value ?? 0);
    });

  useEffect(() => {
    AsyncStorage.multiGet(['greek_rank_cached', 'profile_frame_rank']).then(pairs => {
      const [rankRaw, frameRaw] = pairs.map(p => p[1]);
      if (rankRaw) setGreekRank(rankRaw);
      if (frameRaw) setSelectedFrame(frameRaw);
    });
  }, []);

  useEffect(() => {
    apiFetch(`/api/workouts/${workoutId}`)
      .then(r => r.json())
      .then(data => {
        setExercises(data.exercises ?? []);
        setDuration(data.duration ?? null);
      })
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


  function goToDetails() {
    navigation.replace('WorkoutDetails', { workoutId });
  }

  async function handleShare() {
    setSharing(true);
    try {
      await captureAndShare(shareCardRef);
    } catch {
      // user cancelled or capture failed — no-op
    } finally {
      setSharing(false);
    }
  }

  // Heaviest working set per exercise for the share card (bodyweight = most reps)
  function bestSetOf(ex: ExerciseData) {
    let best: { reps: number; weight: number } | null = null;
    for (const s of ex.sets) {
      if (!s.reps || s.set_type === 'W') continue;
      const w = s.weight ?? 0;
      if (!best || w > best.weight || (w === best.weight && s.reps > best.reps)) {
        best = { reps: s.reps, weight: w };
      }
    }
    return best;
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

  const shareDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={s.container}>
      {/* Off-screen card for screenshot capture */}
      <View
        ref={shareCardRef}
        style={{ position: 'absolute', left: -9999, top: -9999 }}
        collapsable={false}
      >
        <WorkoutShareCard
          workoutName={workoutName}
          date={shareDate}
          totalVolume={totalVolume}
          totalSets={totalSets}
          totalReps={totalReps}
          duration={duration}
          weightUnit={weightUnit}
          exercises={exercises.slice(0, 3).map(e => ({ name: e.name, bestSet: bestSetOf(e) }))}
          prs={filteredPrs}
          accentColor={colors.accent}
        />
      </View>

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
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.navigate(isFirstWorkout ? 'GreekRankIntro' : 'DashboardHome')}>
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
                <LaurelBranch height={20} color="#7A5800" />
                <Text style={s.prText}>
                  {filteredPrs[0].exercise_name} — new {filteredPrs[0].pr_type.replace(/_/g, ' ')} PR!
                </Text>
                <LaurelBranch side="right" height={20} color="#7A5800" />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.prDropdownHeader}
                  onPress={() => setPrExpanded(v => !v)}
                  activeOpacity={0.8}
                >
                  <LaurelBranch height={20} color="#7A5800" />
                  <Text style={s.prText}>
                    {filteredPrs.length} Personal Records
                  </Text>
                  <Text style={s.prChevron}>{prExpanded ? '▲' : '▼'}</Text>
                  <LaurelBranch side="right" height={20} color="#7A5800" />
                </TouchableOpacity>
                {prExpanded && filteredPrs.map((pr, i) => (
                  <View key={i} style={s.prBanner}>
                    <LaurelBranch height={20} color="#7A5800" />
                    <Text style={s.prText}>
                      {pr.exercise_name} — new {pr.pr_type.replace(/_/g, ' ')} PR!
                    </Text>
                    <LaurelBranch side="right" height={20} color="#7A5800" />
                  </View>
                ))}
              </>
            )}
          </Animated.View>
        )}

        {greekRank && !isFirstWorkout && (() => {
          const rankColor = GREEK_RANK_COLORS[greekRank] ?? '#888888';
          const rankIdx = GREEK_RANKS.findIndex(r => r.name === greekRank);
          const nextRank = GREEK_RANKS[rankIdx + 1];
          return (
            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.section}>
              <View style={[s.rankBadgeCard, { backgroundColor: rankColor + '15', borderColor: rankColor + '44' }]}>
                <View style={s.rankBadgeLeft}>
                  <View style={s.rankAvatarWrap}>
                    <ProfileAvatarFrame rankName={selectedFrame} size={44} avatarSize={36} />
                  </View>
                  <View>
                    <Text style={[s.rankBadgeName, { color: rankColor }]}>{greekRank}</Text>
                    <Text style={s.rankBadgeSub}>
                      {nextRank
                        ? `Keep training to reach ${nextRank.name}`
                        : "You've reached the highest rank!"}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          );
        })()}

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

        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <TouchableOpacity
            style={s.shareBtn}
            onPress={handleShare}
            disabled={sharing || loading}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
                <Text style={s.shareBtnText}>Share Workout</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  closeBtn: { padding: spacing.sm },
  closeText: { fontSize: typography.fontSize.xl, color: colors.textSecondary },
  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 20 },
  trophy: { fontSize: 48, marginBottom: 8 },
  headline: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  subline: { fontSize: 15, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  prDropdownHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFD700', borderRadius: 10, padding: 12, marginBottom: 8 },
  prBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3C4', borderRadius: 10, padding: 12, marginBottom: 8 },
  prText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: '#7A5800', flex: 1 },
  prChevron: { fontSize: 13, color: '#7A5800', marginLeft: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  diagramCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  diagramTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
  exCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  exName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  setBadge: { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  setBadgeText: { fontSize: 12, color: colors.textSecondary },
  rankBadgeCard: { borderRadius: radius.md, padding: 14, borderWidth: 1 },
  rankBadgeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankAvatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  rankBadgeName: { fontSize: typography.fontSize.md, fontWeight: '800', letterSpacing: 0.5 },
  rankBadgeSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  detailsBtn: { backgroundColor: colors.accent, borderRadius: radius.md, margin: 20, marginTop: spacing.xs, padding: spacing.md, alignItems: 'center' },
  detailsBtnText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '600' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    margin: 20,
    marginTop: 0,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareBtnText: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '600' },
});
