import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator,
  // Aliased: `Animated` in this file is Reanimated (for the entering
  // animations). The count-ups, chevron and rank-up pop use RN's own Animated.
  Animated as RNAnimated, Easing,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { captureAndShare } from '../../utils/shareCapture';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import ProfileAvatarFrame, { GREEK_RANK_COLORS } from '../../components/ProfileAvatarFrame';
import { GREEK_RANKS } from '../../constants/greekRanks';
import MuscleDiagram from '../../components/MuscleDiagram';
import WorkoutShareCard from '../../components/share/WorkoutShareCard';
import { LaurelBranch } from '../../components/LaurelWreath';
import { PR_GOLD } from '../../constants/prColors';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import { DashboardStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GREEK_RANK_CACHED_KEY, PROFILE_FRAME_RANK_KEY } from '../../constants/storageKeys';
import { type GreekRankData, gateRequirementText } from '../../utils/greekRank';
import { PR_TYPE_LABELS, PR_TYPE_ORDER, fmtMinSec } from '../../utils/prFormat';
import { GPS_DISTANCE_UNIT_KEY, toDisplayDistance, toExactVolume, toKm, type DistanceUnit, type WeightUnit } from '../../utils/units';
import { fmtHold } from '../../components/workout/types';
import { usePurchase } from '../../context/PurchaseContext';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutSummary'>;
type SummaryPr = Props['route']['params']['prs'][number];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SetData = { id: number; reps?: number; weight?: number; set_type: string; cardio_duration?: number; distance?: number; distance_unit?: string };
type ExerciseData = { id: number; name: string; exercise_type?: string; sets: SetData[] };
type WorkoutData = {
  date?: string;
  duration?: number | null;
  workout_type?: string;
  cardio_duration?: number | null;
  distance?: number | null;
  distance_unit?: string;
  exercises?: ExerciseData[];
};

// Rep-record and best-time PRs come several to a lift; the rest come one at a time
const PRS_SHOWN_BEFORE_MORE = 3;

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

const toDistanceUnitKm = (value: number, unit?: string) => toKm(value, unit === 'mi' ? 'mi' : 'km');

/** One PR's value as the lifter would say it: "8 reps at 185 lbs", "5K in 24:10" */
function fmtSummaryPr(pr: SummaryPr, unit: string, distanceUnit: DistanceUnit): string {
  switch (pr.pr_type) {
    case 'max_weight':
      return `${pr.value} ${unit}`;
    case 'max_reps':
      return pr.weight_context ? `${pr.value} reps at ${pr.weight_context} ${unit}` : `${pr.value} reps`;
    case 'best_time':
      return pr.label ? `${pr.label} in ${fmtMinSec(pr.value)}` : fmtMinSec(pr.value);
    case 'best_distance': {
      const dist = `${toDisplayDistance(pr.value, distanceUnit).toFixed(2)} ${distanceUnit}`;
      return pr.label ? `${dist} in ${pr.label}` : dist;
    }
    case 'max_duration':
      return fmtHold(pr.value);
    default:
      return String(pr.value);
  }
}

/** A number that counts up from 0 when it first renders */
function CountUpText({ value, format, delay, style }: {
  value: number;
  format: (n: number) => string;
  delay: number;
  style: any;
}) {
  const anim = useRef(new RNAnimated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    // JS-driven (text can't use the native driver), so it's kept short: on
    // Fabric every frame commits, and this screen is otherwise idle.
    RNAnimated.timing(anim, {
      toValue: value, duration: 700, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => { anim.removeListener(id); anim.stopAnimation(); };
  }, [anim, value, delay]);
  return <Text style={style}>{format(shown)}</Text>;
}

export default function WorkoutSummaryScreen({ route, navigation }: Props) {
  const { workoutId, workoutName, prs, totalVolume, totalReps, totalSets, muscles, isFirstWorkout, isBestVolume, isBestReps } = route.params;
  const { colors } = useTheme();
  const { isPremium } = usePurchase();
  const s = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const weightUnit: WeightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const confettiRef = useRef<ConfettiCannon>(null);
  const shareCardRef = useRef<View>(null);

  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [morePrsExpanded, setMorePrsExpanded] = useState(false);
  const morePrsAnim = useCollapseAnim(morePrsExpanded);
  const [sharing, setSharing] = useState(false);
  const [greekRank, setGreekRank] = useState<string | null>(null);
  const [rankData, setRankData] = useState<GreekRankData | null>(null);
  const [rankedUp, setRankedUp] = useState(false);
  const rankPop = useRef(new RNAnimated.Value(1)).current;
  const greekScore = rankData?.greek_score ?? null;
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');

  const exercises = workout?.exercises ?? [];
  // Cardio only when every exercise is (Workout.to_dict), so a lifting session
  // with a warm-up jog keeps its volume/sets/reps
  const isCardio = workout?.workout_type === 'cardio';

  const filteredPrs = prs
    .filter(pr => pr.pr_type !== 'estimated_1rm')
    .sort((a, b) => {
      const typeOrder = (PR_TYPE_ORDER[a.pr_type] ?? 9) - (PR_TYPE_ORDER[b.pr_type] ?? 9);
      if (typeOrder !== 0) return typeOrder;
      return (b.value ?? 0) - (a.value ?? 0);
    });

  // One row per exercise + PR type, listing every record in it. Two rep
  // records at two weights are two PRs, so the header counts PRs and each row
  // spells out its values for the total to add up.
  const groupedPrs = useMemo(() => {
    const map = new Map<string, { exercise_name: string; pr_type: string; values: string[] }>();
    for (const pr of filteredPrs) {
      const key = `${pr.exercise_name}|${pr.pr_type}`;
      const value = fmtSummaryPr(pr, weightUnit, distanceUnit);
      const entry = map.get(key);
      if (entry) entry.values.push(value);
      else map.set(key, { exercise_name: pr.exercise_name, pr_type: pr.pr_type, values: [value] });
    }
    return [...map.values()];
  }, [filteredPrs, weightUnit, distanceUnit]);

  useEffect(() => {
    if (user?.id == null) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`)
      .then(v => { if (v === 'km' || v === 'mi') setDistanceUnit(v); })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const pairs = await AsyncStorage.multiGet([GREEK_RANK_CACHED_KEY, `${PROFILE_FRAME_RANK_KEY}_${user?.id}`]).catch(() => null);
      const [rankBefore, frameRaw] = pairs ? pairs.map(p => p[1]) : [null, null];
      if (!alive) return;
      if (rankBefore) setGreekRank(rankBefore);
      if (frameRaw) setSelectedFrame(frameRaw);
      try {
        // Live score (for the rank-up progress bar): the cached name renders
        // the badge instantly, but the numeric score isn't cached
        const res = await apiFetch('/api/stats/greek-rank');
        const data: GreekRankData | null = res.ok ? await res.json() : null;
        if (!alive || !data) return;
        setRankData(data);
        setGreekRank(data.greek_rank);
        // The cache holds the rank from before this workout, unless something
        // already refreshed it. No cache (fresh login) means nothing to compare.
        const before = GREEK_RANKS.findIndex(r => r.name === rankBefore);
        const after = GREEK_RANKS.findIndex(r => r.name === data.greek_rank);
        if (rankBefore && before >= 0 && after > before) setRankedUp(true);
        if (data.greek_rank) AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, data.greek_rank).catch(() => {});
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!rankedUp) return;
    rankPop.setValue(0.9);
    RNAnimated.spring(rankPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    // After the PR haptic (600ms), so the two read as separate moments
    const t = setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 1100);
    return () => clearTimeout(t);
  }, [rankedUp, rankPop]);

  const loadWorkout = () => {
    setLoading(true);
    setLoadFailed(false);
    apiFetch(`/api/workouts/${workoutId}`)
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status));
        setWorkout(await r.json());
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };
  useEffect(loadWorkout, [workoutId]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (isFirstWorkout) timers.push(setTimeout(() => confettiRef.current?.start(), 300));
    if (filteredPrs.length > 0) {
      timers.push(setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600));
    }
    return () => timers.forEach(clearTimeout);
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
    for (const set of ex.sets) {
      if (!set.reps || set.set_type === 'W') continue;
      const w = set.weight ?? 0;
      if (!best || w > best.weight || (w === best.weight && set.reps > best.reps)) {
        best = { reps: set.reps, weight: w };
      }
    }
    return best;
  }

  function formatSet(ex: ExerciseData, set: SetData) {
    if (ex.exercise_type === 'duration') {
      return set.cardio_duration ? fmtHold(set.cardio_duration) : '—';
    }
    if (ex.exercise_type === 'cardio') {
      const parts: string[] = [];
      if (set.cardio_duration) parts.push(fmtMinutes(set.cardio_duration));
      if (set.distance) {
        parts.push(`${toDisplayDistance(toDistanceUnitKm(set.distance, set.distance_unit), distanceUnit).toFixed(2)} ${distanceUnit}`);
      }
      return parts.join(' · ') || '—';
    }
    if (set.reps && set.weight) return `${set.reps} × ${set.weight} ${weightUnit}`;
    if (set.reps) return `${set.reps} reps`;
    return '—';
  }

  // The day the workout is dated, not today: a session logged the next morning
  // shouldn't be shared as today's
  const workoutDate = workout?.date ? new Date(workout.date) : null;
  const shareDate = (workoutDate && !isNaN(workoutDate.getTime()) ? workoutDate : new Date())
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Workout.volume is always lbs; everything shown here is in the user's unit
  const volumeText = toExactVolume(totalVolume, weightUnit);
  const volumeValue = Number(volumeText.replace(/,/g, ''));
  const durationMin = workout?.duration ?? null;

  const cardioMinutes = workout?.cardio_duration ?? 0;
  const cardioKm = workout?.distance ? toDistanceUnitKm(workout.distance, workout.distance_unit) : 0;
  const cardioDistance = cardioKm > 0 ? toDisplayDistance(cardioKm, distanceUnit) : 0;
  const pace = cardioMinutes > 0 && cardioDistance > 0 ? cardioMinutes / cardioDistance : null;

  const hasPrs = filteredPrs.length > 0;
  // A PR on a lift the Strength Score ranks: the moment someone most wants to know where it puts them
  const rankedPr = filteredPrs.find(p => p.scored);
  const shownPrs = groupedPrs.slice(0, PRS_SHOWN_BEFORE_MORE);
  const morePrs = groupedPrs.slice(PRS_SHOWN_BEFORE_MORE);

  const renderPrRow = (pr: typeof groupedPrs[number], i: number) => (
    <Animated.View key={`${pr.exercise_name}|${pr.pr_type}`} entering={FadeInDown.delay(150 + i * 80).duration(350)} style={s.prRow}>
      <Ionicons name="trophy" size={16} color={PR_GOLD} style={s.prRowIcon} />
      <View style={s.prRowText}>
        <Text style={s.prRowTitle}>
          {pr.exercise_name} · {PR_TYPE_LABELS[pr.pr_type] ?? pr.pr_type.replace(/_/g, ' ')}{pr.values.length > 1 ? 's' : ''}
        </Text>
        <Text style={s.prRowValues}>{pr.values.join(', ')}</Text>
      </View>
    </Animated.View>
  );

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
          volumeText={totalVolume > 0 ? volumeText : null}
          totalSets={totalSets}
          totalReps={totalReps}
          duration={durationMin}
          holdMinutes={exercises
            .filter(e => e.exercise_type === 'duration')
            .reduce((sum, e) => sum + e.sets.reduce((t, st) => t + (st.cardio_duration ?? 0), 0), 0)}
          weightUnit={weightUnit}
          exercises={exercises.slice(0, 3).map(e => ({ name: e.name, bestSet: bestSetOf(e) }))}
          prs={filteredPrs}
          accentColor={colors.accentDark}
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

      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          style={s.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close summary"
          onPress={() => isFirstWorkout
            // replace, not navigate: the intro's back arrow should reach the
            // dashboard, not the summary the user just closed
            ? navigation.replace('GreekRankIntro')
            : navigation.navigate('DashboardHome')}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={s.hero}>
          <Ionicons name="trophy" size={52} color={hasPrs ? PR_GOLD : colors.accent} style={s.trophy} />
          <Text style={s.headline}>
            {isFirstWorkout
              ? 'Your first workout. The pursuit starts here.'
              : isBestVolume && isBestReps
              ? 'Your biggest workout yet.'
              : isBestVolume
              ? 'Your highest-volume workout yet.'
              : isBestReps
              ? 'Your most reps in a workout yet.'
              : 'Workout complete.'}
          </Text>
          <Text style={s.subline}>
            "{workoutName}"{durationMin ? ` · ${fmtMinutes(durationMin)}` : ''}
          </Text>
        </Animated.View>

        {hasPrs && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
            <View style={s.prCard}>
              <View style={s.prHeader}>
                <LaurelBranch height={20} color={PR_GOLD} />
                <Text style={s.prHeaderText}>
                  {filteredPrs.length === 1 ? 'New Personal Record' : `${filteredPrs.length} Personal Records`}
                </Text>
                <LaurelBranch side="right" height={20} color={PR_GOLD} />
              </View>
              {shownPrs.map(renderPrRow)}
              {morePrs.length > 0 && (
                <>
                  <Collapsible progress={morePrsAnim} expanded={morePrsExpanded}>
                    {morePrs.map((pr, i) => renderPrRow(pr, i + shownPrs.length))}
                  </Collapsible>
                  <TouchableOpacity
                    style={s.morePrsBtn}
                    onPress={() => setMorePrsExpanded(v => !v)}
                    accessibilityRole="button"
                  >
                    <Text style={s.morePrsText}>
                      {morePrsExpanded ? 'Show less' : `Show ${morePrs.length} more`}
                    </Text>
                    <RNAnimated.View
                      style={{ transform: [{ rotate: morePrsAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
                    >
                      <Ionicons name="chevron-down" size={14} color={PR_GOLD} />
                    </RNAnimated.View>
                  </TouchableOpacity>
                </>
              )}
              {rankedPr && (
                <TouchableOpacity
                  style={s.rankLink}
                  onPress={() => (navigation as any).navigate('TrainingTab', { screen: 'StrengthScore', initial: false })}
                  accessibilityRole="button"
                >
                  <Ionicons name={isPremium ? 'trophy-outline' : 'lock-closed'} size={14} color={colors.accent} />
                  <Text style={s.rankLinkText} numberOfLines={1}>
                    See where your {rankedPr.exercise_name} ranks
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {greekRank && !isFirstWorkout && (() => {
          const rankColor = GREEK_RANK_COLORS[greekRank] ?? GREEK_RANK_COLORS.Neophyte;
          const rankIdx = GREEK_RANKS.findIndex(r => r.name === greekRank);
          const currentRank = rankIdx >= 0 ? GREEK_RANKS[rankIdx] : GREEK_RANKS[0];
          const nextRank = GREEK_RANKS[rankIdx + 1];
          const progress = greekScore != null && nextRank
            ? Math.min(1, Math.max(0, (greekScore - currentRank.low) / (currentRank.high - currentRank.low)))
            : null;
          const ptsToNext = greekScore != null && nextRank
            ? Math.max(0, Math.ceil(nextRank.low - greekScore))
            : null;
          return (
            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.section}>
              <RNAnimated.View
                style={[
                  s.rankBadgeCard,
                  { backgroundColor: rankColor + '15', borderColor: rankedUp ? rankColor : rankColor + '44', transform: [{ scale: rankPop }] },
                ]}
              >
                {rankedUp && (
                  <View style={[s.rankUpPill, { backgroundColor: rankColor + '26' }]}>
                    <Ionicons name="arrow-up" size={12} color={rankColor} />
                    <Text style={[s.rankUpText, { color: rankColor }]}>Ranked up</Text>
                  </View>
                )}
                <View style={s.rankBadgeLeft}>
                  <View style={s.rankAvatarWrap}>
                    <View style={s.rankAvatarDisc} />
                    <ProfileAvatarFrame rankName={selectedFrame} size={44} avatarSize={36} />
                  </View>
                  <View style={s.rankBadgeText}>
                    <Text style={[s.rankBadgeName, { color: rankColor }]}>{greekRank}</Text>
                    <Text style={s.rankBadgeSub}>
                      {rankedUp
                        ? `You reached ${greekRank}. This workout pushed you over.`
                        : nextRank
                        ? `Keep training to reach ${nextRank.name}`
                        : "You've reached the highest rank."}
                    </Text>
                  </View>
                </View>
                {progress != null && nextRank && (
                  <View style={s.rankProgressWrap}>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: rankColor }]} />
                    </View>
                    <Text style={s.progressLabel}>
                      {/* At 0 points the score already earns the next rank, so a
                          top-rank gate is what's holding it back */}
                      {ptsToNext === 0 && rankData
                        ? gateRequirementText(rankData, nextRank.name) ?? `Keep training to reach ${nextRank.name}`
                        : `${ptsToNext} point${ptsToNext !== 1 ? 's' : ''} to ${nextRank.name}`}
                    </Text>
                  </View>
                )}
              </RNAnimated.View>
            </Animated.View>
          );
        })()}

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={s.section}>
          {/* Waits for the workout: whether it's cardio decides which stats
              mean anything, and guessing first would flash "0 lbs · 0 reps"
              on a run. A failed load falls back to the strength stats. */}
          {loading ? (
            <View style={s.statsPlaceholder} />
          ) : isCardio ? (
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statValue}>{cardioMinutes > 0 ? fmtMinutes(cardioMinutes) : '—'}</Text>
                <Text style={s.statLabel}>Time</Text>
              </View>
              <View style={s.statBox}>
                {cardioDistance > 0
                  ? <CountUpText value={cardioDistance} delay={300} format={n => n.toFixed(2)} style={s.statValue} />
                  : <Text style={s.statValue}>—</Text>}
                <Text style={s.statLabel}>Distance ({distanceUnit})</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{pace != null ? fmtMinSec(pace) : '—'}</Text>
                <Text style={s.statLabel}>Pace (/{distanceUnit})</Text>
              </View>
            </View>
          ) : (
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <CountUpText value={volumeValue} delay={300} format={n => Math.round(n).toLocaleString()} style={s.statValue} />
                <Text style={s.statLabel}>Volume ({weightUnit})</Text>
              </View>
              <View style={s.statBox}>
                <CountUpText value={totalSets} delay={380} format={n => String(Math.round(n))} style={s.statValue} />
                <Text style={s.statLabel}>Sets</Text>
              </View>
              <View style={s.statBox}>
                <CountUpText value={totalReps} delay={460} format={n => String(Math.round(n))} style={s.statValue} />
                <Text style={s.statLabel}>Reps</Text>
              </View>
            </View>
          )}
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
          ) : loadFailed ? (
            <View style={s.loadError}>
              <Text style={s.loadErrorText}>Couldn't load this workout's sets. It's saved, so you can also open it from your history.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={loadWorkout} accessibilityRole="button">
                <Text style={s.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            exercises.map(ex => (
              <View key={ex.id} style={s.exCard}>
                <Text style={s.exName}>{ex.name}</Text>
                <View style={s.setBadgeRow}>
                  {ex.sets.map((set, i) => {
                    const warmup = set.set_type === 'W';
                    return (
                      <View key={set.id ?? i} style={[s.setBadge, warmup && s.setBadgeWarmup]}>
                        <Text style={s.setBadgeText}>
                          {warmup && <Text style={s.setBadgeWarmupTag}>W  </Text>}
                          {formatSet(ex, set)}
                        </Text>
                      </View>
                    );
                  })}
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
            style={[s.shareBtn, { marginBottom: insets.bottom + spacing.md }]}
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

const SIDE = spacing.md + spacing.xs;

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SIDE, paddingBottom: spacing.sm },
  closeBtn: { padding: spacing.sm },
  hero: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: SIDE },
  trophy: { marginBottom: spacing.sm },
  headline: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  subline: { fontSize: typography.fontSize.md, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  section: { paddingHorizontal: SIDE, marginBottom: SIDE },
  // Gold outline on a surface fill, matching WorkoutLog's PR banner and the
  // PR Dashboard box — not the old filled-gold blocks.
  prCard: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: PR_GOLD,
    borderRadius: radius.md, padding: spacing.md,
  },
  prHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  prHeaderText: { flex: 1, textAlign: 'center', fontSize: typography.fontSize.md, fontWeight: '800', color: PR_GOLD },
  prRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  rankLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  rankLinkText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.accent },
  prRowIcon: { marginTop: 2 },
  prRowText: { flex: 1 },
  prRowTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  prRowValues: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  morePrsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  morePrsText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: PR_GOLD },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statsPlaceholder: { height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  diagramCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  diagramTitle: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  exCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  exName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm },
  setBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  setBadge: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: 'transparent',
  },
  setBadgeWarmup: { borderColor: colors.warmup + '88' },
  setBadgeText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  setBadgeWarmupTag: { fontWeight: '800', color: colors.warmup },
  loadError: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  loadErrorText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  retryText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  rankBadgeCard: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  rankUpPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.sm,
  },
  rankUpText: { fontSize: typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  rankBadgeLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  rankBadgeText: { flex: 1 },
  rankAvatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // own layer so the rounded disc never clips the Aretē frame's wreath, which bleeds past 44px
  rankAvatarDisc: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface },
  rankBadgeName: { fontSize: typography.fontSize.md, fontWeight: '800', letterSpacing: 0.5 },
  rankBadgeSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  rankProgressWrap: { marginTop: spacing.sm },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  detailsBtn: { backgroundColor: colors.accent, borderRadius: radius.md, marginHorizontal: SIDE, marginBottom: spacing.sm, padding: spacing.md, alignItems: 'center' },
  detailsBtnText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '600' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    marginHorizontal: SIDE,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareBtnText: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '600' },
});
