import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { TrainingStackParamsList } from '../../navigation/types';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'StrengthScore'>;

const STRENGTH_RANK_COLORS: Record<string, string> = {
  Noobie:       '#888888',
  Beginner:     '#4A9EFF',
  Intermediate: '#4CAF50',
  Advanced:     '#FF9800',
  Elite:        '#9C27B0',
  Legend:       '#FFD700',
};

interface ScoreData {
  overall: number;
  overall_rank: { label: string; tier: number; display: string };
  greek_rank: string;
  greek_score?: number;
  greek_score_components?: { consistency: number; strength: number; dedication: number; volume: number };
  exercises_used: number;
  muscle_groups_used: number;
  big6?: Array<{ exercise: string; percentile: number | null; rank: { label: string; tier: number; display: string } | null; has_data: boolean }>;
  supplemental?: Array<{ exercise: string; percentile: number | null; rank: { label: string; tier: number; display: string } | null; has_data: boolean }>;
  muscle_groups?: Array<{ name: string; score: number; rank: { label: string; tier: number; display: string } }>;
}

interface HistoryPoint { date: string; score: number }
type MuscleGroup = { name: string; score: number; rank: { label: string; tier: number; display: string } };

export default function StrengthScoreScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [history, setHistory]     = useState<HistoryPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [noData, setNoData]       = useState(false);

  // Muscle group detail modal
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup | null>(null);
  const [groupModalVisible, setGroupModalVisible] = useState(false);

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
      if (!res.ok) return;
      const data: ScoreData = await res.json();
      setScoreData(data);
      setMissingFields([]);
      setNoData(false);
    } catch {}
  };

  const fetchHistory = async () => {
    try {
      const res = await apiFetch('/api/stats/strength-score/history');
      if (!res.ok) return;
      const { history: h } = await res.json();
      setHistory(h);
    } catch {}
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([fetchScore(), fetchHistory()]).finally(() => setLoading(false));
  }, []));

  const rankColor = scoreData ? (STRENGTH_RANK_COLORS[scoreData.overall_rank.label] ?? colors.accent) : colors.accent;

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
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : missingFields.length > 0 ? (
        <GateCard missingFields={missingFields} navigation={navigation} colors={colors} styles={styles} />
      ) : noData ? (
        <View style={styles.center}>
          <Ionicons name="barbell-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No exercise data yet</Text>
          <Text style={styles.emptySubtitle}>Log workouts to see your strength score</Text>
        </View>
      ) : scoreData ? (
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Hero card */}
          <View style={[styles.heroCard, { borderColor: rankColor }]}>
            <View style={[styles.rankBadge, { backgroundColor: rankColor + '22', borderColor: rankColor }]}>
              <Text style={[styles.rankLabel, { color: rankColor }]}>{scoreData.overall_rank.display}</Text>
            </View>
            <Text style={styles.percentileText}>
              Top {Math.round(100 - scoreData.overall)}% of lifters
            </Text>
            <Text style={styles.percentileSub}>
              Stronger than {Math.round(scoreData.overall)}% of all lifters
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${scoreData.overall}%` as any, backgroundColor: rankColor }]} />
            </View>
            <Text style={styles.basedOn}>
              Based on {scoreData.exercises_used} exercise{scoreData.exercises_used !== 1 ? 's' : ''} across {scoreData.muscle_groups_used} muscle group{scoreData.muscle_groups_used !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Muscle Group Scores */}
          {scoreData.muscle_groups && scoreData.muscle_groups.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Muscle Group Ranks</Text>
              <View style={styles.card}>
                {scoreData.muscle_groups.map((mg, i) => {
                  const mgColor = STRENGTH_RANK_COLORS[mg.rank.label] ?? colors.accent;
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
                  const exColor = ex.rank ? (STRENGTH_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
                  return (
                    <React.Fragment key={ex.exercise}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.exRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.exName, !ex.has_data && { color: colors.textSecondary }]}>{ex.exercise}</Text>
                          {ex.has_data ? (
                            <View style={styles.mgBarTrack}>
                              <View style={[styles.mgBarFill, { width: `${ex.percentile ?? 0}%` as any, backgroundColor: exColor }]} />
                            </View>
                          ) : (
                            <Text style={styles.noDataText}>No data logged</Text>
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

          {/* More Lifts */}
          {scoreData.supplemental && scoreData.supplemental.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>More Lifts</Text>
              <View style={styles.card}>
                {scoreData.supplemental.map((ex, i) => {
                  const exColor = ex.rank ? (STRENGTH_RANK_COLORS[ex.rank.label] ?? colors.accent) : colors.border;
                  return (
                    <React.Fragment key={ex.exercise}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.exRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exName}>{ex.exercise}</Text>
                          <View style={styles.mgBarTrack}>
                            <View style={[styles.mgBarFill, { width: `${ex.percentile ?? 0}%` as any, backgroundColor: exColor }]} />
                          </View>
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

      {/* Muscle group detail modal */}
      <Modal visible={groupModalVisible} transparent animationType="slide" onRequestClose={() => setGroupModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGroupModalVisible(false)}>
          <View style={styles.modalSheet}>
            {selectedGroup && (() => {
              const mgColor = STRENGTH_RANK_COLORS[(selectedGroup as any).rank?.label] ?? colors.accent;
              const contrib = scoreData?.big6?.concat(scoreData?.supplemental ?? [])
                .filter(ex => ex.has_data)
                .filter(ex => {
                  // rough match: group name exists in exercise name or vice versa
                  return true;
                }) ?? [];
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
      {needsGender && (
        <TouchableOpacity
          style={[styles.gateBtn, { backgroundColor: colors.accent }]}
          onPress={() => navigation.navigate('TrainingHome')}
        >
          <Text style={[styles.gateBtnText, { color: '#fff' }]}>Go to Settings</Text>
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
      backgroundColor: colors.surface, borderRadius: 14,
      padding: spacing.md, borderWidth: 1.5, gap: spacing.sm,
    },
    rankBadge: {
      alignSelf: 'flex-start', borderRadius: radius.sm, borderWidth: 1,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    rankLabel: { fontSize: typography.fontSize.md, fontWeight: '700' },
    percentileText: { fontSize: typography.fontSize.xl, fontWeight: '800', color: colors.textPrimary },
    percentileSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    progressTrack: {
      height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },
    basedOn: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
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
    exName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    noDataText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
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
  });
