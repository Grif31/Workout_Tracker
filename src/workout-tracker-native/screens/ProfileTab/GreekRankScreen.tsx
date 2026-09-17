import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, FlatList,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { ProfileStackParamsList } from '../../navigation/types';
import { GREEK_RANK_COLORS, GREEK_RANKS } from '../../constants/greekRanks';
import ProfileAvatarFrame from '../../components/ProfileAvatarFrame';
import { GREEK_RANK_CACHED_KEY } from '../../constants/storageKeys';
import { appCache } from '../../utils/appCache';
import { type GreekRankData, bestPerformanceLeg, gateRequirementText } from '../../utils/greekRank';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'GreekRank'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = 88;
const CIRCLE_GAP = 16;
const ITEM_WIDTH = CIRCLE_SIZE + CIRCLE_GAP;


const CIRCLE_INNER = CIRCLE_SIZE - 20;

const circleStyles = StyleSheet.create({
  touchable:   { alignItems: 'center', width: ITEM_WIDTH },
  svgWrapper:  { width: CIRCLE_SIZE, height: CIRCLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  innerCircle: { width: CIRCLE_INNER, height: CIRCLE_INNER, borderRadius: CIRCLE_INNER / 2, alignItems: 'center', justifyContent: 'center' },
  equippedDot: { position: 'absolute', top: 2, right: 2, borderRadius: radius.sm, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  rankName:    { fontSize: typography.fontSize.xs, fontWeight: '600', marginTop: spacing.xs - 2, textAlign: 'center' },
  rankRange:   { fontSize: typography.fontSize.xs, marginTop: 2 },
  iconText:    { fontSize: typography.fontSize.lg, fontWeight: '800' as const },
});

function RankCircle({
  rank, rankIdx, currentIdx, greekScore, isSelected, selectedFrame, onSelect,
}: {
  rank: typeof GREEK_RANKS[number];
  rankIdx: number;
  currentIdx: number;
  greekScore: number;
  isSelected: boolean;
  selectedFrame: string;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  // Position comes from the rank held, not the raw score: a score held back by
  // a top-rank gate sits inside a band the user hasn't actually unlocked.
  const isCompleted = rankIdx < currentIdx;
  const isCurrent   = rankIdx === currentIdx;
  const isLocked    = rankIdx > currentIdx;
  const isEquipped  = selectedFrame === rank.name;

  const r            = CIRCLE_SIZE / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const progress     = isCurrent
    ? Math.max(0, Math.min(1, (greekScore - rank.low) / (rank.high - rank.low)))
    : isCompleted ? 1 : 0;
  const strokeOffset = circumference * (1 - progress);

  return (
    <TouchableOpacity onPress={onSelect} style={[circleStyles.touchable, { opacity: isLocked ? 0.6 : 1 }]}>
      <View style={circleStyles.svgWrapper}>
        {isLocked ? (
          <>
            {/* Preview the real frame this rank unlocks, lock in front */}
            <ProfileAvatarFrame rankName={rank.name} size={CIRCLE_SIZE} avatarSize={CIRCLE_INNER} />
            <View style={[circleStyles.innerCircle, { backgroundColor: colors.surface }]}>
              <Ionicons name="lock-closed" size={20} color={colors.textSecondary} />
            </View>
          </>
        ) : (
          <>
            <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ position: 'absolute' }}>
              <Circle
                cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={r}
                stroke={rank.color + '33'}
                strokeWidth={6} fill="none"
              />
              {(isCurrent || isCompleted) && (
                <Circle
                  cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={r}
                  stroke={rank.color}
                  strokeWidth={6} fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
                />
              )}
            </Svg>

            <View style={[circleStyles.innerCircle, { backgroundColor: rank.color + '22' }]}>
              {isCompleted ? (
                <Ionicons name="checkmark" size={22} color={rank.color} />
              ) : (
                <Text style={[circleStyles.iconText, { color: rank.color }]}>
                  {rank.icon}
                </Text>
              )}
            </View>

            {isEquipped && (
              <View style={[circleStyles.equippedDot, { backgroundColor: rank.color }]}>
                <Ionicons name="star" size={10} color="#fff" />
              </View>
            )}
          </>
        )}
      </View>

      <Text style={[circleStyles.rankName, { color: isLocked ? colors.textSecondary : rank.color }]}>
        {rank.name}
      </Text>
      {isSelected && !isLocked && (
        <Text style={[circleStyles.rankRange, { color: colors.textSecondary }]}>
          {rank.low}–{rank.high}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function GreekRankScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const frameKey = `profile_frame_rank_${user?.id}`;

  const [rankData, setRankData] = useState<GreekRankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');

  const listRef = useRef<FlatList>(null);

  const fetchData = async () => {
    const [frameVal] = await AsyncStorage.multiGet([frameKey]);
    if (frameVal[1]) setSelectedFrame(frameVal[1]);

    try {
      const res = await apiFetch('/api/stats/greek-rank');
      if (res.ok) {
        const data: GreekRankData = await res.json();
        setRankData(data);
        appCache.set('greek_rank', data);
        const idx = GREEK_RANKS.findIndex(r => r.name === data.greek_rank);
        const targetIdx = idx >= 0 ? idx : 0;
        setSelectedIdx(targetIdx);
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
        }, 300);
        await AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, data.greek_rank);
      }
    } catch {}
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData();
  }, []));

  const greekScore = rankData?.greek_score ?? 0;
  const heldIdx     = GREEK_RANKS.findIndex(r => r.name === rankData?.greek_rank);
  const currentIdx  = heldIdx >= 0 ? heldIdx : 0;
  const currentRank = GREEK_RANKS[selectedIdx];
  const nextRank    = GREEK_RANKS[selectedIdx + 1];
  const progress    = greekScore >= currentRank.low && greekScore < currentRank.high
    ? (greekScore - currentRank.low) / (currentRank.high - currentRank.low)
    : greekScore >= currentRank.high ? 1 : 0;
  const ptsToNext   = nextRank ? Math.max(0, Math.ceil(nextRank.low - greekScore)) : 0;
  const nextGateText = rankData && nextRank ? gateRequirementText(rankData, nextRank.name) : null;

  // Frames follow the rank held, not the score (see RankCircle)
  const isUnlocked = (rankName: string) => {
    const idx = GREEK_RANKS.findIndex(x => x.name === rankName);
    return idx >= 0 && idx <= currentIdx;
  };

  const handleEquip = async (rankName: string) => {
    if (!isUnlocked(rankName)) return;
    setSelectedFrame(rankName);
    await AsyncStorage.setItem(frameKey, rankName);
  };

  const components = rankData?.components;
  const performance = rankData?.performance;
  const bestLeg = performance ? bestPerformanceLeg(performance) : null;
  // The first top rank still locked, and what unlocks it, unless the progress
  // label above already says it
  const lockedGate = rankData ? Object.keys(rankData.gates).find(r => gateRequirementText(rankData, r)) : undefined;
  const lockedGateText = rankData && lockedGate ? gateRequirementText(rankData, lockedGate) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Journey</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* Hero */}
          <View style={styles.heroSection}>
            <Text style={[styles.rankNameLarge, { color: currentRank.color }]}>
              {rankData?.greek_rank ?? 'Neophyte'}
            </Text>
            {greekScore > 0 && (
              <Text style={styles.scoreSubtitle}>Score: {greekScore.toFixed(0)} / 100</Text>
            )}
          </View>

          {/* Horizontal rank circles */}
          <FlatList
            ref={listRef}
            data={GREEK_RANKS as unknown as typeof GREEK_RANKS[number][]}
            keyExtractor={item => item.name}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: (SCREEN_WIDTH - ITEM_WIDTH) / 2 }}
            renderItem={({ item, index }) => (
              <RankCircle
                rank={item}
                rankIdx={index}
                currentIdx={currentIdx}
                greekScore={greekScore}
                isSelected={index === selectedIdx}
                selectedFrame={selectedFrame}
                onSelect={() => setSelectedIdx(index)}
              />
            )}
            style={{ marginVertical: spacing.md }}
            getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
            onScrollToIndexFailed={() => {}}
          />

          {/* Equip button for selected rank — locked ranks show the unlock hint */}
          {isUnlocked(currentRank.name) ? (
            <TouchableOpacity
              style={[styles.equipBtn, {
                backgroundColor: selectedFrame === currentRank.name ? currentRank.color + '22' : currentRank.color,
                borderWidth: selectedFrame === currentRank.name ? 1.5 : 0,
                borderColor: currentRank.color,
              }]}
              onPress={() => handleEquip(currentRank.name)}
            >
              <Text style={[styles.equipBtnText, {
                color: selectedFrame === currentRank.name ? currentRank.color : '#fff',
              }]}>
                {selectedFrame === currentRank.name ? 'Frame Equipped' : 'Use This Frame'}
              </Text>
              {selectedFrame === currentRank.name && (
                <Ionicons name="star" size={14} color={currentRank.color} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.lockedHint}>
              <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
              <Text style={styles.lockedHintText}>Rank up to unlock frame</Text>
            </View>
          )}

          {/* Progress detail */}
          {greekScore > 0 && (
            <View style={[styles.card, { marginHorizontal: spacing.md }]}>
              <Text style={styles.cardTitle}>Progress to {nextRank?.name ?? 'Max Rank'}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {
                  width: `${Math.round(progress * 100)}%` as any,
                  backgroundColor: currentRank.color,
                }]} />
              </View>
              <Text style={styles.progressLabel}>
                {/* At 0 points the score already earns the next rank, so a
                    top-rank gate is what's holding it back */}
                {!nextRank
                  ? "You've reached the highest rank."
                  : ptsToNext > 0
                    ? `${ptsToNext} more point${ptsToNext !== 1 ? 's' : ''} to reach ${nextRank.name}`
                    : nextGateText ?? `Keep training to reach ${nextRank.name}`}
              </Text>

              {components && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.componentTitle}>Score Breakdown</Text>
                  {[
                    { label: 'Consistency', value: components.consistency, icon: 'calendar-outline' as const },
                    { label: 'Dedication',  value: components.dedication,  icon: 'trophy-outline' as const },
                    { label: 'Volume',      value: components.volume,      icon: 'flame-outline' as const },
                  ].map(comp => (
                    <View key={comp.label} style={styles.compRow}>
                      <View style={styles.compLeft}>
                        <Ionicons name={comp.icon} size={16} color={colors.textSecondary} />
                        <Text style={styles.compLabel}>{comp.label}</Text>
                      </View>
                      <View style={styles.compBarTrack}>
                        <View style={[styles.compBarFill, { width: `${comp.value}%` as any, backgroundColor: currentRank.color }]} />
                      </View>
                      <Text style={styles.compValue}>{Math.round(comp.value)}</Text>
                    </View>
                  ))}

                  {/* Performance adds no points; the higher score unlocks the top ranks */}
                  {performance && rankData && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.componentTitle}>Unlock Top Ranks</Text>
                      {([
                        { key: 'strength' as const,  label: 'Strength',  value: performance.strength },
                        { key: 'endurance' as const, label: 'Endurance', value: performance.endurance },
                      ]).map(leg => {
                        const counts = bestLeg === leg.key;
                        return (
                          <View
                            key={leg.key}
                            testID={`greek-leg-${leg.key}${counts ? '-counts' : ''}`}
                            style={[styles.compRow, styles.legRow, counts && { backgroundColor: currentRank.color + '1F' }]}
                          >
                            <View style={styles.compLeft}>
                              <Text style={[styles.legLabel, counts && styles.legTextCounts]}>{leg.label}</Text>
                            </View>
                            <View style={styles.compBarTrack}>
                              {leg.value != null && (
                                <View
                                  style={[
                                    styles.compBarFill,
                                    { width: `${leg.value}%` as any, backgroundColor: counts ? currentRank.color : colors.textSecondary },
                                  ]}
                                />
                              )}
                            </View>
                            <Text style={[styles.compValue, counts && styles.legTextCounts]}>
                              {leg.value != null ? Math.round(leg.value) : '\u2013'}
                            </Text>
                          </View>
                        );
                      })}
                      {Object.entries(rankData.gates).map(([gateRank, required]) => {
                        const met = performance.best != null && performance.best >= required;
                        const gateColor = GREEK_RANK_COLORS[gateRank] ?? currentRank.color;
                        return (
                          <View key={gateRank} testID={`greek-gate-${gateRank}-${met ? 'met' : 'locked'}`} style={styles.gateRow}>
                            <Ionicons name={met ? 'checkmark-circle' : 'lock-closed'} size={16} color={met ? gateColor : colors.textSecondary} />
                            <Text style={[styles.gateRank, { color: met ? gateColor : colors.textPrimary }]}>{gateRank}</Text>
                            <Text style={styles.gateRequirement}>{Math.round(required)}th percentile</Text>
                          </View>
                        );
                      })}
                      {lockedGateText && lockedGateText !== nextGateText && (
                        <Text style={styles.gateHint}>{lockedGateText}</Text>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {/* Full score breakdowns */}
          <View style={styles.scoreLinksRow}>
            <TouchableOpacity
              style={[styles.scoreLinkBtn, { borderColor: colors.accent }]}
              onPress={() => (navigation as any).navigate('TrainingTab', { screen: 'StrengthScore', initial: false })}
            >
              <Text style={[styles.fullBreakdownText, { color: colors.accent }]}>Strength Score</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scoreLinkBtn, { borderColor: colors.accent }]}
              onPress={() => (navigation as any).navigate('TrainingTab', { screen: 'EnduranceScore', initial: false })}
            >
              <Text style={[styles.fullBreakdownText, { color: colors.accent }]}>Endurance Score</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingTop: spacing.lg, gap: spacing.md },
    heroSection: { alignItems: 'center', gap: spacing.xs },
    rankNameLarge: { fontSize: 36, fontWeight: '900', letterSpacing: 1 },
    scoreSubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    card: {
      backgroundColor: colors.surface, borderRadius: 14,
      padding: spacing.md, gap: spacing.sm,
    },
    cardTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
    progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
    progressLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    divider: { height: 1, backgroundColor: colors.border },
    componentTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    compRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    compLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, width: 110 },
    compLabel: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
    compBarTrack: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
    compBarFill: { height: '100%', borderRadius: 3 },
    compValue: { fontSize: typography.fontSize.sm, color: colors.textSecondary, width: 28, textAlign: 'right' },
    equipBtn: {
      alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
      borderRadius: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    },
    equipBtnText: { fontSize: typography.fontSize.md, fontWeight: '700' },
    lockedHint: {
      alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
      gap: spacing.xs, paddingVertical: spacing.sm,
    },
    lockedHintText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
    // The highlight pill's padding is cancelled by a matching negative margin
    // so the sub-row bars stay aligned with the rows above them.
    legRow: {
      marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs,
      paddingVertical: 3, borderRadius: radius.sm,
    },
    legLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, paddingLeft: 20 },
    legTextCounts: { color: colors.textPrimary, fontWeight: '700' },
    gateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    gateRank: { fontSize: typography.fontSize.sm, fontWeight: '700', width: 72 },
    gateRequirement: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    gateHint: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    scoreLinksRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md },
    scoreLinkBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: spacing.xs, borderWidth: 1,
      borderRadius: radius.md, paddingVertical: spacing.sm,
    },
    fullBreakdownText: { fontSize: typography.fontSize.md, fontWeight: '600' },
  });
