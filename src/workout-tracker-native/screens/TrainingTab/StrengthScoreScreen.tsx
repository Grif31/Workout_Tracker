import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Dimensions, RefreshControl, Animated, Easing,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-gifted-charts';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { appCache } from '../../utils/appCache';
import { TrainingStackParamsList } from '../../navigation/types';
import MuscleDiagram from '../../components/MuscleDiagram';
import { STRENGTH_TIERS, SCORE_RANK_COLORS } from '../../constants/strengthRanks';
import LaurelBranch from '../../components/LaurelWreath';
import { PR_GOLD, PR_GOLD_TEXT } from '../../constants/prColors';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'StrengthScore'>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 108;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

const LAST_TIER_KEY = 'strength_score_last_tier';

function timeAgo(isoStr: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


interface ScoreData {
  overall: number;
  overall_rank: { label: string; tier: number; display: string };
  greek_rank: string;
  greek_score?: number;
  greek_score_components?: { consistency: number; strength: number; dedication: number; volume: number };
  exercises_used: number;
  muscle_groups_used: number;
  big6?: Array<{ exercise: string; percentile: number | null; rank: { label: string; tier: number; display: string } | null; estimated_1rm?: number | null; thresholds?: { percentile: number; rank: string; weight: number }[]; has_data: boolean }>;
  supplemental?: Array<{ exercise: string; percentile: number | null; rank: { label: string; tier: number; display: string } | null; estimated_1rm?: number | null; thresholds?: { percentile: number; rank: string; weight: number }[]; has_data: boolean }>;
  muscle_groups?: Array<{ name: string; score: number; rank: { label: string; tier: number; display: string } }>;
  age_adjusted?: boolean;
  age?: number | null;
  age_factor?: number;
  bodyweight_updated_at?: string | null;
  coverage?: {
    big6: { tracked: number; total: number };
    compound: { tracked: number; total: number };
    isolation: { tracked: number; total: number };
  };
  weight_unit?: 'lbs' | 'kg';
  last_updated?: string;
  history?: HistoryPoint[];
}

interface HistoryPoint { date: string; score: number }
type MuscleGroup = { name: string; score: number; rank: { label: string; tier: number; display: string } };

export default function StrengthScoreScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.id;
  const styles = useMemo(() => createStyles(colors), [colors]);

  // bodyweight in lbs (estimates are always stored in lbs)
  const bwLbs = user?.bodyweight
    ? ((user as any).weight_unit === 'kg' ? user.bodyweight * 2.20462 : user.bodyweight)
    : null;

  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [history, setHistory]     = useState<HistoryPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [noData, setNoData]       = useState(false);

  // Hero ring — the count-up number itself is rendered by a separate leaf
  // component (AnimatedPercentText) so its per-frame re-render doesn't cascade
  // to the rest of this screen.
  const ringAnim = useRef(new Animated.Value(0)).current;

  // Rank-up celebration
  const [rankUpVisible, setRankUpVisible] = useState(false);
  const rankUpAnim = useRef(new Animated.Value(0)).current;

  // Muscle group detail modal
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const [groupModalVisible, setGroupModalVisible] = useState(false);

  // Lift detail modal
  type LiftEntry = { exercise: string; percentile: number | null; rank: { label: string; tier: number; display: string } | null; estimated_1rm?: number | null; thresholds?: { percentile: number; rank: string; weight: number }[]; has_data: boolean };
  const [selectedLift, setSelectedLift] = useState<LiftEntry | null>(null);
  const [liftModalVisible, setLiftModalVisible] = useState(false);

  // Info modal
  const [infoVisible, setInfoVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Rank-up celebration: only fires when the tier is strictly higher than the
  // last one we saw for this user. A brand-new key (first time this user's
  // score has ever been checked) is seeded silently — otherwise every
  // existing user would get a false "Rank Up!" the first time this ships.
  const checkRankUp = async (data: ScoreData) => {
    if (!uid) return;
    const tierIdx = STRENGTH_TIERS.findIndex(t => t.label === data.overall_rank.label);
    if (tierIdx < 0) return;
    const key = `${LAST_TIER_KEY}_${uid}`;
    const stored = await AsyncStorage.getItem(key);
    if (stored === null) {
      await AsyncStorage.setItem(key, String(tierIdx));
      return;
    }
    const storedIdx = parseInt(stored, 10);
    if (!isNaN(storedIdx) && tierIdx > storedIdx) {
      setRankUpVisible(true);
      rankUpAnim.setValue(0);
      Animated.spring(rankUpAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        Animated.timing(rankUpAnim, { toValue: 0, duration: 250, useNativeDriver: true })
          .start(() => setRankUpVisible(false));
      }, 3500);
    }
    await AsyncStorage.setItem(key, String(tierIdx));
  };

  const fetchScore = async () => {
    try {
      const res = await apiFetch('/api/stats/strength-score');
      if (res.status === 422) {
        const body = await res.json();
        if (body.missing === 'data') {
          setNoData(true);
        } else {
          setMissingFields(Array.isArray(body.missing) ? body.missing : [body.missing]);
        }
        return;
      }
      if (!res.ok) {
        console.warn('[StrengthScore] API error', res.status);
        setError(true);
        return;
      }
      const data: ScoreData = await res.json();
      setScoreData(data);
      if (data.history) setHistory(data.history);
      setMissingFields([]);
      setNoData(false);
      setError(false);
      appCache.set('strength_score', data);
      checkRankUp(data);
    } catch (e) { console.warn('[StrengthScore] fetch failed', e); setError(true); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchScore();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    const cached = appCache.get<ScoreData>('strength_score');
    if (cached) {
      setScoreData(cached);
      if (cached.history) setHistory(cached.history);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchScore().finally(() => setLoading(false));
  }, []));

  const rankColor = scoreData ? (SCORE_RANK_COLORS[scoreData.overall_rank.label] ?? colors.accent) : colors.accent;

  // Sweep the hero ring to the actual score whenever it changes. The count-up
  // number is driven by its own leaf component (AnimatedPercentText) rather
  // than state here — a listener that calls setState on this component would
  // re-render the entire screen (muscle diagram, all lift rows, chart) on
  // every animation tick, which is what made the sweep look janky.
  useEffect(() => {
    if (!scoreData) return;
    Animated.timing(ringAnim, {
      toValue: scoreData.overall / 100,
      duration: 1000,
      // Wait for the hero card's FadeInDown entrance (400ms) to finish before
      // starting the sweep — running both at once had the JS-thread-driven
      // ring (useNativeDriver:false is required for SVG stroke props) compete
      // with the UI-thread entrance transition, which was part of the jank.
      delay: 450,
      // Linear instead of an ease-out curve: cubic-out's per-frame delta
      // shrinks to near-nothing near the end, and at this animation's frame
      // rate (JS-thread driven, not native) that tail reads as a stutter
      // rather than a smooth settle. A constant rate looks steadier here.
      easing: Easing.linear,
      useNativeDriver: false, // SVG stroke props can't use the native driver
    }).start();
  }, [scoreData?.overall]);

  // Cap visible x-axis labels at ~5 (evenly spaced + always the last point) so
  // dense history doesn't overlap into unreadable clutter. Parsed via `Date`
  // (not string-sliced) so it's correct regardless of the exact ISO format
  // the backend sends — same approach ExerciseDetailScreen's charts use.
  const chartData = history.map((h, i) => {
    const d = new Date(h.date);
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    const labelEvery = history.length <= 6 ? 1 : Math.ceil(history.length / 5);
    const showLabel = i % labelEvery === 0 || i === history.length - 1;
    return { value: h.score, dateLabel, label: showLabel ? dateLabel : '' };
  });
  const CHART_W = Dimensions.get('window').width - spacing.md * 2 - spacing.sm * 2;

  // Coverage: how many of the 6 canonical Big-Lift slots actually have data —
  // the formula silently skips missing lifts rather than penalizing them, so
  // this is purely a transparency addition, not a scoring change.
  const big6TrackedCount = scoreData?.big6?.filter(e => e.has_data).length ?? 0;
  const firstMissingBig6 = scoreData?.big6?.find(e => !e.has_data);

  // Strongest / weakest relative lift — pure client-side derivation from data
  // already in scoreData, only meaningful with at least 2 tracked lifts.
  const trackedLifts = [...(scoreData?.big6 ?? []), ...(scoreData?.supplemental ?? [])]
    .filter(e => e.has_data && e.percentile != null);
  let strongestLift: typeof trackedLifts[number] | null = null;
  let weakestLift: typeof trackedLifts[number] | null = null;
  if (trackedLifts.length >= 2) {
    strongestLift = trackedLifts.reduce((a, b) => (b.percentile! > a.percentile! ? b : a));
    weakestLift = trackedLifts.reduce((a, b) => (b.percentile! < a.percentile! ? b : a));
  }

  // Bodyweight freshness — the score uses the live User.bodyweight scalar,
  // which can silently go stale if the user hasn't logged a new weigh-in.
  // Only nag when it's actually missing or old (>30 days).
  let bwFreshnessCaption: string | null = null;
  if (scoreData) {
    if (!scoreData.bodyweight_updated_at) {
      bwFreshnessCaption = 'No bodyweight logged — update it';
    } else {
      const daysSince = (Date.now() - new Date(scoreData.bodyweight_updated_at).getTime()) / 86400000;
      if (daysSince > 30) {
        const dateStr = new Date(scoreData.bodyweight_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        bwFreshnessCaption = `Bodyweight as of ${dateStr} — update it`;
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Strength Score</Text>
        <TouchableOpacity onPress={() => setInfoVisible(true)}>
          <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error && !scoreData ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Couldn't load score</Text>
          <Text style={styles.emptySubtitle}>Check your connection and pull down to refresh</Text>
        </View>
      ) : missingFields.length > 0 ? (
        <GateCard missingFields={missingFields} navigation={navigation} colors={colors} styles={styles} />
      ) : noData ? (
        <View style={styles.center}>
          <Ionicons name="barbell-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No exercise data yet</Text>
          <Text style={styles.emptySubtitle}>Log workouts to see your strength score</Text>
        </View>
      ) : scoreData ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        >

          {/* Rank-up celebration */}
          {rankUpVisible && (
            <Animated.View
              style={[
                styles.rankUpBanner,
                {
                  opacity: rankUpAnim,
                  transform: [{ scale: rankUpAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                },
              ]}
            >
              <LaurelBranch height={20} color={PR_GOLD_TEXT} />
              <Text style={styles.rankUpText}>Rank Up! {scoreData.overall_rank.display}</Text>
              <LaurelBranch side="right" height={20} color={PR_GOLD_TEXT} />
            </Animated.View>
          )}

          {/* Hero card */}
          <Reanimated.View entering={FadeInDown.duration(400)}>
            <View style={[styles.heroCard, { borderColor: rankColor }]}>
              <LinearGradient
                colors={[rankColor + '26', colors.surface]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.heroTopRow}>
                <View style={styles.ringWrap}>
                  <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                    <Circle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke={colors.border} strokeWidth={RING_STROKE} fill="none"
                    />
                    <AnimatedCircle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke={rankColor} strokeWidth={RING_STROKE} fill="none"
                      strokeDasharray={`${RING_CIRCUMFERENCE}`}
                      strokeDashoffset={ringAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [RING_CIRCUMFERENCE, 0],
                      })}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                    />
                  </Svg>
                  <View style={styles.ringCenter}>
                    <AnimatedPercentText anim={ringAnim} style={[styles.ringNum, { color: rankColor }]} />
                  </View>
                </View>
                <View style={styles.heroTextCol}>
                  <View style={[styles.rankBadge, { backgroundColor: rankColor + '22', borderColor: rankColor }]}>
                    <Text style={[styles.rankLabel, { color: rankColor }]}>{scoreData.overall_rank.display}</Text>
                  </View>
                  <Text style={styles.percentileText}>
                    Stronger than <AnimatedPercentText anim={ringAnim} style={styles.percentileText} />% of lifters
                  </Text>
                </View>
              </View>
              <Text style={styles.basedOn}>
                Based on {scoreData.exercises_used} exercise{scoreData.exercises_used !== 1 ? 's' : ''} across {scoreData.muscle_groups_used} muscle group{scoreData.muscle_groups_used !== 1 ? 's' : ''}
                {scoreData.last_updated ? `  ·  Updated ${timeAgo(scoreData.last_updated)}` : ''}
              </Text>
              {scoreData.age_adjusted && scoreData.age != null && (
                <View style={styles.ageBadge}>
                  <Text style={styles.ageBadgeText}>
                    Age-adjusted{scoreData.age_factor != null ? ` +${Math.round((scoreData.age_factor - 1) * 100)}%` : ''} · {scoreData.age}
                  </Text>
                </View>
              )}
              {bwFreshnessCaption && (
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'Measurements', initial: false })}
                >
                  <Text style={[styles.coverageText, { color: colors.accent }]}>{bwFreshnessCaption}</Text>
                </TouchableOpacity>
              )}
              {scoreData.big6 && (
                <Text style={[styles.coverageText, firstMissingBig6 && { color: colors.accent }]}>
                  {big6TrackedCount} of 6 Big Lifts tracked{firstMissingBig6 ? ` — try logging ${firstMissingBig6.exercise}` : ''}
                </Text>
              )}
              {strongestLift && weakestLift && strongestLift.exercise !== weakestLift.exercise && (
                <Text style={styles.insightText}>
                  Your {strongestLift.exercise} is your strongest relative lift; {weakestLift.exercise} has the most room to grow.
                </Text>
              )}
              {scoreData.greek_rank && (
                <TouchableOpacity
                  onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'GreekRank', initial: false })}
                >
                  <Text style={styles.greekTeaserText}>
                    Strength is 45% of your Greek Rank ({scoreData.greek_rank}) →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Reanimated.View>

          {/* Muscle Group Scores */}
          {scoreData.muscle_groups && scoreData.muscle_groups.length > 0 && (
            <Reanimated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={styles.sectionTitle}>Muscle Group Ranks</Text>
              <MuscleDiagram
                muscles={scoreData.muscle_groups.map(mg => mg.name)}
                muscleColors={Object.fromEntries(
                  scoreData.muscle_groups.map(mg => [mg.name, SCORE_RANK_COLORS[mg.rank.label] ?? colors.accent])
                )}
              />
              <View style={styles.legendRow}>
                {Object.entries(SCORE_RANK_COLORS).map(([label, color]) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.card}>
                {scoreData.muscle_groups.map((mg, i) => {
                  const mgColor = SCORE_RANK_COLORS[mg.rank.label] ?? colors.accent;
                  return (
                    <React.Fragment key={mg.name}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.mgRow}
                        onPress={() => { setSelectedGroup(mg); setGroupModalVisible(true); }}
                      >
                        <View style={styles.mgLeft}>
                          <Text style={styles.mgName}>{mg.name}</Text>
                          <AnimatedBar percent={mg.score} color={mgColor} trackColor={colors.border} delay={i * 40} />
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <View style={[styles.miniRankBadge, { backgroundColor: mgColor + '22', borderColor: mgColor }]}>
                            <Text style={[styles.miniRankText, { color: mgColor }]}>{mg.rank.display}</Text>
                          </View>
                          <Text style={styles.mgScore}>{mg.score}</Text>
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </Reanimated.View>
          )}

          {/* Big 6 Lifts */}
          {scoreData.big6 && (
            <Reanimated.View entering={FadeInDown.delay(200).duration(400)}>
              <Text style={styles.sectionTitle}>Big 6 Lifts</Text>
              <View style={styles.card}>
                {scoreData.big6.map((ex, i) => {
                  const exColor = ex.rank ? (SCORE_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
                  return (
                    <React.Fragment key={ex.exercise}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.exRow}
                        onPress={() => { setSelectedLift(ex); setLiftModalVisible(true); }}
                        activeOpacity={ex.has_data ? 0.7 : 1}
                        disabled={!ex.has_data}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 }}>
                            <Text style={[styles.exName, !ex.has_data && { color: colors.textSecondary }]}>{ex.exercise}</Text>
                            {ex.has_data && bwLbs && ex.estimated_1rm != null && ex.estimated_1rm > 0 && (
                              <Text style={[styles.bwMultiplier, { color: exColor }]}>
                                {(ex.estimated_1rm / bwLbs).toFixed(1)}× BW
                              </Text>
                            )}
                          </View>
                          {ex.has_data ? (
                            <AnimatedBar percent={Math.max(ex.percentile ?? 0, 8)} color={exColor} trackColor={colors.border} delay={i * 40} />
                          ) : (
                            <Text style={styles.noDataText}>No data logged</Text>
                          )}
                          {ex.has_data && (ex.percentile ?? 0) < 10 && (
                            <Text style={[styles.noDataText, { color: exColor }]}>{'< 10th percentile'}</Text>
                          )}
                        </View>
                        {ex.rank ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <View style={[styles.miniRankBadge, { backgroundColor: exColor + '22', borderColor: exColor }]}>
                              <Text style={[styles.miniRankText, { color: exColor }]}>{ex.rank.display}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </Reanimated.View>
          )}

          {/* More Lifts */}
          {scoreData.supplemental && scoreData.supplemental.length > 0 && (
            <Reanimated.View entering={FadeInDown.delay(300).duration(400)}>
              <Text style={styles.sectionTitle}>More Lifts</Text>
              {scoreData.coverage && (
                <Text style={styles.coverageText}>
                  {scoreData.coverage.compound.tracked} of {scoreData.coverage.compound.total} Compound Lifts tracked
                  {'  ·  '}
                  {scoreData.coverage.isolation.tracked} of {scoreData.coverage.isolation.total} Isolation Lifts tracked
                </Text>
              )}
              <View style={styles.card}>
                {scoreData.supplemental.map((ex, i) => {
                  const exColor = ex.rank ? (SCORE_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
                  return (
                    <React.Fragment key={ex.exercise}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.exRow}
                        onPress={() => { setSelectedLift(ex); setLiftModalVisible(true); }}
                        activeOpacity={ex.has_data ? 0.7 : 1}
                        disabled={!ex.has_data}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 }}>
                            <Text style={[styles.exName, !ex.has_data && { color: colors.textSecondary }]}>{ex.exercise}</Text>
                            {ex.has_data && bwLbs && ex.estimated_1rm != null && ex.estimated_1rm > 0 && (
                              <Text style={[styles.bwMultiplier, { color: exColor }]}>
                                {(ex.estimated_1rm / bwLbs).toFixed(1)}× BW
                              </Text>
                            )}
                          </View>
                          {ex.has_data ? (
                            <AnimatedBar percent={Math.max(ex.percentile ?? 0, 8)} color={exColor} trackColor={colors.border} delay={i * 40} />
                          ) : (
                            <Text style={styles.noDataText}>No data logged</Text>
                          )}
                          {ex.has_data && (ex.percentile ?? 0) < 10 && (
                            <Text style={[styles.noDataText, { color: exColor }]}>{'< 10th percentile'}</Text>
                          )}
                        </View>
                        {ex.rank ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            <View style={[styles.miniRankBadge, { backgroundColor: exColor + '22', borderColor: exColor }]}>
                              <Text style={[styles.miniRankText, { color: exColor }]}>{ex.rank.display}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </Reanimated.View>
          )}

          {/* Score History */}
          {chartData.length >= 2 && (() => {
            const scores = chartData.map(d => d.value);
            const NO_OF_SECTIONS = 4;
            // Snap the y-axis range to whole-number, evenly-divisible steps so
            // every section boundary lands on a clean integer (e.g. 55/68/81/94
            // instead of 57.3/68.6/...) rather than relying on label rounding alone.
            const rawMin = Math.max(0, Math.min(...scores) - 5);
            const rawMax = Math.min(100, Math.max(...scores) + 5);
            const step = Math.max(1, Math.ceil((rawMax - rawMin) / NO_OF_SECTIONS));
            const minV = Math.floor(rawMin / step) * step;
            const maxV = minV + step * NO_OF_SECTIONS;
            return (
              <Reanimated.View entering={FadeInDown.delay(400).duration(400)}>
                <Text style={styles.sectionTitle}>Score Over Time</Text>
                <View style={[styles.card, { padding: spacing.sm }]}>
                  <LineChart
                    data={chartData}
                    width={CHART_W}
                    height={140}
                    // Floor of 40 (not just enough to fit the points) so an "M/D"
                    // label always has room to render on one line — LineChart
                    // scrolls horizontally on its own once content exceeds
                    // CHART_W, so a long history just becomes swipeable instead
                    // of squeezing labels until they wrap/clip.
                    spacing={Math.max(40, Math.floor((CHART_W - 48) / (chartData.length - 1)))}
                    color={rankColor}
                    thickness={2}
                    dataPointsColor={rankColor}
                    dataPointsRadius={3.5}
                    startFillColor={rankColor}
                    endFillColor={colors.background}
                    startOpacity={0.16}
                    endOpacity={0}
                    areaChart
                    curved
                    rulesType="dashed"
                    rulesColor={colors.border}
                    rulesThickness={1}
                    yAxisTextStyle={styles.axisLabel}
                    yAxisLabelWidth={32}
                    xAxisLabelTextStyle={styles.axisLabel}
                    xAxisTextNumberOfLines={1}
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor={colors.border}
                    noOfSections={NO_OF_SECTIONS}
                    maxValue={maxV - minV}
                    yAxisOffset={minV}
                    roundToDigits={0}
                    initialSpacing={24}
                    endSpacing={24}
                    isAnimated
                    pointerConfig={{
                      activatePointersOnLongPress: true,
                      pointerStripColor: colors.border,
                      pointerStripWidth: 1,
                      pointerStripUptoDataPoint: true,
                      pointerColor: rankColor,
                      radius: 5,
                      pointerLabelWidth: 110,
                      pointerLabelHeight: 44,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: (items: typeof chartData) => (
                        <View style={styles.tooltipBubble}>
                          <Text style={styles.tooltipDate}>{items[0].dateLabel}</Text>
                          <Text style={styles.tooltipValue}>{Math.round(items[0].value)}%</Text>
                        </View>
                      ),
                    }}
                  />
                </View>
              </Reanimated.View>
            );
          })()}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      ) : null}

      {/* Lift detail modal */}
      <Modal visible={liftModalVisible} transparent animationType="slide" onRequestClose={() => setLiftModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setLiftModalVisible(false)}>
          <View style={styles.modalSheet}>
            {selectedLift?.has_data && (() => {
              const liftColor = selectedLift.rank ? (SCORE_RANK_COLORS[selectedLift.rank.label] ?? colors.accent) : colors.accent;
              const pct = selectedLift.percentile ?? 0;

              // Rank tier segments for the distribution bar
              const TIERS = STRENGTH_TIERS;
              // modalSheet has paddingHorizontal: spacing.lg on each side
              const BAR_W = Dimensions.get('window').width - spacing.lg * 2;

              return (
                <>
                  <View style={styles.modalHandle} />
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{selectedLift.exercise}</Text>

                  {/* Hero stat */}
                  <View style={styles.liftHero}>
                    <Text style={[styles.liftPercentileText, { color: liftColor }]}>
                      {pct < 10 ? '< 10th percentile' : `Stronger than ${Math.round(pct)}%`}
                    </Text>
                    {pct >= 10 && (
                      <Text style={styles.liftPercentileSub}>of all lifters</Text>
                    )}
                    {selectedLift.rank && (
                      <View style={[styles.miniRankBadge, { backgroundColor: liftColor + '22', borderColor: liftColor, alignSelf: 'center', marginTop: 4 }]}>
                        <Text style={[styles.miniRankText, { color: liftColor }]}>{selectedLift.rank.display}</Text>
                      </View>
                    )}
                    {selectedLift.estimated_1rm != null && (
                      <Text style={styles.liftOneRM}>Est. 1RM: {selectedLift.estimated_1rm} {scoreData?.weight_unit ?? 'lbs'}</Text>
                    )}
                  </View>

                  {/* Rank tier distribution bar */}
                  <Text style={[styles.sectionTitle, { marginTop: spacing.sm }]}>Where You Rank</Text>
                  <View style={{ marginTop: spacing.xs }}>
                    {/* Marker line */}
                    <View style={{ height: 12, position: 'relative', marginBottom: 2 }}>
                      <View style={[styles.markerTriangle, { left: (pct / 100) * BAR_W - 6 }]} />
                    </View>
                    {/* Segmented bar */}
                    <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden' }}>
                      {TIERS.map(tier => (
                        <View
                          key={tier.label}
                          style={{ flex: tier.high - tier.low, backgroundColor: tier.color, opacity: pct >= tier.low ? 1 : 0.25 }}
                        />
                      ))}
                    </View>
                    {/* Labels + weight thresholds */}
                    <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
                      {TIERS.map(tier => {
                        const threshold = (selectedLift as LiftEntry).thresholds?.find(t => t.rank === tier.label);
                        const reached = pct >= tier.low;
                        return (
                          <View key={tier.label} style={{ flex: tier.high - tier.low, alignItems: 'center' }}>
                            <Text style={[styles.tierBarLabel, { color: reached ? tier.color : colors.textSecondary }]} numberOfLines={1}>
                              {tier.label}
                            </Text>
                            {threshold && (
                              <Text style={[styles.tierBarWeight, { color: reached ? tier.color : colors.textSecondary }]} numberOfLines={1}>
                                {threshold.weight} {scoreData?.weight_unit ?? 'lbs'}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Tier sub-rank dots */}
                  {selectedLift.rank && (
                    <View style={[styles.tierRow, { marginTop: spacing.md }]}>
                      {[1, 2, 3].map(t => (
                        <View key={t} style={[styles.tierDot, { backgroundColor: t <= selectedLift.rank!.tier ? liftColor : colors.border }]} />
                      ))}
                      <Text style={[styles.tierLabel, { color: colors.textSecondary }]}>
                        Tier {selectedLift.rank.tier}/3 within {selectedLift.rank.label}
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Info modal */}
      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInfoVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>How We Calculate Your Score</Text>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Strength Percentile</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Your estimated 1RM for each exercise is compared against population standards adjusted for your gender and bodyweight. The result is a percentile — how you stack up against all lifters. Ranks go from Noobie → Beginner → Intermediate → Advanced → Elite → Legend.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Overall Score</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                The Big 6 lifts (Squat, Bench Press, Deadlift, Overhead Press, Barbell Row, Pull-up) count for 70% of your score. Other compound lifts (Romanian Deadlift, Incline Bench, Dips, etc.) count for 20%. Isolation exercises make up the remaining 10%. Your strength score also counts for 45% of your Greek rank.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Muscle Groups</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Each muscle group score is the average percentile of the exercises that train it. Log more exercises across a muscle group to make its score more accurate.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Estimated 1RM</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                If you haven't logged a true 1-rep max, we use the Epley formula — weight × (1 + reps ÷ 30) — applied to your best logged set for each exercise.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Muscle group detail modal */}
      <Modal visible={groupModalVisible} transparent animationType="slide" onRequestClose={() => setGroupModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGroupModalVisible(false)}>
          <View style={styles.modalSheet}>
            {selectedGroup && (() => {
              const mgColor = SCORE_RANK_COLORS[(selectedGroup as any).rank?.label] ?? colors.accent;
              return (
                <>
                  <View style={styles.modalHandle} />
                  <Text style={[styles.modalTitle, { color: mgColor }]}>{(selectedGroup as any).name}</Text>
                  <View style={[styles.miniRankBadge, { backgroundColor: mgColor + '22', borderColor: mgColor, alignSelf: 'center', marginBottom: spacing.md }]}>
                    <Text style={[styles.miniRankText, { color: mgColor }]}>{(selectedGroup as any).rank?.display}</Text>
                  </View>
                  <View style={styles.tierRow}>
                    {[1, 2, 3].map(t => (
                      <View key={t} style={[styles.tierDot, { backgroundColor: t <= ((selectedGroup as any).rank?.tier ?? 0) ? mgColor : colors.border }]} />
                    ))}
                    <Text style={[styles.tierLabel, { color: colors.textSecondary }]}>
                      Tier {(selectedGroup as any).rank?.tier}/3 within {(selectedGroup as any).rank?.label}
                    </Text>
                  </View>
                  <Text style={[styles.groupScore, { color: colors.textSecondary }]}>
                    Score: {(selectedGroup as any).score} / 100
                  </Text>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Renders a count-up number from an Animated.Value (0–1, scaled to 0–100).
// Kept as its own leaf component so the setState the listener fires ~60x/sec
// only re-renders this one small Text, not the whole screen — that cascading
// re-render (muscle diagram, every lift row, the chart) was what made the
// hero sweep look janky when the state lived on the parent instead.
function AnimatedPercentText({ anim, style }: { anim: Animated.Value; style: any }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value * 100)));
    return () => anim.removeListener(id);
  }, [anim]);
  return <Text style={style}>{display}</Text>;
}

// Self-contained animated percentile bar — each row owns its own Animated.Value
// so it animates in on mount/update without the parent needing to manage a
// shared array of refs (and naturally resets correctly if the row list changes,
// since each row is already keyed by exercise/muscle-group name at the call site).
function AnimatedBar({ percent, color, trackColor, delay = 0 }: { percent: number; color: string; trackColor: string; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: percent,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width can't use the native driver
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent]);
  return (
    <View style={[barStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          barStyles.fill,
          {
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
          },
        ]}
      />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

function GateCard({ missingFields, navigation, colors, styles }: any) {
  const needsGender = missingFields.includes('gender');
  const needsBw = missingFields.includes('bodyweight');
  return (
    <View style={styles.center}>
      <Ionicons name="person-outline" size={48} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>Set up your profile</Text>
      <Text style={styles.emptySubtitle}>
        {needsGender && needsBw
          ? 'Add your gender and log your bodyweight to see your strength score'
          : needsGender
          ? 'Add your gender to see your strength score'
          : 'Log your bodyweight to see your strength score'}
      </Text>
      {needsGender && (
        <TouchableOpacity
          style={[styles.gateBtn, { backgroundColor: colors.accent }]}
          onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'EditProfile', initial: false })}
        >
          <Text style={[styles.gateBtnText, { color: colors.accentText }]}>Complete Profile</Text>
        </TouchableOpacity>
      )}
      {needsBw && (
        <TouchableOpacity
          style={[
            styles.gateBtn,
            needsGender
              ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.accent }
              : { backgroundColor: colors.accent },
          ]}
          onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'Measurements', initial: false })}
        >
          <Text style={[styles.gateBtnText, { color: needsGender ? colors.accent : colors.accentText }]}>
            Log Bodyweight
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptySubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
    gateBtn: { marginTop: spacing.sm, borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    gateBtnText: { fontWeight: '700', fontSize: typography.fontSize.md },
    scroll: { padding: spacing.md, gap: spacing.md },
    heroCard: {
      backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden',
      padding: spacing.md, borderWidth: 1.5, gap: spacing.sm,
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
    ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    ringNum: { fontSize: typography.fontSize.xxl, fontWeight: '800' },
    heroTextCol: { flex: 1, gap: spacing.xs },
    rankBadge: {
      alignSelf: 'flex-start', borderRadius: radius.sm, borderWidth: 1,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    rankLabel: { fontSize: typography.fontSize.md, fontWeight: '700' },
    percentileText: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
    basedOn: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    coverageText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    insightText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    greekTeaserText: { fontSize: typography.fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: 4 },
    rankUpBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      backgroundColor: PR_GOLD, borderRadius: 10, padding: spacing.sm,
      justifyContent: 'center', marginBottom: spacing.xs,
    },
    rankUpText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: PR_GOLD_TEXT },
    tooltipBubble: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 8, padding: spacing.xs, alignItems: 'center',
    },
    tooltipDate: { fontSize: 10, color: colors.textSecondary },
    tooltipValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
    axisLabel: { fontSize: 10, color: colors.textSecondary },
    ageBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accent + '18',
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    ageBadgeText: { fontSize: typography.fontSize.xs, color: colors.accent, fontWeight: '600' },
    sectionTitle: {
      fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm,
    },
    card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
    mgRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
    },
    mgLeft: { flex: 1, gap: 6 },
    mgName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    mgScore: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    miniRankBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    miniRankText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    exRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    exName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    bwMultiplier: { fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.2 },
    noDataText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: spacing.xl * 2, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.sm,
    },
    modalHandle: {
      width: 40, height: 4, backgroundColor: colors.border,
      borderRadius: 2, alignSelf: 'center', marginBottom: spacing.sm,
    },
    modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', textAlign: 'center' },
    tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tierDot: { width: 12, height: 12, borderRadius: 6 },
    tierLabel: { fontSize: typography.fontSize.sm, marginLeft: spacing.xs },
    groupScore: { fontSize: typography.fontSize.sm, textAlign: 'center' },

    liftHero: { alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
    liftPercentileText: { fontSize: 36, fontWeight: '800' },
    liftPercentileSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    liftOneRM: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 4 },
    markerTriangle: {
      position: 'absolute',
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderTopWidth: 10,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: colors.textPrimary,
      top: 2,
    },
    tierBarLabel: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
    tierBarWeight: { fontSize: 7, textAlign: 'center', marginTop: 1 },
    infoSection: { gap: 4 },
    infoHeading: { fontSize: typography.fontSize.md, fontWeight: '700' },
    infoBody: { fontSize: typography.fontSize.sm, lineHeight: 20 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { fontSize: 11 },
  });
