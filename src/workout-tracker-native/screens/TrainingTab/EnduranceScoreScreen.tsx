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
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { captureAndShare } from '../../utils/shareCapture';
import { computeChartXFit, showChartXLabel, CHART_X_LABEL_WIDTH, CHART_Y_AXIS_WIDTH, CHART_EDGE_SPACING } from '../../utils/prFormat';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import EnduranceScoreShareCard from '../../components/share/EnduranceScoreShareCard';
import DistanceDetailModal from '../../components/DistanceDetailModal';
import { appCache } from '../../utils/appCache';
import { GPS_DISTANCE_UNIT_KEY, type DistanceUnit } from '../../utils/units';
import { fmtPaceForUnit, fmtRaceTime } from '../../utils/cardioFormat';
import { TrainingStackParamsList } from '../../navigation/types';
import { STRENGTH_TIERS, SCORE_RANK_COLORS, SCORE_RANK_ICONS } from '../../constants/strengthRanks';
import { toLocalDateStr, timeAgo } from '../../utils/date';
import ScoreRing, { AnimatedPercentText } from '../../components/ScoreRing';
import PercentileBar from '../../components/PercentileBar';
import SectionRule from '../../components/SectionRule';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'EnduranceScore'>;


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
  // Kept after close (visibility is separate) so the sheet doesn't empty mid-slide
  const [selectedDistance, setSelectedDistance] = useState<DistanceRow | null>(null);
  const [distanceModalVisible, setDistanceModalVisible] = useState(false);
  const heroAnim = useCollapseAnim(heroExpanded);
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

  const CHART_W = Dimensions.get('window').width - spacing.md * 2 - spacing.sm * 2;
  // Every point fits inside the card, so a long range compresses instead of scrolling
  const chartFit = computeChartXFit(rangedHistory.length, CHART_W, CHART_Y_AXIS_WIDTH, CHART_EDGE_SPACING);
  const chartData = rangedHistory.map((h, i) => {
    const d = new Date(h.date);
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    const showLabel = showChartXLabel(i, rangedHistory.length, chartFit.labelEvery);
    return {
      value: h.score,
      dateLabel,
      // Drawn wider than the library's spacing-wide label box and centered on
      // the point, so a date stays on one line however tightly points pack
      labelComponent: showLabel
        ? () => (
          <Text
            style={[styles.axisLabel, styles.xAxisDate, { marginLeft: (chartFit.spacing - CHART_X_LABEL_WIDTH) / 2 }]}
            numberOfLines={1}
          >
            {dateLabel}
          </Text>
        )
        : undefined,
    };
  });

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
    // Runners quote a finish time at every distance (a 1:50 400m, not a
    // 7:21/mi one). Pace is only worth adding from 5K up, where it's how a
    // race gets planned; the speed distances show the time alone.
    const showPace = row.tier === 'core';
    return (
      <React.Fragment key={row.label}>
        {i > 0 && <View style={styles.divider} />}
        <TouchableOpacity
          style={styles.distanceRow}
          activeOpacity={0.7}
          testID={`distance-row-${row.label}`}
          onPress={() => { setSelectedDistance(row); setDistanceModalVisible(true); }}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.distanceTitleRow}>
              <Text style={styles.distanceName}>{row.label}</Text>
              <Text style={[styles.raceTime, { color: rowColor }]}>
                {fmtRaceTime(row.pace_min_per_km * row.distance_km)}
              </Text>
              {showPace && (
                <Text style={styles.paceSecondary}>
                  {fmtPaceForUnit(row.pace_min_per_km, distanceUnit)}{paceUnitLabel}
                </Text>
              )}
            </View>
            <PercentileBar minPercent={MIN_BAR_PERCENT} percent={row.percentile} color={rowColor} trackColor={colors.border} delay={i * 40} />
            {next && (
              <Text style={styles.nextText}>
                {next.rank} at {fmtRaceTime(next.pace_min_per_km * row.distance_km)}
              </Text>
            )}
          </View>
          <View style={styles.rowTrailing}>
            <View style={[styles.miniRankBadge, { backgroundColor: rowColor + '22', borderColor: rowColor }]}>
              <Text style={[styles.miniRankText, { color: rowColor }]}>{row.rank.display}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
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
            longestDistance={data.distances[data.distances.length - 1].label}
            bestTime={fmtRaceTime(bestDistance.pace_min_per_km * bestDistance.distance_km)}
            bestTimeLabel={`${bestDistance.label} Time`}
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
              <LinearGradient colors={[rankColor + '26', colors.surface]} style={StyleSheet.absoluteFill} />
              <View style={styles.heroTopRow}>
                <ScoreRing anim={ringAnim} color={rankColor} trackColor={colors.border} />
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
                {/* The range, not a count: one 5K run fills in every shorter
                    distance too, so "5 distances" overstated what was logged */}
                {data.distances.length === 1
                  ? `Based on your ${data.distances[0].label} time`
                  : `Based on your times from ${data.distances[0].label} to ${data.distances[data.distances.length - 1].label}`}
                {data.last_updated ? `  ·  Updated ${timeAgo(data.last_updated)}` : ''}
              </Text>
              <Collapsible progress={heroAnim} expanded={heroExpanded} style={styles.heroCollapsible}>
                <View style={styles.heroExpandedBody}>
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
                </View>
              </Collapsible>
              <View style={styles.heroExpandToggle} pointerEvents="none">
                <Text style={styles.heroExpandText}>{heroExpanded ? 'Show less' : 'Show more'}</Text>
                <Animated.View
                  style={{ transform: [{ rotate: heroAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
                >
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                </Animated.View>
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
                        <PercentileBar minPercent={MIN_BAR_PERCENT} percent={info.best ?? 0} color={color} trackColor={colors.border} delay={i * 60} />
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
                      width={chartFit.plotWidth}
                      height={140}
                      spacing={chartFit.spacing}
                      disableScroll
                      // Dots merge into a smear once points pack this tight; the line still shows the trend
                      hideDataPoints={chartFit.spacing < 6}
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
                      yAxisLabelWidth={CHART_Y_AXIS_WIDTH}
                      xAxisTextNumberOfLines={1}
                      yAxisThickness={0}
                      xAxisThickness={1}
                      xAxisColor={colors.border}
                      noOfSections={NO_OF_SECTIONS}
                      maxValue={maxV - minV}
                      yAxisOffset={minV}
                      roundToDigits={0}
                      initialSpacing={CHART_EDGE_SPACING}
                      endSpacing={CHART_EDGE_SPACING}
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

      <DistanceDetailModal
        visible={distanceModalVisible}
        onClose={() => setDistanceModalVisible(false)}
        distance={selectedDistance}
        distanceUnit={distanceUnit}
      />

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

// Each row owns its Animated.Value so it animates on mount without the parent
// juggling an array of refs.

// Below this a bar reads as empty rather than as a low score.
const MIN_BAR_PERCENT = 8;


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
    // The card's `gap` still applies around the collapsed (0-height) wrapper,
    // so pull it back up by one gap and restore that space inside the body.
    heroCollapsible: { marginTop: -spacing.sm },
    heroExpandedBody: { gap: spacing.sm, paddingTop: spacing.sm },
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
    raceTime: { fontSize: typography.fontSize.sm, fontWeight: '700', letterSpacing: 0.2 },
    paceSecondary: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
    nextText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 3 },
    rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
    xAxisDate: { width: CHART_X_LABEL_WIDTH, textAlign: 'center' },
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
