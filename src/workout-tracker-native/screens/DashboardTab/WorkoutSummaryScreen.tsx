import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator,
  // Aliased: `Animated` in this file is Reanimated (for the entering
  // animations). The count-ups, chevron and trophy pop use RN's own Animated.
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
import { GREEK_RANKS } from '../../constants/greekRanks';
import MuscleDiagram from '../../components/MuscleDiagram';
import WorkoutShareCard, { bestWorkingSet } from '../../components/share/WorkoutShareCard';
import CardioShareCard from '../../components/share/CardioShareCard';
import { LaurelBranch } from '../../components/LaurelWreath';
import { PR_GOLD } from '../../constants/prColors';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import RankUpCard from '../../components/RankUpCard';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import { DashboardStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GREEK_RANK_CACHED_KEY, PROFILE_FRAME_RANK_KEY } from '../../constants/storageKeys';
import { type GreekRankData } from '../../utils/greekRank';
import { PR_TYPE_LABELS, PR_TYPE_ORDER, fmtMinSec } from '../../utils/prFormat';
import { GPS_DISTANCE_UNIT_KEY, toDisplayDistance, toDisplayElevation, elevationLabel, toExactVolume, toKm, type DistanceUnit, type WeightUnit } from '../../utils/units';
import { fmtHold, fmtMinutes } from '../../components/workout/types';
import { usePurchase } from '../../context/PurchaseContext';
import { writeWidgetGreekRank } from '../../utils/widgetData';
import { decodeRouteSegments, regionFor, thinSegments } from '../../utils/routeSegments';
import { isCycling, speedInUnit, speedLabel } from '../../utils/gpsMetrics';
import { bestEffortLabel, type BestEffort } from '../../utils/bestEfforts';
import { fmtRaceTime } from '../../utils/cardioFormat';

// react-native-maps needs a development build; without it the route card has no map
let _MapsModule: any = null;
try { _MapsModule = require('react-native-maps'); } catch {}
const MapView: React.ComponentType<any> | null = _MapsModule?.default ?? null;
const Polyline: React.ComponentType<any> | null = _MapsModule?.Polyline ?? null;

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutSummary'>;
type SummaryPr = Props['route']['params']['prs'][number];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SetData = { id: number; reps?: number; weight?: number; set_type: string; cardio_duration?: number; distance?: number; distance_unit?: string; elevation_gain?: number | null; max_speed?: number | null };
type ExerciseData = {
  id: number; name: string; exercise_type?: string; sets: SetData[];
  // A GPS activity's route and the efforts scanned from it
  route_polyline?: string | null; route_segments?: string[] | null; best_efforts?: BestEffort[];
};
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
    case 'longest_distance':
      return `${toDisplayDistance(pr.value, distanceUnit).toFixed(2)} ${distanceUnit}`;
    case 'max_elevation':
      return `${Math.round(toDisplayElevation(pr.value, distanceUnit))} ${elevationLabel(distanceUnit)} climbed`;
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
  // The rank before this workout, set only when this workout moved it up
  const [previousRank, setPreviousRank] = useState<string | null>(null);
  // The card waits for the live rank, so it never jumps to the top mid-view on a rank-up
  const [rankSettled, setRankSettled] = useState(false);
  const mountedAt = useRef(Date.now()).current;
  const trophyPop = useRef(new RNAnimated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');

  const exercises = workout?.exercises ?? [];
  // Cardio only when every exercise is (Workout.to_dict), so a lifting session
  // with a warm-up jog keeps its volume/sets/reps
  const isCardio = workout?.workout_type === 'cardio';
  // A GPS activity: the cardio exercise that recorded a route
  const routeExercise = isCardio ? exercises.find(e => e.route_polyline || e.route_segments?.length) ?? null : null;
  const routeSegments = useMemo(() => thinSegments(decodeRouteSegments(routeExercise)), [routeExercise]);
  const routeRegion = useMemo(() => regionFor(routeSegments), [routeSegments]);
  const cycling = isCardio && exercises.some(e => isCycling(e.name));

  const filteredPrs = useMemo(() => prs
    .filter(pr => pr.pr_type !== 'estimated_1rm')
    .sort((a, b) => {
      const typeOrder = (PR_TYPE_ORDER[a.pr_type] ?? 9) - (PR_TYPE_ORDER[b.pr_type] ?? 9);
      if (typeOrder !== 0) return typeOrder;
      return (b.value ?? 0) - (a.value ?? 0);
    }), [prs]);

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
        // The live rank and score: whether this workout moved the rank, and
        // where the progress bar stands. The card waits for it
        const res = await apiFetch('/api/stats/greek-rank');
        const data: GreekRankData | null = res.ok ? await res.json() : null;
        if (alive && data) {
          setRankData(data);
          setGreekRank(data.greek_rank);
          // Right after a save is when the rank most often moves
          writeWidgetGreekRank(user?.id, data);
          // The cache holds the rank from before this workout, unless something
          // already refreshed it. No cache (fresh login) means nothing to compare.
          const before = GREEK_RANKS.findIndex(r => r.name === rankBefore);
          const after = GREEK_RANKS.findIndex(r => r.name === data.greek_rank);
          if (rankBefore && before >= 0 && after > before) setPreviousRank(rankBefore);
          if (data.greek_rank) AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, data.greek_rank).catch(() => {});
        }
      } catch {}
      if (alive) setRankSettled(true);
    })();
    return () => { alive = false; };
  }, []);

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

  // Waits for the Reduce Motion answer (a tick), so the confetti and the
  // trophy pop are either played whole or skipped, never cut off midway
  const celebrated = useRef(false);
  useEffect(() => {
    if (reduceMotion === null || celebrated.current) return;
    celebrated.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (isFirstWorkout && !reduceMotion) timers.push(setTimeout(() => confettiRef.current?.start(), 300));
    if (filteredPrs.length > 0) {
      if (!reduceMotion) trophyPop.setValue(0);
      timers.push(setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (reduceMotion) return;
        if (!isFirstWorkout) confettiRef.current?.start();
        RNAnimated.spring(trophyPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
      }, 600));
    }
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion]);

  // The promotion waits for the card's entrance and, with PRs, for the PR
  // haptic (600ms), so the moments land one after the other
  const rankCard = greekRank && !isFirstWorkout && rankSettled && reduceMotion !== null && (
    <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.section}>
      <RankUpCard
        rank={greekRank}
        previousRank={previousRank}
        rankData={rankData}
        selectedFrame={selectedFrame}
        reduceMotion={reduceMotion}
        startDelay={Math.max(550, (filteredPrs.length > 0 ? 1100 : 0) - (Date.now() - mountedAt))}
      />
    </Animated.View>
  );

  function goToDetails() {
    if (isCardio) navigation.replace('CardioDetails', { workoutId });
    else navigation.replace('WorkoutDetails', { workoutId });
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
  const elevationM = exercises.reduce((t, e) => t + e.sets.reduce((u, st) => u + (st.elevation_gain ?? 0), 0), 0);
  const bestEfforts = routeExercise?.best_efforts ?? [];
  const maxSpeedKmh = cycling ? exercises.reduce((m, e) => Math.max(m, ...e.sets.map(st => st.max_speed ?? 0)), 0) : 0;
  // Auto-pause kept stops out of the moving time; the workout's own length has them
  const movedLess = durationMin != null && cardioMinutes > 0 && durationMin - cardioMinutes >= 1;

  const hasPrs = filteredPrs.length > 0;
  // A PR on a lift the Strength Score ranks: the moment someone most wants to know where it puts them
  const rankedPr = filteredPrs.find(p => p.scored);
  const shownPrs = groupedPrs.slice(0, PRS_SHOWN_BEFORE_MORE);
  const morePrs = groupedPrs.slice(PRS_SHOWN_BEFORE_MORE);

  const renderPrRow = (pr: typeof groupedPrs[number], i: number) => (
    <Animated.View key={`${pr.exercise_name}|${pr.pr_type}`} entering={FadeInDown.delay(150 + i * 80).duration(350)} style={s.prRow}>
      <Ionicons name="trophy" size={16} color={colors.prGold} style={s.prRowIcon} />
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
        {isCardio ? (
          <CardioShareCard
            activityName={workoutName}
            date={shareDate}
            distance={cardioDistance}
            distanceUnit={distanceUnit}
            durationMin={cardioMinutes}
            elevationM={elevationM}
            coords={routeSegments}
            accentColor={colors.accentDark}
            cycling={cycling}
          />
        ) : (
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
            exercises={exercises.slice(0, 3).map(e => ({ name: e.name, bestSet: bestWorkingSet(e.sets) }))}
            prs={filteredPrs}
            accentColor={colors.accentDark}
          />
        )}
      </View>

      {isFirstWorkout ? (
        <ConfettiCannon
          ref={confettiRef}
          count={200}
          origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
          fadeOut
          autoStart={false}
        />
      ) : hasPrs && (
        // A smaller burst in PR gold, on the PR haptic
        <ConfettiCannon
          ref={confettiRef}
          count={60}
          origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
          colors={[colors.prGold, colors.prGoldBorder, PR_GOLD]}
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
          <RNAnimated.View style={{
            transform: [
              { scale: trophyPop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              { rotate: trophyPop.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-12deg', '8deg', '0deg'] }) },
            ],
          }}>
            <Ionicons name="trophy" size={52} color={hasPrs ? colors.prGold : colors.accent} style={s.trophy} />
          </RNAnimated.View>
          <Text style={s.headline}>
            {isFirstWorkout
              ? 'Your first workout. The pursuit starts here.'
              : isBestVolume && isBestReps
              ? 'Your biggest workout yet.'
              : isBestVolume
              ? 'Your highest-volume workout yet.'
              : isBestReps
              ? 'Your most reps in a workout yet.'
              : cycling
              ? 'Ride complete.'
              : isCardio
              ? 'Activity complete.'
              : 'Workout complete.'}
          </Text>
          <Text style={s.subline}>
            "{workoutName}"{durationMin ? ` · ${fmtMinutes(durationMin)}` : ''}
          </Text>
        </Animated.View>

        {/* A rank-up outranks the PRs, so it moves above them where it can't be scrolled past */}
        {previousRank != null && rankCard}

        {hasPrs && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.section}>
            <View style={s.prCard}>
              <View style={s.prHeader}>
                <LaurelBranch height={20} color={colors.prGoldBorder} />
                <Text style={s.prHeaderText}>
                  {filteredPrs.length === 1 ? 'New Personal Record' : `${filteredPrs.length} Personal Records`}
                </Text>
                <LaurelBranch side="right" height={20} color={colors.prGoldBorder} />
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
                      <Ionicons name="chevron-down" size={14} color={colors.prGold} />
                    </RNAnimated.View>
                  </TouchableOpacity>
                </>
              )}
              {rankedPr && (
                <TouchableOpacity
                  style={s.rankLink}
                  onPress={() => (navigation as any).navigate('ProgressTab', { screen: 'StrengthScore', initial: false })}
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

        {previousRank == null && rankCard}

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
                <Text style={s.statLabel}>{movedLess ? 'Moving Time' : 'Time'}</Text>
              </View>
              <View style={s.statBox}>
                {cardioDistance > 0
                  ? <CountUpText value={cardioDistance} delay={300} format={n => n.toFixed(2)} style={s.statValue} />
                  : <Text style={s.statValue}>—</Text>}
                <Text style={s.statLabel}>Distance ({distanceUnit})</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>
                  {pace == null ? '—' : cycling ? speedInUnit(cardioKm, cardioMinutes, distanceUnit).toFixed(1) : fmtMinSec(pace)}
                </Text>
                <Text style={s.statLabel}>{cycling ? `Speed (${speedLabel(distanceUnit)})` : `Pace (/${distanceUnit})`}</Text>
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

        {routeExercise && (routeRegion || bestEfforts.length > 0 || elevationM > 0 || maxSpeedKmh > 0) && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)} style={s.section}>
            <View style={s.routeCard}>
              {MapView && Polyline && routeRegion && (
                <MapView
                  style={s.routeMap}
                  initialRegion={routeRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  pointerEvents="none"
                >
                  {routeSegments.filter(seg => seg.length >= 2).map((seg, i) => (
                    <Polyline key={i} coordinates={seg} strokeColor={colors.accent} strokeWidth={4} />
                  ))}
                </MapView>
              )}
              {(elevationM > 0 || bestEfforts.length > 0 || maxSpeedKmh > 0) && (
                <View style={s.routeBody}>
                  {maxSpeedKmh > 0 && (
                    <View style={s.elevationRow}>
                      <Ionicons name="speedometer-outline" size={16} color={colors.textSecondary} />
                      <Text style={s.elevationText}>
                        {toDisplayDistance(maxSpeedKmh, distanceUnit).toFixed(1)} {speedLabel(distanceUnit)} max speed
                      </Text>
                    </View>
                  )}
                  {elevationM > 0 && (
                    <View style={s.elevationRow}>
                      <Ionicons name="trending-up" size={16} color={colors.textSecondary} />
                      <Text style={s.elevationText}>
                        {Math.round(toDisplayElevation(elevationM, distanceUnit)).toLocaleString()} {elevationLabel(distanceUnit)} climbed
                      </Text>
                    </View>
                  )}
                  {bestEfforts.length > 0 && (
                    <>
                      <Text style={s.effortsLabel}>Best Efforts</Text>
                      <View style={s.setBadgeRow}>
                        {bestEfforts.map(effort => (
                          <View key={`${effort.milestone_type}-${effort.distance_km}-${effort.duration_min}`} style={s.setBadge}>
                            <Text style={s.setBadgeText}>
                              {`${bestEffortLabel(effort)} `}
                              <Text style={s.effortValue}>
                                {effort.milestone_type === 'distance'
                                  ? fmtRaceTime(effort.duration_min)
                                  : `${toDisplayDistance(effort.distance_km, distanceUnit).toFixed(2)} ${distanceUnit}`}
                              </Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          </Animated.View>
        )}

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
          ) : routeExercise ? null : (
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
    borderWidth: 1, borderColor: colors.prGoldBorder,
    borderRadius: radius.md, padding: spacing.md,
  },
  prHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  prHeaderText: { flex: 1, textAlign: 'center', fontSize: typography.fontSize.md, fontWeight: '800', color: colors.prGold },
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
  morePrsText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.prGold },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statsPlaceholder: { height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  routeCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  routeMap: { width: '100%', height: 200 },
  routeBody: { padding: spacing.md, gap: spacing.sm },
  elevationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  elevationText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  effortsLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  effortValue: { fontWeight: '700', color: colors.textPrimary },
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
