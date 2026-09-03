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
import { captureAndShare } from '../../utils/shareCapture';
import { TrainingStackParamsList } from '../../navigation/types';
import MuscleDiagram from '../../components/MuscleDiagram';
import { STRENGTH_TIERS, SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../../constants/strengthRanks';
import LiftDetailModal, { type LiftEntry } from '../../components/LiftDetailModal';
import StrengthScoreShareCard from '../../components/StrengthScoreShareCard';
import { toLocalDateStr } from '../../utils/date';
import SectionRule from '../../components/SectionRule';

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
  supplemental_coverage?: Array<{ exercise: string; category: 'compound' | 'isolation'; has_data: boolean; true_1rm?: number | null }>;
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
  missing_for_strength?: string[];
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
  const [selectedLift, setSelectedLift] = useState<LiftEntry | null>(null);
  const [liftModalVisible, setLiftModalVisible] = useState(false);

  // Info modal
  const [infoVisible, setInfoVisible] = useState(false);

  // "More Lifts" coverage modal — which supplemental lifts are tracked vs. not
  const [coverageModalVisible, setCoverageModalVisible] = useState(false);

  // Hero card starts collapsed to just the score + based-on line
  const [heroExpanded, setHeroExpanded] = useState(false);

  // Score Over Time chart range — same client-side filter pattern as ExerciseDetailScreen
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | 'All'>('3M');

  const [refreshing, setRefreshing] = useState(false);

  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

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
        setMissingFields(Array.isArray(body.missing) ? body.missing : [body.missing]);
        return;
      }
      if (!res.ok) {
        if (__DEV__) console.warn('[StrengthScore] API error', res.status);
        setError(true);
        return;
      }
      const data: ScoreData = await res.json();
      // No strength lifts tracked (e.g. cardio-only user) — the endpoint still
      // returns 200 with a real Greek rank (the endurance leg and
      // consistency/dedication/volume don't need strength data), but this
      // screen is specifically about lifts, so it shows its own empty state.
      // missing_for_strength means the strength leg was skipped for a missing
      // profile field (bodyweight) — show the setup gate, not "no data".
      if (data.exercises_used === 0) {
        if (data.missing_for_strength?.length) {
          setMissingFields(data.missing_for_strength);
          setNoData(false);
        } else {
          setNoData(true);
          setMissingFields([]);
        }
        setError(false);
        return;
      }
      setScoreData(data);
      if (data.history) setHistory(data.history);
      setMissingFields([]);
      setNoData(false);
      setError(false);
      appCache.set('strength_score', data);
      checkRankUp(data);
    } catch (e) { if (__DEV__) console.warn('[StrengthScore] fetch failed', e); setError(true); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchScore();
    setRefreshing(false);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      await captureAndShare(shareCardRef, 'Share your Strength Score');
    } catch {
      // user cancelled or capture failed — no-op
    } finally {
      setSharing(false);
    }
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

  // Snapshots only save once per 24h, so "today" may not have one yet — append
  // the live score as today's point so the chart always ends on the current day.
  const historyWithToday = useMemo(() => {
    if (!scoreData) return history;
    const now = new Date();
    const last = history[history.length - 1];
    if (last && toLocalDateStr(new Date(last.date)) === toLocalDateStr(now)) return history;
    const localIso = `${toLocalDateStr(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    return [...history, { date: localIso, score: scoreData.overall }];
  }, [history, scoreData]);

  // Cap visible x-axis labels at ~5 (evenly spaced + always the last point) so
  // dense history doesn't overlap into unreadable clutter. Parsed via `Date`
  // (not string-sliced) so it's correct regardless of the exact ISO format
  // the backend sends — same approach ExerciseDetailScreen's charts use.
  const rangedHistory = useMemo(() => {
    if (chartRange === 'All') return historyWithToday;
    const months = chartRange === '1M' ? 1 : chartRange === '3M' ? 3 : 6;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return historyWithToday.filter(h => new Date(h.date) >= cutoff);
  }, [historyWithToday, chartRange]);
  const chartData = rangedHistory.map((h, i) => {
    const d = new Date(h.date);
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    const labelEvery = rangedHistory.length <= 6 ? 1 : Math.ceil(rangedHistory.length / 5);
    const showLabel = i % labelEvery === 0 || i === rangedHistory.length - 1;
    return { value: h.score, dateLabel, label: showLabel ? dateLabel : '' };
  });
  const CHART_W = Dimensions.get('window').width - spacing.md * 2 - spacing.sm * 2;

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
      bwFreshnessCaption = 'No bodyweight logged. Update it';
    } else {
      const daysSince = (Date.now() - new Date(scoreData.bodyweight_updated_at).getTime()) / 86400000;
      if (daysSince > 30) {
        const dateStr = new Date(scoreData.bodyweight_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        bwFreshnessCaption = `Bodyweight as of ${dateStr}. Update it`;
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Off-screen card for screenshot capture */}
      {scoreData && (
        <View
          ref={shareCardRef}
          style={{ position: 'absolute', left: -9999, top: -9999 }}
          collapsable={false}
        >
          <StrengthScoreShareCard
            score={scoreData.overall}
            rankLabel={scoreData.overall_rank.label}
            exercisesUsed={scoreData.exercises_used}
            muscleGroupsUsed={scoreData.muscle_groups_used}
            accentColor={rankColor}
            date={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            isRankUp={rankUpVisible}
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Strength Score</Text>
        <View style={styles.headerIcons}>
          {scoreData && (
            <TouchableOpacity onPress={handleShare} disabled={sharing} hitSlop={8}>
              {sharing ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setInfoVisible(true)}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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

          {/* Rank-up celebration — uses the achieved tier's own color/icon
              (not the PR/Aretē gold laurel) so it matches the same tier
              badge everywhere else on this screen instead of always reading
              gold regardless of which tier was actually reached. */}
          {rankUpVisible && (
            <Animated.View
              style={[
                styles.rankUpBanner,
                {
                  backgroundColor: rankColor + '22',
                  borderColor: rankColor,
                  opacity: rankUpAnim,
                  transform: [{ scale: rankUpAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                },
              ]}
            >
              <Ionicons name={SCORE_RANK_ICONS[scoreData.overall_rank.label] ?? 'star'} size={18} color={rankColor} />
              <Text style={[styles.rankUpText, { color: rankColor }]}>Rank Up! {scoreData.overall_rank.display}</Text>
              <TouchableOpacity onPress={handleShare} disabled={sharing} hitSlop={8} style={styles.rankUpShareBtn}>
                <Ionicons name="share-outline" size={16} color={rankColor} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Hero card */}
          <Reanimated.View entering={FadeInDown.duration(400)}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setHeroExpanded(v => !v)}
              style={[styles.heroCard, { borderColor: rankColor }]}
            >
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
                    <Ionicons name={SCORE_RANK_ICONS[scoreData.overall_rank.label] ?? 'ellipse-outline'} size={13} color={rankColor} />
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
              {heroExpanded && (
                <>
                  <Text style={styles.insightText}>
                    "Stronger than" compares your bodyweight-adjusted lifts to reference strength standards for your gender, not literally every lifter in the app.
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
                  {strongestLift && weakestLift && strongestLift.exercise !== weakestLift.exercise && (
                    <View style={styles.strongestWeakestRow}>
                      <View style={styles.strongestWeakestCol}>
                        <Text style={styles.strongestWeakestLabel}>Strongest</Text>
                        <Text style={styles.strongestWeakestValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                          {strongestLift.exercise}
                        </Text>
                      </View>
                      <View style={styles.strongestWeakestCol}>
                        <Text style={styles.strongestWeakestLabel}>Weakest</Text>
                        <Text style={styles.strongestWeakestValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                          {weakestLift.exercise}
                        </Text>
                      </View>
                    </View>
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
                </>
              )}
              <View style={styles.heroExpandToggle} pointerEvents="none">
                <Text style={styles.heroExpandText}>{heroExpanded ? 'Show less' : 'Show more'}</Text>
                <Ionicons name={heroExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </Reanimated.View>

          {/* Muscle Group Scores */}
          {scoreData.muscle_groups && scoreData.muscle_groups.length > 0 && (
            <Reanimated.View entering={FadeInDown.delay(100).duration(400)}>
              <SectionRule label="Muscle Group Ranks" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
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
                            <Ionicons name={SCORE_RANK_ICONS[mg.rank.label] ?? 'ellipse-outline'} size={10} color={mgColor} />
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
              <SectionRule label="Big 6 Lifts" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
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
                              <Ionicons name={SCORE_RANK_ICONS[ex.rank.label] ?? 'ellipse-outline'} size={10} color={exColor} />
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
              <View style={styles.moreLiftsTitleRow}>
                <SectionRule label="More Lifts" style={{ flex: 1, marginBottom: 0 }} fontSize={typography.fontSize.sm} />
                <TouchableOpacity onPress={() => setCoverageModalVisible(true)} hitSlop={8}>
                  <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
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
                              <Ionicons name={SCORE_RANK_ICONS[ex.rank.label] ?? 'ellipse-outline'} size={10} color={exColor} />
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
          {historyWithToday.length >= 2 && (() => {
            const scores = chartData.map(d => d.value);
            const NO_OF_SECTIONS = 4;
            // Snap the y-axis range to whole-number, evenly-divisible steps so
            // every section boundary lands on a clean integer (e.g. 55/68/81/94
            // instead of 57.3/68.6/...) rather than relying on label rounding alone.
            const rawMin = scores.length ? Math.max(0, Math.min(...scores) - 5) : 0;
            const rawMax = scores.length ? Math.min(100, Math.max(...scores) + 5) : 100;
            const step = Math.max(1, Math.ceil((rawMax - rawMin) / NO_OF_SECTIONS));
            const minV = Math.floor(rawMin / step) * step;
            const maxV = minV + step * NO_OF_SECTIONS;
            return (
              <Reanimated.View entering={FadeInDown.delay(400).duration(400)}>
                <View style={styles.moreLiftsTitleRow}>
                  <SectionRule label="Score Over Time" style={{ flex: 1, marginBottom: 0 }} fontSize={typography.fontSize.sm} />
                  <View style={styles.rangeToggle}>
                    {(['1M', '3M', '6M', 'All'] as const).map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.rangeBtn, chartRange === r && { backgroundColor: colors.accent + '22' }]}
                        onPress={() => setChartRange(r)}
                      >
                        <Text style={[styles.rangeBtnText, chartRange === r && { color: colors.accent, fontWeight: '700' }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={[styles.card, { padding: spacing.sm }]}>
                  {chartData.length >= 2 ? (
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
                  ) : (
                    <Text style={styles.noDataText}>Not enough history in this range</Text>
                  )}
                </View>
              </Reanimated.View>
            );
          })()}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      ) : null}

      {/* Lift detail modal */}
      <LiftDetailModal
        visible={liftModalVisible}
        onClose={() => setLiftModalVisible(false)}
        lift={selectedLift}
        weightUnit={scoreData?.weight_unit ?? 'lbs'}
      />

      {/* Info modal */}
      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInfoVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>How We Calculate Your Score</Text>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Strength Percentile</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Your estimated 1RM for each exercise is compared against population standards adjusted for your gender and bodyweight. The result is a percentile: how you stack up against all lifters. Ranks go from Noobie → Beginner → Intermediate → Advanced → Elite → Legend.
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
                If you haven't logged a true 1-rep max, we use the Epley formula (weight × (1 + reps ÷ 30)) applied to your best logged set for each exercise.
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
                    <Ionicons name={SCORE_RANK_ICONS[(selectedGroup as any).rank?.label] ?? 'ellipse-outline'} size={11} color={mgColor} />
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

      {/* "More Lifts" coverage page */}
      <Modal
        visible={coverageModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCoverageModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCoverageModalVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>More Lifts Coverage</Text>
            {scoreData?.supplemental_coverage ? (
              <Text style={[styles.coverageCountBadge, { color: colors.textSecondary }]}>
                {scoreData.supplemental_coverage.filter(c => c.has_data).length}/{scoreData.supplemental_coverage.length}
              </Text>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {(() => {
              const coverage = scoreData?.supplemental_coverage ?? [];
              const compound = coverage.filter(c => c.category === 'compound');
              const isolation = coverage.filter(c => c.category === 'isolation');

              const renderGrid = (items: typeof coverage) => (
                <View style={[styles.card, styles.coverageGrid]}>
                  {items.map(c => (
                    <View key={c.exercise} style={styles.coverageGridItem}>
                      <Ionicons
                        name={c.has_data ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={c.has_data ? colors.save : colors.textSecondary}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.coverageRowText, { color: c.has_data ? colors.textPrimary : colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {c.exercise}
                        </Text>
                        {c.true_1rm != null && (
                          <Text style={styles.coverageOneRm} numberOfLines={1}>
                            {c.true_1rm} {scoreData?.weight_unit ?? 'lbs'}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );

              return (
                <>
                  {compound.length > 0 && (
                    <>
                      <SectionRule label="Compound" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
                      {renderGrid(compound)}
                    </>
                  )}
                  {isolation.length > 0 && (
                    <>
                      <SectionRule label="Isolation" style={{ marginTop: spacing.md, marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
                      {renderGrid(isolation)}
                    </>
                  )}
                </>
              );
            })()}
          </ScrollView>
        </View>
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
    headerIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
      paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
      flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    rankLabel: { fontSize: typography.fontSize.md, fontWeight: '700' },
    percentileText: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
    basedOn: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    coverageText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    insightText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    strongestWeakestRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
    strongestWeakestCol: { flex: 1 },
    strongestWeakestLabel: {
      fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    strongestWeakestValue: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
    greekTeaserText: { fontSize: typography.fontSize.sm, color: colors.accent, fontWeight: '600', marginTop: spacing.xs },
    heroExpandToggle: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
      marginTop: spacing.sm, paddingVertical: spacing.xs,
    },
    heroExpandText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
    rangeToggle: {
      flexDirection: 'row', backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm + 2, padding: 2,
    },
    rangeBtn: { paddingVertical: spacing.xs, paddingHorizontal: 12, borderRadius: radius.sm, alignItems: 'center' },
    rangeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    rankUpBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      borderRadius: 10, borderWidth: 1, padding: spacing.sm,
      justifyContent: 'center', marginBottom: spacing.xs,
    },
    rankUpText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    rankUpShareBtn: { marginLeft: spacing.xs },
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
    card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
    mgRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
    },
    mgLeft: { flex: 1, gap: 6 },
    mgName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    mgScore: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    miniRankBadge: {
      borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2,
      flexDirection: 'row', alignItems: 'center', gap: 3,
    },
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

    infoSection: { gap: spacing.xs },
    infoHeading: { fontSize: typography.fontSize.md, fontWeight: '700' },
    infoBody: { fontSize: typography.fontSize.sm, lineHeight: 20 },
    moreLiftsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, marginBottom: spacing.sm },
    coverageCountBadge: { fontSize: typography.fontSize.md, fontWeight: '700' },
    coverageGrid: {
      flexDirection: 'row', flexWrap: 'wrap', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    },
    coverageGridItem: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
      width: '50%', paddingHorizontal: spacing.xs, paddingVertical: spacing.sm,
    },
    coverageRowText: { fontSize: typography.fontSize.md, flexShrink: 1 },
    coverageOneRm: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { fontSize: typography.fontSize.xs },
  });
