import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { appCache } from '../../utils/appCache';
import { TrainingStackParamsList } from '../../navigation/types';
import MuscleDiagram from '../../components/MuscleDiagram';
import { GREEK_RANK_COLORS } from '../../constants/greekRanks';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'StrengthScore'>;

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
  weight_unit?: 'lbs' | 'kg';
  last_updated?: string;
  history?: HistoryPoint[];
}

interface HistoryPoint { date: string; score: number }
type MuscleGroup = { name: string; score: number; rank: { label: string; tier: number; display: string } };

export default function StrengthScoreScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
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

  const rankColor = scoreData ? (GREEK_RANK_COLORS[scoreData.overall_rank.label] ?? colors.accent) : colors.accent;

  const chartData = history.map(h => ({ value: h.score }));
  const CHART_W = Dimensions.get('window').width - spacing.md * 2 - spacing.sm * 2;
  const CHART_H = 100;

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

          {/* Hero card */}
          <View style={[styles.heroCard, { borderColor: rankColor }]}>
            <View style={[styles.rankBadge, { backgroundColor: rankColor + '22', borderColor: rankColor }]}>
              <Text style={[styles.rankLabel, { color: rankColor }]}>{scoreData.overall_rank.display}</Text>
            </View>
            <Text style={styles.percentileText}>
              Stronger than {Math.round(scoreData.overall)}% of lifters
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${scoreData.overall}%` as any, backgroundColor: rankColor }]} />
            </View>
            <Text style={styles.basedOn}>
              Based on {scoreData.exercises_used} exercise{scoreData.exercises_used !== 1 ? 's' : ''} across {scoreData.muscle_groups_used} muscle group{scoreData.muscle_groups_used !== 1 ? 's' : ''}
              {scoreData.last_updated ? `  ·  Updated ${timeAgo(scoreData.last_updated)}` : ''}
            </Text>
            {scoreData.age_adjusted && scoreData.age != null && (
              <View style={styles.ageBadge}>
                <Text style={styles.ageBadgeText}>Age-adjusted · {scoreData.age}</Text>
              </View>
            )}
          </View>

          {/* Muscle Group Scores */}
          {scoreData.muscle_groups && scoreData.muscle_groups.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Muscle Group Ranks</Text>
              <MuscleDiagram
                muscles={scoreData.muscle_groups.map(mg => mg.name)}
                muscleColors={Object.fromEntries(
                  scoreData.muscle_groups.map(mg => [mg.name, GREEK_RANK_COLORS[mg.rank.label] ?? colors.accent])
                )}
              />
              <View style={styles.legendRow}>
                {Object.entries(GREEK_RANK_COLORS).map(([label, color]) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.card}>
                {scoreData.muscle_groups.map((mg, i) => {
                  const mgColor = GREEK_RANK_COLORS[mg.rank.label] ?? colors.accent;
                  return (
                    <React.Fragment key={mg.name}>
                      {i > 0 && <View style={styles.divider} />}
                      <TouchableOpacity
                        style={styles.mgRow}
                        onPress={() => { setSelectedGroup(mg); setGroupModalVisible(true); }}
                      >
                        <View style={styles.mgLeft}>
                          <Text style={styles.mgName}>{mg.name}</Text>
                          <View style={styles.mgBarTrack}>
                            <View style={[styles.mgBarFill, { width: `${mg.score}%` as any, backgroundColor: mgColor }]} />
                          </View>
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
            </>
          )}

          {/* Big 6 Lifts */}
          {scoreData.big6 && (
            <>
              <Text style={styles.sectionTitle}>Big 6 Lifts</Text>
              <View style={styles.card}>
                {scoreData.big6.map((ex, i) => {
                  const exColor = ex.rank ? (GREEK_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
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
                            <View style={styles.mgBarTrack}>
                              <View style={[styles.mgBarFill, {
                                width: `${Math.max(ex.percentile ?? 0, 8)}%` as any,
                                backgroundColor: exColor,
                              }]} />
                            </View>
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
            </>
          )}

          {/* More Lifts */}
          {scoreData.supplemental && scoreData.supplemental.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>More Lifts</Text>
              <View style={styles.card}>
                {scoreData.supplemental.map((ex, i) => {
                  const exColor = ex.rank ? (GREEK_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
                  return (
                    <React.Fragment key={ex.exercise}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.exRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exName}>{ex.exercise}</Text>
                          <View style={styles.mgBarTrack}>
                            <View style={[styles.mgBarFill, {
                              width: `${Math.max(ex.percentile ?? 0, 8)}%` as any,
                              backgroundColor: exColor,
                            }]} />
                          </View>
                          {(ex.percentile ?? 0) < 10 && (
                            <Text style={[styles.noDataText, { color: exColor }]}>{'< 10th percentile'}</Text>
                          )}
                        </View>
                        {ex.rank && (
                          <View style={[styles.miniRankBadge, { backgroundColor: exColor + '22', borderColor: exColor }]}>
                            <Text style={[styles.miniRankText, { color: exColor }]}>{ex.rank.display}</Text>
                          </View>
                        )}
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>
            </>
          )}

          {/* Score History */}
          {chartData.length >= 2 && (() => {
            const scores = chartData.map(d => d.value);
            const minV = Math.max(0, Math.min(...scores) - 5);
            const maxV = Math.min(100, Math.max(...scores) + 5);
            const range = maxV - minV || 1;
            const pts = scores.map((v, i) => ({
              x: (i / (scores.length - 1)) * CHART_W,
              y: CHART_H - ((v - minV) / range) * CHART_H,
            }));
            const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            const areaPath = `${linePath} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;
            return (
              <>
                <Text style={styles.sectionTitle}>Score Over Time</Text>
                <View style={[styles.card, { padding: spacing.sm }]}>
                  <Svg width={CHART_W} height={CHART_H}>
                    <Path d={areaPath} fill={rankColor} opacity={0.15} />
                    <Path d={linePath} stroke={rankColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {scores.length <= 10 && pts.map((p, i) => (
                      <SvgCircle key={i} cx={p.x} cy={p.y} r={3.5} fill={rankColor} />
                    ))}
                  </Svg>
                  <View style={styles.chartLabels}>
                    <Text style={styles.chartLabel}>{history[0].date.slice(0, 10)}</Text>
                    <Text style={styles.chartLabel}>{history[history.length - 1].date.slice(0, 10)}</Text>
                  </View>
                </View>
              </>
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
              const liftColor = selectedLift.rank ? (GREEK_RANK_COLORS[selectedLift.rank.label] ?? colors.accent) : colors.accent;
              const pct = selectedLift.percentile ?? 0;

              // Rank tier segments for the distribution bar
              const TIERS = [
                { label: 'Noobie',       low: 0,  high: 10,  color: '#888888' },
                { label: 'Beginner',     low: 10, high: 30,  color: '#4A9EFF' },
                { label: 'Intermediate', low: 30, high: 60,  color: '#4CAF50' },
                { label: 'Advanced',     low: 60, high: 80,  color: '#FF9800' },
                { label: 'Elite',        low: 80, high: 95,  color: '#9C27B0' },
                { label: 'Legend',       low: 95, high: 100, color: '#FFD700' },
              ];
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
                Your estimated 1-rep max (1RM) for each exercise is compared against population standards adjusted for your gender and bodyweight. The result is a percentile — how you rank against all lifters.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Overall Score</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                The Big 6 lifts (Squat, Bench, Deadlift, Overhead Press, Row, Pull-up) count for 70% of your overall score. All other exercises contribute the remaining 30%.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Muscle Groups</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Each muscle group score is the average percentile of the exercises that train it. Log more exercises to make each group more accurate.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={[styles.infoHeading, { color: colors.textPrimary }]}>Estimated 1RM</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                If you haven't performed a true 1-rep max, we use the Epley formula (weight × (1 + reps ÷ 30)) applied to your best logged set.
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
              const mgColor = GREEK_RANK_COLORS[(selectedGroup as any).rank?.label] ?? colors.accent;
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

function GateCard({ missingFields, navigation, colors, styles }: any) {
  const needsGender = missingFields.includes('gender');
  const needsBw = missingFields.includes('bodyweight');
  return (
    <View style={styles.center}>
      <Ionicons name="person-outline" size={48} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>Set up your profile</Text>
      <Text style={styles.emptySubtitle}>
        {needsGender && needsBw
          ? 'Add your gender and bodyweight to see your strength score'
          : needsGender
          ? 'Add your gender in Settings to see your strength score'
          : 'Add your bodyweight in your profile to see your strength score'}
      </Text>
      <TouchableOpacity
        style={[styles.gateBtn, { backgroundColor: colors.accent }]}
        onPress={() => (navigation as any).navigate('ProfileTab', { screen: 'EditProfile' })}
      >
        <Text style={[styles.gateBtnText, { color: colors.accentText }]}>Complete Profile</Text>
      </TouchableOpacity>
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
      backgroundColor: colors.surface, borderRadius: 14,
      padding: spacing.md, borderWidth: 1.5, gap: spacing.sm,
    },
    rankBadge: {
      alignSelf: 'flex-start', borderRadius: radius.sm, borderWidth: 1,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    rankLabel: { fontSize: typography.fontSize.md, fontWeight: '700' },
    percentileText: { fontSize: typography.fontSize.xl, fontWeight: '800', color: colors.textPrimary },
    progressTrack: {
      height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },
    basedOn: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
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
    mgBarTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
    mgBarFill: { height: '100%', borderRadius: 2 },
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
    chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
    chartLabel: { fontSize: 10, color: colors.textSecondary },

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
