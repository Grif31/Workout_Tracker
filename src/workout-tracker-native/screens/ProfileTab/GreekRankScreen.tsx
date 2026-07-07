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

type Props = NativeStackScreenProps<ProfileStackParamsList, 'GreekRank'>;

const GREEK_RANK_CACHED_KEY = 'greek_rank_cached';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = 88;
const CIRCLE_GAP = 16;
const ITEM_WIDTH = CIRCLE_SIZE + CIRCLE_GAP;


interface RankData {
  greek_rank: string;
  greek_score?: number;
  greek_score_components?: { consistency: number; strength: number; dedication: number; volume: number };
}

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
  rank, greekScore, isSelected, selectedFrame, onSelect,
}: {
  rank: typeof GREEK_RANKS[number];
  greekScore: number;
  isSelected: boolean;
  selectedFrame: string;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  const isCompleted = greekScore > rank.high;
  const isCurrent   = greekScore >= rank.low && greekScore < rank.high;
  const isLocked    = greekScore < rank.low;
  const isEquipped  = selectedFrame === rank.name;

  const r            = CIRCLE_SIZE / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const progress     = isCurrent
    ? Math.max(0, Math.min(1, (greekScore - rank.low) / (rank.high - rank.low)))
    : isCompleted ? 1 : 0;
  const strokeOffset = circumference * (1 - progress);

  return (
    <TouchableOpacity onPress={onSelect} style={[circleStyles.touchable, { opacity: isLocked ? 0.35 : 1 }]}>
      <View style={circleStyles.svgWrapper}>
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ position: 'absolute' }}>
          <Circle
            cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={r}
            stroke={isLocked ? colors.border : rank.color + '33'}
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

        <View style={[circleStyles.innerCircle, { backgroundColor: isLocked ? colors.surface : rank.color + '22' }]}>
          {isCompleted ? (
            <Ionicons name="checkmark" size={22} color={rank.color} />
          ) : (
            <Text style={[circleStyles.iconText, { color: isLocked ? colors.textSecondary : rank.color }]}>
              {rank.icon}
            </Text>
          )}
        </View>

        {isEquipped && (
          <View style={[circleStyles.equippedDot, { backgroundColor: rank.color }]}>
            <Ionicons name="star" size={10} color="#fff" />
          </View>
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

  const [rankData, setRankData] = useState<RankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');

  const listRef = useRef<FlatList>(null);

  const fetchData = async () => {
    const [frameVal] = await AsyncStorage.multiGet([frameKey]);
    if (frameVal[1]) setSelectedFrame(frameVal[1]);

    try {
      const res = await apiFetch('/api/stats/strength-score');
      if (res.ok) {
        const data: RankData = await res.json();
        setRankData(data);
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
  const currentRank = GREEK_RANKS[selectedIdx];
  const nextRank    = GREEK_RANKS[selectedIdx + 1];
  const progress    = greekScore >= currentRank.low && greekScore < currentRank.high
    ? (greekScore - currentRank.low) / (currentRank.high - currentRank.low)
    : greekScore >= currentRank.high ? 1 : 0;
  const ptsToNext   = nextRank ? Math.max(0, Math.ceil(nextRank.low - greekScore)) : 0;

  const isUnlocked = (rankName: string) => {
    const r = GREEK_RANKS.find(x => x.name === rankName);
    return r ? greekScore >= r.low : false;
  };

  const handleEquip = async (rankName: string) => {
    if (!isUnlocked(rankName)) return;
    setSelectedFrame(rankName);
    await AsyncStorage.setItem(frameKey, rankName);
  };

  const components = rankData?.greek_score_components;

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

          {/* Equip button for selected rank */}
          {isUnlocked(currentRank.name) && (
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
                {nextRank
                  ? `${ptsToNext} more point${ptsToNext !== 1 ? 's' : ''} to reach ${nextRank.name}`
                  : "You've reached the highest rank!"}
              </Text>

              {components && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.componentTitle}>Score Breakdown</Text>
                  {[
                    { label: 'Consistency', value: components.consistency, icon: 'calendar-outline' as const },
                    { label: 'Strength',    value: components.strength,    icon: 'barbell-outline' as const },
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
                </>
              )}
            </View>
          )}

          {/* View Full Breakdown */}
          <TouchableOpacity
            style={[styles.fullBreakdownBtn, { borderColor: colors.accent }]}
            onPress={() => (navigation as any).navigate('TrainingTab', { screen: 'StrengthScore', initial: false })}
          >
            <Text style={[styles.fullBreakdownText, { color: colors.accent }]}>View Full Strength Breakdown</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </TouchableOpacity>

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
    heroSection: { alignItems: 'center', gap: 4 },
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
    fullBreakdownBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: spacing.xs, marginHorizontal: spacing.md, borderWidth: 1,
      borderRadius: radius.md, paddingVertical: spacing.sm,
    },
    fullBreakdownText: { fontSize: typography.fontSize.md, fontWeight: '600' },
  });
