import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Dimensions, RefreshControl, Animated,
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
import { captureAndShare } from '../../utils/shareCapture';
import EnduranceScoreShareCard from '../../components/EnduranceScoreShareCard';
import { appCache } from '../../utils/appCache';
import { GPS_DISTANCE_UNIT_KEY, type DistanceUnit } from '../../utils/units';
import { fmtPaceForUnit } from '../../utils/cardioFormat';
import { TrainingStackParamsList } from '../../navigation/types';
import { STRENGTH_TIERS, SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../../constants/strengthRanks';
import { toLocalDateStr } from '../../utils/date';
import SectionRule from '../../components/SectionRule';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'EnduranceScore'>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 108;
const RING_STROKE = 10;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// Endurance keeps its own last-celebrated tier: ranking up as a runner is a
// separate event from ranking up as a lifter.
const LAST_TIER_KEY = 'endurance_score_last_tier';

type Rank = { label: string; tier: number; display: string };
type Threshold = { percentile: number; rank: string; pace_min_per_km: number };

interface DistanceRow {
  distance_km: number;
  label: string;
  pace_min_per_km: number;
  percentile: number;
  rank: Rank;
  tier: 'core' | 'speed';
  thresholds: Threshold[];
}

interface HistoryPoint { date: string; score: number }

interface EnduranceData {
  overall: number | null;
  overall_rank: Rank | null;
  distances: DistanceRow[];
  distances_tracked: number;
  tiers: {
    core: { best: number | null; weight: number };
    speed: { best: number | null; weight: number };
  };
  age: number | null;
  age_factor: number;
  age_adjusted: boolean;
  history: HistoryPoint[];
  last_updated?: string;
}

function timeAgo(isoStr: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function EnduranceScoreScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const uid = user?.id;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<EnduranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [missingGender, setMissingGender] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | 'All'>('3M');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  // Hero ring — the count-up number is its own leaf component so its per-frame
  // re-render doesn't cascade through the distance rows and chart.
  const ringAnim = useRef(new Animated.Value(0)).current;
  const [rankUpVisible, setRankUpVisible] = useState(false);
  const rankUpAnim = useRef(new Animated.Value(0)).current;

  // Only fires when the tier is strictly higher than the last one seen. A
  // brand-new key is seeded silently, or every existing runner would get a
  // false rank-up the first time this screen ships.
  const checkRankUp = async (next: EnduranceData) => {
    if (!uid || !next.overall_rank) return;
    const tierIdx = STRENGTH_TIERS.findIndex(t => t.label === next.overall_rank!.label);
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
      const res = await apiFetch('/api/stats/endurance-score');
      if (res.status === 422) {
        setMissingGender(true);
        return;
      }
      if (!res.ok) {
        if (__DEV__) console.warn('[EnduranceScore] API error', res.status);
        setError(true);
        return;
      }
      const next: EnduranceData = await res.json();
      setData(next);
      setMissingGender(false);
      setError(false);
      appCache.set('endurance_score', next);
      checkRankUp(next);
    } catch (e) {
      if (__DEV__) console.warn('[EnduranceScore] fetch failed', e);
      setError(true);
    }
  };

  useFocusEffect(useCallback(() => {
    // Re-read on focus, not just on mount: this screen stays mounted while the
    // user changes the unit over in Settings, so a mount-only read goes stale.
    if (uid) {
      AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${uid}`).then(v => {
        setDistanceUnit(v === 'km' ? 'km' : 'mi');
      });
    }

    const cached = appCache.get<EnduranceData>('endurance_score');
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchScore().finally(() => setLoading(false));
  }, [uid]));

  const overall = data?.overall ?? null;
  const rankColor = data?.overall_rank
    ? (SCORE_RANK_COLORS[data.overall_rank.label] ?? colors.accent)
    : colors.accent;

  // Sweep the ring to the score. useNativeDriver is off because SVG stroke
  // props can't use it; the count-up text drives its own state instead of
  // this component's, so the sweep doesn't re-render the whole screen.
  useEffect(() => {
    if (overall == null) return;
    Animated.timing(ringAnim, {
      toValue: overall / 100,
      duration: 1000,
      delay: 450,
      useNativeDriver: false,
    }).start();
  }, [overall]);

  const handleShare = async () => {
    setSharing(true);
    try {
      await captureAndShare(shareCardRef, 'Share your Endurance Score');
    } catch {
      // user cancelled or capture failed - no-op
    } finally {
      setSharing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchScore();
    setRefreshing(false);
  };

  // Snapshots only save once per 24h, so today may have no point yet — append
  // the live score so the chart always ends on the current day.
  const historyWithToday = useMemo(() => {
    const history = data?.history ?? [];
    if (overall == null) return history;
    const now = new Date();
    const last = history[history.length - 1];
    if (last && toLocalDateStr(new Date(last.date)) === toLocalDateStr(now)) return history;
    const localIso = `${toLocalDateStr(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    return [...history, { date: localIso, score: overall }];
  }, [data?.history, overall]);

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

  const paceUnitLabel = distanceUnit === 'mi' ? '/mi' : '/km';

  // The distance the score actually leans on - the strongest percentile
  const bestDistance = useMemo(() => {
    if (!data?.distances.length) return null;
    return data.distances.reduce((a, b) => (b.percentile > a.percentile ? b : a));
  }, [data?.distances]);

  const renderDistanceRow = (row: DistanceRow, i: number) => {
    const rowColor = SCORE_RANK_COLORS[row.rank.label] ?? colors.accent;
    // The first boundary above the current percentile is what to chase next
    const next = row.thresholds.find(t => t.percentile > row.percentile);
    return (
      <React.Fragment key={row.label}>
        {i > 0 && <View style={styles.divider} />}
        <View style={styles.distanceRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.distanceTitleRow}>
              <Text style={styles.distanceName}>{row.label}</Text>
              <Text style={[styles.pace, { color: rowColor }]}>
                {fmtPaceForUnit(row.pace_min_per_km, distanceUnit)}{paceUnitLabel}
              </Text>
            </View>
            <AnimatedBar percent={row.percentile} color={rowColor} trackColor={colors.border} delay={i * 40} />
            {next && (
              <Text style={styles.nextText}>
                {next.rank} at {fmtPaceForUnit(next.pace_min_per_km, distanceUnit)}{paceUnitLabel}
              </Text>
            )}
          </View>
          <View style={[styles.miniRankBadge, { backgroundColor: rowColor + '22', borderColor: rowColor }]}>
            <Text style={[styles.miniRankText, { color: rowColor }]}>{row.rank.display}</Text>
          </View>
        </View>
      </React.Fragment>
    );
  };

  const coreRows = data?.distances.filter(d => d.tier === 'core') ?? [];
  const speedRows = data?.distances.filter(d => d.tier === 'speed') ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Off-screen card for screenshot capture */}
      {data && data.overall != null && data.overall_rank && bestDistance && (
        <View
          ref={shareCardRef}
          style={styles.offscreenCard}
          collapsable={false}
        >
          <EnduranceScoreShareCard
            score={data.overall}
            rankLabel={data.overall_rank.label}
            distancesTracked={data.distances_tracked}
            bestPace={`${fmtPaceForUnit(bestDistance.pace_min_per_km, distanceUnit)}${paceUnitLabel}`}
            bestPaceLabel={`${bestDistance.label} Pace`}
            accentColor={rankColor}
            date={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            isRankUp={rankUpVisible}
          />
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Endurance Score</Text>
        <View style={styles.headerIcons}>
          {overall != null && (
            <TouchableOpacity onPress={handleShare} disabled={sharing} hitSlop={8}>
              {sharing
                ? <ActivityIndicator size="small" color={colors.textPrimary} />
                : <Ionicons name="share-outline" size={22} color={colors.textPrimary} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setInfoVisible(true)}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Couldn't Load Score</Text>
          <Text style={styles.emptySubtitle}>Check your connection and pull down to refresh.</Text>
        </View>
      ) : missingGender ? (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Set Up Your Profile</Text>
          <Text style={styles.emptySubtitle}>Pace standards differ by gender, so add yours to see your Endurance Score.</Text>
          <TouchableOpacity
            style={[styles.gateBtn, { backgroundColor: colors.accent }]}
            onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'EditProfile', initial: false })}
          >
            <Text style={[styles.gateBtnText, { color: colors.accentText }]}>Complete Profile</Text>
          </TouchableOpacity>
        </View>
      ) : overall == null ? (
        <View style={styles.center}>
          <Ionicons name="walk-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Runs Yet</Text>
          <Text style={styles.emptySubtitle}>Log a run to see how your pace ranks. Every run also scores the shorter distances inside it.</Text>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        >
          {rankUpVisible && data.overall_rank && (
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
              <Ionicons name={SCORE_RANK_ICONS[data.overall_rank.label] ?? 'star'} size={18} color={rankColor} />
              <Text style={[styles.rankUpText, { color: rankColor }]}>
                {`You've reached ${data.overall_rank.display}`}
              </Text>
              <TouchableOpacity onPress={handleShare} disabled={sharing} hitSlop={8} style={styles.rankUpShareBtn}>
                <Ionicons name="share-outline" size={16} color={rankColor} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Hero */}
          <Reanimated.View entering={FadeInDown.duration(400)}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setHeroExpanded(v => !v)}
              style={[styles.heroCard, { borderColor: rankColor }]}
            >
              <LinearGradient colors={[rankColor + '26', colors.surface]} style={StyleSheet.absoluteFillObject} />
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
                  {data.overall_rank && (
                    <View style={[styles.rankBadge, { backgroundColor: rankColor + '22', borderColor: rankColor }]}>
                      <Ionicons name={SCORE_RANK_ICONS[data.overall_rank.label] ?? 'ellipse-outline'} size={13} color={rankColor} />
                      <Text style={[styles.rankLabel, { color: rankColor }]}>{data.overall_rank.display}</Text>
                    </View>
                  )}
                  <Text style={styles.percentileText}>
                    Faster than <AnimatedPercentText anim={ringAnim} style={styles.percentileText} />% of runners
                  </Text>
                </View>
              </View>
              <Text style={styles.basedOn}>
                Based on {data.distances_tracked} distance{data.distances_tracked !== 1 ? 's' : ''}
                {data.last_updated ? `  ·  Updated ${timeAgo(data.last_updated)}` : ''}
              </Text>
              {heroExpanded && (
                <>
                  <Text style={styles.insightText}>
                    "Faster than" compares your best pace at each distance to reference pace standards for your gender, not literally every runner in the app.
                  </Text>
                  {data.age_adjusted && data.age != null && (
                    <View style={styles.ageBadge}>
                      <Text style={styles.ageBadgeText}>
                        Age-adjusted +{Math.round((data.age_factor - 1) * 100)}% · {data.age}
                      </Text>
                    </View>
                  )}
                </>
              )}
              <View style={styles.heroExpandToggle} pointerEvents="none">
                <Text style={styles.heroExpandText}>{heroExpanded ? 'Show less' : 'Show more'}</Text>
                <Ionicons name={heroExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </Reanimated.View>

          {/* Tier split */}
          <Reanimated.View entering={FadeInDown.delay(100).duration(400)}>
            <SectionRule label="Score Breakdown" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
            <View style={styles.card}>
              {([
                { key: 'core' as const, label: 'Endurance', caption: '5K and longer' },
                { key: 'speed' as const, label: 'Speed', caption: '1 Mile and shorter' },
              ]).map((tier, i) => {
                const info = data.tiers[tier.key];
                const color = colors.accent;
                return (
                  <React.Fragment key={tier.key}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={styles.tierRow}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={styles.tierName}>
                          {tier.label} <Text style={styles.tierWeight}>{Math.round(info.weight * 100)}%</Text>
                        </Text>
                        <AnimatedBar percent={info.best ?? 0} color={color} trackColor={colors.border} delay={i * 60} />
                        <Text style={styles.tierCaption}>
                          {info.best == null ? `No ${tier.caption} times yet` : `Best: ${Math.round(info.best)} · ${tier.caption}`}
                        </Text>
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </Reanimated.View>

          {/* Distances */}
          {coreRows.length > 0 && (
            <Reanimated.View entering={FadeInDown.delay(200).duration(400)}>
              <SectionRule label="Endurance Distances" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
              <View style={styles.card}>{coreRows.map(renderDistanceRow)}</View>
            </Reanimated.View>
          )}

          {speedRows.length > 0 && (
            <Reanimated.View entering={FadeInDown.delay(300).duration(400)}>
              <SectionRule label="Speed Distances" style={{ marginBottom: spacing.sm }} fontSize={typography.fontSize.sm} />
              <View style={styles.card}>{speedRows.map(renderDistanceRow)}</View>
              <Text style={styles.editHint}>
                Shorter distances are taken from your longer runs unless you log intervals as separate sets, so they read slower than an all-out effort.
              </Text>
            </Reanimated.View>
          )}

          {/* History */}
          {historyWithToday.length >= 2 && (() => {
            const scores = chartData.map(d => d.value);
            const NO_OF_SECTIONS = 4;
            const rawMin = scores.length ? Math.max(0, Math.min(...scores) - 5) : 0;
            const rawMax = scores.length ? Math.min(100, Math.max(...scores) + 5) : 100;
            const step = Math.max(1, Math.ceil((rawMax - rawMin) / NO_OF_SECTIONS));
            const minV = Math.floor(rawMin / step) * step;
            const maxV = minV + step * NO_OF_SECTIONS;
            return (
              <Reanimated.View entering={FadeInDown.delay(400).duration(400)}>
                <View style={styles.chartTitleRow}>
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
                    <Text style={styles.noDataText}>Not enough history in this range.</Text>
                  )}
                </View>
              </Reanimated.View>
            );
          })()}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      ) : null}

      <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInfoVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>How We Calculate Your Score</Text>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Pace Percentile</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Your best time at each distance becomes a pace, compared against reference pace standards for your gender. The result is a percentile: how your pace stacks up against recreational runners.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Overall Score</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Endurance distances (5K, 10K, Half, Marathon) count for 70%, speed distances (400m through 1 Mile) for 30%. Each tier uses your best distance rather than an average, because every distance inside a run comes from that same run. A tier you have no times for drops out and the other counts fully.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Your Greek Rank</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Your Greek Rank takes whichever is higher, your Endurance Score or your Strength Score, so running and lifting never dilute each other.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Which Runs Count</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Runs logged against the Running exercise, outdoor or treadmill. Every run also scores the shorter distances inside it, so a 5K gives you a mile time too.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Count-up number from an Animated.Value (0-1, scaled to 0-100). Kept as its
// own leaf so the ~60fps setState only re-renders this Text, not the screen.
function AnimatedPercentText({ anim, style }: { anim: Animated.Value; style: any }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value * 100)));
    return () => anim.removeListener(id);
  }, [anim]);
  return <Text style={style}>{display}</Text>;
}

// Each row owns its Animated.Value so it animates on mount without the parent
// juggling an array of refs.
function AnimatedBar({ percent, color, trackColor, delay = 0 }: { percent: number; color: string; trackColor: string; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // A real but tiny percentile still gets a visible sliver; a missing one
    // (0) stays empty, so "no times yet" doesn't look like a bad score.
    Animated.timing(anim, {
      toValue: percent > 0 ? Math.max(percent, MIN_BAR_PERCENT) : 0,
      duration: 700,
      delay,
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

// Below this a bar reads as empty rather than as a low score.
const MIN_BAR_PERCENT = 8;

const barStyles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
    headerIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    offscreenCard: { position: 'absolute', left: -9999, top: -9999 },
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
    insightText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    ageBadge: {
      alignSelf: 'flex-start', backgroundColor: colors.accent + '18',
      borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 3,
    },
    ageBadgeText: { fontSize: typography.fontSize.xs, color: colors.accent, fontWeight: '600' },
    heroExpandToggle: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
      marginTop: spacing.sm, paddingVertical: spacing.xs,
    },
    heroExpandText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },

    card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },

    tierRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    tierName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    tierWeight: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
    tierCaption: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

    distanceRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    distanceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
    distanceName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    pace: { fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.2 },
    nextText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 3 },
    miniRankBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    miniRankText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    editHint: {
      fontSize: typography.fontSize.xs, color: colors.textSecondary,
      textAlign: 'center', marginTop: spacing.sm, lineHeight: 16,
    },
    noDataText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },

    chartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, marginBottom: spacing.sm },
    rangeToggle: {
      flexDirection: 'row', backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm + 2, padding: 2,
    },
    rangeBtn: { paddingVertical: spacing.xs, paddingHorizontal: 12, borderRadius: radius.sm, alignItems: 'center' },
    rangeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    axisLabel: { fontSize: 10, color: colors.textSecondary },
    tooltipBubble: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 8, padding: spacing.xs, alignItems: 'center',
    },
    tooltipDate: { fontSize: 10, color: colors.textSecondary },
    tooltipValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },

    rankUpBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      borderRadius: 10, borderWidth: 1, padding: spacing.sm,
      justifyContent: 'center', marginBottom: spacing.xs,
    },
    rankUpText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    rankUpShareBtn: { marginLeft: spacing.xs },

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
    infoSection: { gap: spacing.xs },
    infoHeading: { fontSize: typography.fontSize.md, fontWeight: '700' },
    infoBody: { fontSize: typography.fontSize.sm, lineHeight: 20 },
  });
