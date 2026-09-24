import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Dimensions, FlatList, RefreshControl,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { usePurchase } from '../../context/PurchaseContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { ProfileStackParamsList } from '../../navigation/types';
import { GREEK_RANK_COLORS, GREEK_RANKS } from '../../constants/greekRanks';
import ProfileAvatarFrame, { frameOverflow } from '../../components/ProfileAvatarFrame';
import { GREEK_RANK_CACHED_KEY, PROFILE_FRAME_RANK_KEY } from '../../constants/storageKeys';
import { appCache } from '../../utils/appCache';
import { contrastTextColor } from '../../utils/contrast';
import { resolveMediaUrl } from '../../utils/api';
import { type GreekRankData, bestPerformanceLeg, gateRequirementText } from '../../utils/greekRank';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'GreekRank'>;

const ARETE_RANK = 'Aretē';
// Both breakdown screens are premium; locked, these open the paywall instead
const SCORE_LINKS = [
  { label: 'Strength Score',  screen: 'StrengthScore',  source: 'strength_score' },
  { label: 'Endurance Score', screen: 'EnduranceScore', source: 'endurance_score' },
] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = 88;
const CIRCLE_GAP = 16;
const ITEM_WIDTH = CIRCLE_SIZE + CIRCLE_GAP;


const CIRCLE_INNER = CIRCLE_SIZE - 20;
// The Aretē frame's wreath draws below the circle, so every label clears it.
// Applied to all ranks so the labels keep a common baseline.
const LABEL_GAP = frameOverflow(ARETE_RANK, CIRCLE_SIZE) + spacing.xs;

const HERO_FRAME = 116;
const HERO_AVATAR = 104;
// Same clearance for the hero: its wreath is bigger, so the name sits lower
const HERO_LABEL_GAP = frameOverflow(ARETE_RANK, HERO_FRAME) + spacing.xs;

const circleStyles = StyleSheet.create({
  touchable:   { alignItems: 'center', width: ITEM_WIDTH },
  svgWrapper:  { width: CIRCLE_SIZE, height: CIRCLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  innerCircle: { width: CIRCLE_INNER, height: CIRCLE_INNER, borderRadius: CIRCLE_INNER / 2, alignItems: 'center', justifyContent: 'center' },
  equippedDot: { position: 'absolute', top: 2, right: 2, borderRadius: radius.sm, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  rankName:    { fontSize: typography.fontSize.xs, fontWeight: '600', marginTop: LABEL_GAP, textAlign: 'center' },
  rankRange:   { fontSize: typography.fontSize.xs, marginTop: 2 },
  iconText:    { fontSize: typography.fontSize.lg, fontWeight: '800' as const },
});

function RankCircle({
  rank, rankIdx, heldIdx, greekScore, isSelected, selectedFrame, onSelect,
}: {
  rank: typeof GREEK_RANKS[number];
  rankIdx: number;
  heldIdx: number;
  greekScore: number;
  isSelected: boolean;
  selectedFrame: string;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  // Position comes from the rank held, not the raw score: a score held back by
  // a top-rank gate sits inside a band the user hasn't actually unlocked.
  const isCompleted = rankIdx < heldIdx;
  const isCurrent   = rankIdx === heldIdx;
  const isLocked    = rankIdx > heldIdx;
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
      {isSelected && (
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
  const { isPremium } = usePurchase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const frameKey = `${PROFILE_FRAME_RANK_KEY}_${user?.id}`;

  const [rankData, setRankData] = useState<GreekRankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');

  const listRef = useRef<FlatList>(null);
  // Measured rather than the window width, so centering holds wherever the
  // list is laid out
  const [listWidth, setListWidth] = useState(SCREEN_WIDTH);

  const applyData = (data: GreekRankData) => {
    setRankData(data);
    const idx = GREEK_RANKS.findIndex(r => r.name === data.greek_rank);
    setSelectedIdx(idx >= 0 ? idx : 0);
  };

  const fetchData = async () => {
    const [frameVal] = await AsyncStorage.multiGet([frameKey]);
    if (frameVal[1]) setSelectedFrame(frameVal[1]);

    try {
      const res = await apiFetch('/api/stats/greek-rank');
      if (!res.ok) { setError(true); return; }
      const data: GreekRankData = await res.json();
      applyData(data);
      setError(false);
      appCache.set('greek_rank', data);
      await AsyncStorage.setItem(GREEK_RANK_CACHED_KEY, data.greek_rank);
    } catch { setError(true); }
  };

  // PreloadScreen already warms this key at login, so the spinner is for a
  // genuinely cold cache only, not for every return to the screen.
  useFocusEffect(useCallback(() => {
    const cached = appCache.get<GreekRankData>('greek_rank');
    if (cached) {
      applyData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchData().finally(() => setLoading(false));
  }, []));

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleRetry = async () => {
    setLoading(true);
    await fetchData();
    setLoading(false);
  };

  const greekScore = rankData?.greek_score ?? 0;
  const foundIdx = GREEK_RANKS.findIndex(r => r.name === rankData?.greek_rank);
  // heldRank is where the user actually is; viewedRank is the circle they
  // tapped. Everything that reports progress reads heldRank, everything about
  // the frame picker reads viewedRank. Conflating the two made the hero name
  // take the tapped rank's color and the progress card describe ranks the
  // user had already passed.
  const heldIdx    = foundIdx >= 0 ? foundIdx : 0;
  const heldRank   = GREEK_RANKS[heldIdx];
  const viewedRank = GREEK_RANKS[selectedIdx];
  const nextRank   = GREEK_RANKS[heldIdx + 1];
  const progress    = greekScore >= heldRank.low && greekScore < heldRank.high
    ? (greekScore - heldRank.low) / (heldRank.high - heldRank.low)
    : greekScore >= heldRank.high ? 1 : 0;
  const ptsToNext   = nextRank ? Math.max(0, Math.ceil(nextRank.low - greekScore)) : 0;
  const nextGateText = rankData && nextRank ? gateRequirementText(rankData, nextRank.name) : null;

  // Half the leftover width on each side puts a circle dead center when the
  // scroll offset is exactly ITEM_WIDTH * index, which is also where
  // snapToInterval stops.
  const sidePadding = (listWidth - ITEM_WIDTH) / 2;

  // Centered from onContentSizeChange rather than a timer: this list remounts
  // on every focus (the loading state swaps it out), and scrolling before it
  // has content either no-ops or clamps. scrollToIndex isn't used because its
  // centering math ignores the side padding and reads a 0 viewport width
  // before the first layout, so it landed somewhere different each time.
  const centerOnHeldRank = () => {
    if (!rankData) return;
    listRef.current?.scrollToOffset({ offset: ITEM_WIDTH * heldIdx, animated: false });
  };

  // The list snaps a circle to the center, so the centered circle is the
  // selection. Without this the card below could describe one rank while a
  // different one sat centered.
  const syncSelectionToScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH);
    setSelectedIdx(Math.max(0, Math.min(GREEK_RANKS.length - 1, idx)));
  };

  const selectIndex = (index: number) => {
    setSelectedIdx(index);
    listRef.current?.scrollToOffset({ offset: ITEM_WIDTH * index, animated: true });
  };

  // Frames follow the rank held, not the score (see RankCircle)
  const isUnlocked = (rankName: string) => {
    const idx = GREEK_RANKS.findIndex(x => x.name === rankName);
    return idx >= 0 && idx <= heldIdx;
  };

  const handleEquip = async (rankName: string) => {
    if (!isUnlocked(rankName)) return;
    setSelectedFrame(rankName);
    await AsyncStorage.setItem(frameKey, rankName);
  };

  const isEquipped = selectedFrame === viewedRank.name;
  const components = rankData?.components;
  const performance = rankData?.performance;
  const bestLeg = performance ? bestPerformanceLeg(performance) : null;
  // The first top rank still locked, and what unlocks it, unless the progress
  // label above already says it
  const lockedGate = rankData ? Object.keys(rankData.gates).find(r => gateRequirementText(rankData, r)) : undefined;
  const lockedGateText = rankData && lockedGate ? gateRequirementText(rankData, lockedGate) : null;
  // The score earned a higher rank than the user holds, so a gate is the only
  // thing in the way. Worth stating outright rather than leaving in the
  // gate list at the bottom of the card.
  const heldBackText = rankData?.held_by_gate
    ? gateRequirementText(rankData, rankData.score_rank)
    : null;
  // At 0 points the score already earns the next rank, so a top-rank gate is
  // what's holding it back. When the banner above is already saying which gate
  // and what it needs, this line would only repeat it, so it drops out.
  const progressLabel = !nextRank
    ? "You've reached the highest rank."
    : ptsToNext > 0
      ? `${ptsToNext} more point${ptsToNext !== 1 ? 's' : ''} to reach ${nextRank.name}`
      : heldBackText
        ? null
        : nextGateText ?? `Keep training to reach ${nextRank.name}`;

  // Which ranks the gates apply to, straight from the response so the screen
  // follows the backend if a gate ever moves.
  const gatedRanks = rankData ? Object.keys(rankData.gates) : [];
  const firstGatedIdx = GREEK_RANKS.findIndex(r => gatedRanks.includes(r.name));
  // The section only matters to someone at or next to the gated ranks, or
  // browsing one. Everyone else is far enough away that it is just noise.
  const showTopRanks = !!rankData && firstGatedIdx >= 0 && (
    heldIdx >= firstGatedIdx - 1 || gatedRanks.includes(viewedRank.name)
  );
  // No score on either leg yet. The profile fields come first: without gender
  // neither leg can be computed at all, and the strength leg needs bodyweight.
  const noPerformanceYet = !!performance && performance.best == null;
  const needsGender = rankData?.profile_missing.includes('gender') ?? false;
  const needsBodyweight = rankData?.profile_missing.includes('bodyweight') ?? false;

  // Gate order follows the ranks, not whatever order the JSON arrived in
  const gateEntries = rankData
    ? Object.entries(rankData.gates)
        .sort((a, b) => GREEK_RANKS.findIndex(r => r.name === a[0]) - GREEK_RANKS.findIndex(r => r.name === b[0]))
    : [];

  const avatarSource = user?.profile_pic_url
    ? { uri: resolveMediaUrl(user.profile_pic_url) }
    : require('../../assets/profile-placeholder.png');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Journey</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('GreekRankIntro')}
          accessibilityRole="button"
          accessibilityLabel="How Greek Rank works"
        >
          <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error && !rankData ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.errorTitle}>Couldn't load your rank</Text>
          <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
          }
        >

          {/* Hero — the equipped frame at full size, on the real avatar */}
          <View style={styles.heroSection}>
            <View style={styles.heroAvatarWrap}>
              <Image source={avatarSource} style={styles.heroAvatar} />
              <ProfileAvatarFrame rankName={selectedFrame} size={HERO_FRAME} avatarSize={HERO_AVATAR} />
            </View>
            <Text style={[styles.rankNameLarge, { color: heldRank.color }]}>
              {rankData?.greek_rank ?? 'Neophyte'}
            </Text>
            <Text style={styles.scoreSubtitle}>Score: {greekScore.toFixed(0)} / 100</Text>
          </View>

          {/* The score earned more than the rank held */}
          {heldBackText && rankData && (
            <View style={[styles.heldBackBanner, { borderColor: heldRank.color + '55', backgroundColor: heldRank.color + '14' }]}>
              <Ionicons name="lock-closed" size={16} color={heldRank.color} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heldBackTitle}>
                  Your score has earned {rankData.score_rank}
                </Text>
                <Text style={styles.heldBackText}>{heldBackText}</Text>
              </View>
            </View>
          )}

          {/* Horizontal rank circles */}
          <FlatList
            ref={listRef}
            data={GREEK_RANKS}
            keyExtractor={item => item.name}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: sidePadding }}
            onLayout={e => setListWidth(e.nativeEvent.layout.width)}
            onContentSizeChange={centerOnHeldRank}
            onMomentumScrollEnd={syncSelectionToScroll}
            onScrollEndDrag={syncSelectionToScroll}
            renderItem={({ item, index }) => (
              <RankCircle
                rank={item}
                rankIdx={index}
                heldIdx={heldIdx}
                greekScore={greekScore}
                isSelected={index === selectedIdx}
                selectedFrame={selectedFrame}
                onSelect={() => selectIndex(index)}
              />
            )}
            style={{ marginVertical: spacing.md }}
            getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: sidePadding + ITEM_WIDTH * index, index })}
          />

          {/* Equip button for selected rank — locked ranks show the unlock hint */}
          {isUnlocked(viewedRank.name) ? (
            <TouchableOpacity
              style={[styles.equipBtn, {
                backgroundColor: isEquipped ? viewedRank.color + '22' : viewedRank.color,
                borderColor: viewedRank.color,
              }]}
              onPress={() => handleEquip(viewedRank.name)}
            >
              <Text style={[styles.equipBtnText, {
                color: isEquipped ? viewedRank.color : contrastTextColor(viewedRank.color),
              }]}>
                {isEquipped ? 'Frame Equipped' : 'Use This Frame'}
              </Text>
              {isEquipped && (
                <Ionicons name="star" size={14} color={viewedRank.color} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.lockedHint}>
              <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
              <Text style={styles.lockedHintText}>Rank up to unlock frame</Text>
            </View>
          )}

          {/* Progress detail */}
          {rankData && (
            <View style={[styles.card, { marginHorizontal: spacing.md }]}>
              <Text style={styles.cardTitle}>Progress to {nextRank?.name ?? 'Max Rank'}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {
                  width: `${Math.round(progress * 100)}%` as any,
                  backgroundColor: heldRank.color,
                }]} />
              </View>
              {progressLabel && <Text style={styles.progressLabel}>{progressLabel}</Text>}

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
                        <View style={[styles.compBarFill, { width: `${comp.value}%` as any, backgroundColor: heldRank.color }]} />
                      </View>
                      <Text style={styles.compValue}>{Math.round(comp.value)}</Text>
                    </View>
                  ))}

                  {/* Performance adds no points; the higher score unlocks the top ranks */}
                  {performance && rankData && showTopRanks && (
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
                            style={[styles.compRow, styles.legRow, counts && { backgroundColor: heldRank.color + '1F' }]}
                          >
                            <View style={styles.compLeft}>
                              <Text style={[styles.legLabel, counts && styles.legTextCounts]}>{leg.label}</Text>
                            </View>
                            <View style={styles.compBarTrack}>
                              {leg.value != null && (
                                <View
                                  style={[
                                    styles.compBarFill,
                                    { width: `${leg.value}%` as any, backgroundColor: counts ? heldRank.color : colors.textSecondary },
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
                      {gateEntries.map(([gateRank, required]) => {
                        const met = performance.best != null && performance.best >= required;
                        const gateColor = GREEK_RANK_COLORS[gateRank] ?? heldRank.color;
                        return (
                          <View key={gateRank} testID={`greek-gate-${gateRank}-${met ? 'met' : 'locked'}`} style={styles.gateRow}>
                            <Ionicons name={met ? 'checkmark-circle' : 'lock-closed'} size={16} color={met ? gateColor : colors.textSecondary} />
                            <Text style={[styles.gateRank, { color: met ? gateColor : colors.textPrimary }]}>{gateRank}</Text>
                            <Text style={styles.gateRequirement}>
                              {Math.round(required)}th percentile
                              {performance.best != null && !met && ` · you're at ${Math.round(performance.best)}th`}
                            </Text>
                          </View>
                        );
                      })}
                      {noPerformanceYet ? (
                        <View style={styles.unlockCta}>
                          <Text style={styles.gateHint}>
                            {needsGender
                              ? 'Both scores are measured against your age and gender, so add those to your profile to start scoring.'
                              : needsBodyweight
                                ? 'Strength percentiles are bodyweight ratios, so log your bodyweight to score your lifts. A logged run scores on its own.'
                                : 'Log a lift that counts toward your Strength Score, or a run, and a score will appear here.'}
                          </Text>
                          <View style={styles.unlockBtnRow}>
                            {needsGender && (
                              <TouchableOpacity
                                style={[styles.unlockBtn, { backgroundColor: colors.accent }]}
                                onPress={() => navigation.navigate('EditProfile')}
                              >
                                <Text style={[styles.unlockBtnText, { color: colors.accentText }]}>Complete Profile</Text>
                              </TouchableOpacity>
                            )}
                            {needsBodyweight && (
                              <TouchableOpacity
                                style={[styles.unlockBtn, { borderWidth: 1.5, borderColor: colors.accent }]}
                                onPress={() => navigation.navigate('Measurements')}
                              >
                                <Text style={[styles.unlockBtnText, { color: colors.accent }]}>Log Bodyweight</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ) : lockedGateText && lockedGateText !== nextGateText ? (
                        <Text style={styles.gateHint}>{lockedGateText}</Text>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {/* Full score breakdowns — both screens are premium */}
          <View style={styles.scoreLinksRow}>
            {SCORE_LINKS.map(link => (
              <TouchableOpacity
                key={link.screen}
                style={[styles.scoreLinkBtn, { borderColor: isPremium ? colors.accent : colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={isPremium ? link.label : `${link.label}, premium`}
                onPress={() => isPremium
                  ? (navigation as any).navigate('TrainingTab', { screen: link.screen, initial: false })
                  : (navigation as any).navigate('Paywall', { source: link.source })
                }
              >
                <Text
                  style={[styles.fullBreakdownText, { color: isPremium ? colors.accent : colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {link.label}
                </Text>
                <Ionicons
                  name={isPremium ? 'chevron-forward' : 'lock-closed'}
                  size={16}
                  color={colors.accent}
                />
              </TouchableOpacity>
            ))}
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
    errorTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
    errorSubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
    retryBtn: {
      marginTop: spacing.xs, borderWidth: 1, borderColor: colors.accent,
      borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    },
    retryBtnText: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.accent },
    scroll: { paddingTop: spacing.lg, gap: spacing.md },
    heroSection: { alignItems: 'center', gap: spacing.xs },
    heroAvatarWrap: {
      width: HERO_FRAME, height: HERO_FRAME,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: HERO_LABEL_GAP,
    },
    heroAvatar: { width: HERO_AVATAR, height: HERO_AVATAR, borderRadius: HERO_AVATAR / 2 },
    rankNameLarge: { fontSize: 36, fontWeight: '900', letterSpacing: 1 },
    scoreSubtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    heldBackBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, padding: spacing.md,
      borderWidth: 1, borderRadius: radius.md,
    },
    heldBackTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
    heldBackText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
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
      borderWidth: 1.5,
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
    unlockCta: { gap: spacing.sm },
    unlockBtnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    unlockBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    unlockBtnText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    scoreLinksRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md },
    scoreLinkBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: spacing.xs, borderWidth: 1,
      borderRadius: radius.md, paddingVertical: spacing.sm,
    },
    fullBreakdownText: { fontSize: typography.fontSize.md, fontWeight: '600' },
  });
