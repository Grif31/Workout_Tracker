import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Dimensions, FlatList, RefreshControl,
  NativeSyntheticEvent, NativeScrollEvent, Animated, Easing,
} from 'react-native';
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
import { GREEK_RANK_COLORS, GREEK_RANKS, rankTextColor } from '../../constants/greekRanks';
import ProfileAvatarFrame, { frameOverflow } from '../../components/ProfileAvatarFrame';
import { GREEK_RANK_CACHED_KEY, PROFILE_FRAME_RANK_KEY } from '../../constants/storageKeys';
import { appCache } from '../../utils/appCache';
import { resolveMediaUrl } from '../../utils/api';
import { type GreekRankData, bestPerformanceLeg, gateRequirementText } from '../../utils/greekRank';
import { fmtOrdinal } from '../../utils/prFormat';
import { writeWidgetGreekRank } from '../../utils/widgetData';
import PercentileBar from '../../components/PercentileBar';
import { AnimatedPercentText } from '../../components/ScoreRing';
import { motionTiming } from '../../utils/motion';
import TrophyHallCard from '../../components/achievements/TrophyHallCard';
import ChooseFrameSheet from '../../components/ChooseFrameSheet';
import { animateNextLayout } from '../../utils/layoutAnimation';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'GreekRank'>;

const ARETE_RANK = 'Aretē';
const SCORE_LINKS = [
  { key: 'strength',  label: 'Strength Score',  screen: 'StrengthScore' },
  { key: 'endurance', label: 'Endurance Score', screen: 'EnduranceScore' },
] as const;
// What each part of the score counts, and the fixed tip shown when it's the lowest
const SCORE_PARTS = [
  { key: 'consistency', label: 'Consistency', what: 'Weeks you trained, out of the last 12', tip: 'Training in more weeks moves it most.' },
  { key: 'dedication',  label: 'Dedication',  what: 'Workouts in the last 3 months',         tip: 'Each workout adds to it.' },
  { key: 'volume',      label: 'Volume',      what: 'Working sets and cardio a week',        tip: 'A couple more working sets each session moves it most.' },
] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = 88;
// Wide enough that Titan's blocks and Aretē's crown, side by side, don't touch
const CIRCLE_GAP = 22;
const ITEM_WIDTH = CIRCLE_SIZE + CIRCLE_GAP;


const CIRCLE_INNER = CIRCLE_SIZE - 20;
// The Aretē frame's crown draws below the circle, so every label clears it.
// Applied to all ranks so the labels keep a common baseline.
const LABEL_GAP = frameOverflow(ARETE_RANK, CIRCLE_SIZE, CIRCLE_INNER) + spacing.xs;

// The frame's ornaments are a fixed share of the photo, so a bigger photo is
// the only way to keep a high rank's frame from swallowing it
const HERO_FRAME = 132;
const HERO_AVATAR = 120;
// Room for the widest frame (Aretē's crown) above and below, so the hero
// doesn't shift when the frame changes
const HERO_BLEED = frameOverflow(ARETE_RANK, HERO_FRAME, HERO_AVATAR);
const PENCIL = 34;

const circleStyles = StyleSheet.create({
  touchable:   { alignItems: 'center', width: ITEM_WIDTH },
  svgWrapper:  { width: CIRCLE_SIZE, height: CIRCLE_SIZE, alignItems: 'center', justifyContent: 'center' },
  innerCircle: { width: CIRCLE_INNER, height: CIRCLE_INNER, borderRadius: CIRCLE_INNER / 2, alignItems: 'center', justifyContent: 'center' },
  rankName:    { fontSize: typography.fontSize.xs, fontWeight: '600', marginTop: LABEL_GAP, textAlign: 'center' },
  // Faded so the frames still to come never outshine the ones held
  lockedFrame: { opacity: 0.35 },
  rankRange:   { fontSize: typography.fontSize.xs, marginTop: 2 },
  iconText:    { fontSize: typography.fontSize.lg, fontWeight: '800' as const },
});

function RankCircle({
  rank, rankIdx, heldIdx, isSelected, onSelect,
}: {
  rank: typeof GREEK_RANKS[number];
  rankIdx: number;
  heldIdx: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { colors, mode } = useTheme();

  // Position comes from the rank held, not the raw score: a score held back by
  // a top-rank gate sits inside a band the user hasn't actually unlocked.
  const isCompleted = rankIdx < heldIdx;
  const isCurrent   = rankIdx === heldIdx;
  const isLocked    = rankIdx > heldIdx;

  const tint = rankTextColor(rank.name, rank.color, mode);

  return (
    <TouchableOpacity onPress={onSelect} style={circleStyles.touchable} accessibilityRole="button"
      accessibilityLabel={`${rank.name}${isLocked ? ', locked' : isCurrent ? ', your rank' : ', reached'}`}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Each rank's own frame, so the carousel shows what every rank adds */}
      <View style={circleStyles.svgWrapper}>
        <View style={[StyleSheet.absoluteFill, isLocked && circleStyles.lockedFrame]}>
          <ProfileAvatarFrame rankName={rank.name} size={CIRCLE_SIZE} avatarSize={CIRCLE_INNER} />
        </View>
        <View style={[circleStyles.innerCircle, { backgroundColor: isLocked ? colors.surface : rank.color + '22' }]}>
          {isLocked ? (
            <Ionicons name="lock-closed" size={20} color={colors.textSecondary} />
          ) : isCompleted ? (
            <Ionicons name="checkmark" size={22} color={tint} />
          ) : (
            <Text style={[circleStyles.iconText, { color: tint }]}>{rank.icon}</Text>
          )}
        </View>
      </View>

      <Text style={[circleStyles.rankName, { color: isLocked ? colors.textSecondary : tint }]}>
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

// Just outside the frame in use at the lower right, so it never sits on the ornaments
function pencilAt(frame: string) {
  const reach = HERO_FRAME / 2 + frameOverflow(frame, HERO_FRAME, HERO_AVATAR);
  const d = reach * Math.SQRT1_2 + 2;
  return { left: HERO_FRAME / 2 + d - PENCIL / 2, top: HERO_FRAME / 2 + d - PENCIL / 2 };
}

export default function GreekRankScreen({ navigation }: Props) {
  const { colors, mode } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const frameKey = `${PROFILE_FRAME_RANK_KEY}_${user?.id}`;

  const [rankData, setRankData] = useState<GreekRankData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState('Neophyte');
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  // Closed whenever the screen opens; the score button opens it
  const [scorePartsOpen, setScorePartsOpen] = useState(false);

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
      writeWidgetGreekRank(user?.id, data);
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

  // The score counts up with the bars below, as the Strength and Endurance
  // rings do. AnimatedPercentText shows value × 100, so it's fed score / 100.
  const scoreAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    motionTiming(scoreAnim, {
      toValue: greekScore / 100, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [greekScore, scoreAnim]);

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
    setFramePickerOpen(false);
    await AsyncStorage.setItem(frameKey, rankName);
  };

  const toggleScoreParts = () => {
    animateNextLayout();
    setScorePartsOpen(open => !open);
  };

  const components = rankData?.components;
  const performance = rankData?.performance;
  const bestLeg = performance ? bestPerformanceLeg(performance) : null;
  // The first top rank still locked, and what unlocks it, unless the hero line
  // already says it
  const lockedGate = rankData ? Object.keys(rankData.gates).find(r => gateRequirementText(rankData, r)) : undefined;
  const lockedGateText = rankData && lockedGate ? gateRequirementText(rankData, lockedGate) : null;
  // The score earned a higher rank than the user holds, so a gate is the only
  // thing in the way, and that's what the hero says instead of points
  const heldBackText = rankData?.held_by_gate
    ? gateRequirementText(rankData, rankData.score_rank)
    : null;
  const heroLine = !nextRank
    ? "You've reached the highest rank."
    : heldBackText
      ?? (ptsToNext > 0
        ? `${ptsToNext} point${ptsToNext !== 1 ? 's' : ''} to ${nextRank.name}`
        : nextGateText ?? `Keep training to reach ${nextRank.name}`);

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

  const parts = components && rankData
    ? SCORE_PARTS.map(p => ({ ...p, value: components[p.key], weight: rankData.weights[p.key] }))
    : [];
  // A tie goes to the part listed first, the one weighted most
  const lowestPart = parts.reduce<typeof parts[number] | null>((low, p) => (!low || p.value < low.value ? p : low), null);
  const heldTextColor = rankTextColor(heldRank.name, heldRank.color, mode);

  const avatarSource = user?.profile_pic_url
    ? { uri: resolveMediaUrl(user.profile_pic_url) }
    : require('../../assets/profile-placeholder.png');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
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

          {/* Hero: the frame in use on the real avatar, then the gap to the next rank */}
          <View style={styles.heroSection}>
            <TouchableOpacity
              style={styles.heroAvatarWrap}
              onPress={() => setFramePickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Change frame. ${selectedFrame} frame in use`}
            >
              <Image source={avatarSource} style={styles.heroAvatar} />
              <ProfileAvatarFrame rankName={selectedFrame} size={HERO_FRAME} avatarSize={HERO_AVATAR} />
              <View style={[styles.pencilBadge, pencilAt(selectedFrame)]}>
                <Ionicons name="pencil" size={15} color={colors.textPrimary} />
              </View>
            </TouchableOpacity>
            <Text style={[styles.rankNameLarge, { color: heldTextColor }]}>
              {rankData?.greek_rank ?? 'Neophyte'}
            </Text>
            <Text style={styles.heroLine}>{heroLine}</Text>
            <TouchableOpacity
              style={styles.scoreBtn}
              onPress={toggleScoreParts}
              accessibilityRole="button"
              accessibilityState={{ expanded: scorePartsOpen }}
              accessibilityLabel={`Score ${Math.round(greekScore)} of 100. ${scorePartsOpen ? 'Hide' : 'Show'} what builds it`}
            >
              <Text style={styles.scoreBtnText}>
                Score <AnimatedPercentText anim={scoreAnim} style={styles.scoreBtnText} /> of 100
              </Text>
              <Ionicons name={scorePartsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {scorePartsOpen && parts.length > 0 && (
            <View style={[styles.card, styles.cardInset]}>
              <Text style={styles.cardTitle}>What builds your score</Text>
              {parts.map((part, i) => (
                <View key={part.key} style={styles.partBlock}>
                  <View style={styles.partHead}>
                    <Text style={styles.partLabel}>{part.label}</Text>
                    <Text style={styles.partWeight}>{Math.round(part.weight * 100)}% of your score</Text>
                    <Text style={styles.partValue}>{Math.round(part.value)}</Text>
                  </View>
                  <PercentileBar
                    percent={part.value} color={heldRank.color} trackColor={colors.border}
                    delay={80 * i} style={styles.partBar}
                  />
                  <Text style={styles.partWhat}>{part.what}</Text>
                </View>
              ))}
              {lowestPart && (
                <View style={styles.tip}>
                  <Ionicons name="bulb-outline" size={18} color={colors.accent} />
                  <Text style={styles.tipText}>
                    <Text style={styles.tipStrong}>{lowestPart.label} is your lowest. </Text>
                    {lowestPart.tip}
                  </Text>
                </View>
              )}
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
                isSelected={index === selectedIdx}
                onSelect={() => selectIndex(index)}
              />
            )}
            style={{ marginVertical: spacing.md }}
            getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: sidePadding + ITEM_WIDTH * index, index })}
          />

          {rankData && (
            <View style={[styles.card, styles.cardInset]}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{nextRank ? `Progress to ${nextRank.name}` : heldRank.name}</Text>
                <Text style={styles.cardMeta}>{Math.round(progress * 100)}%</Text>
              </View>
              <PercentileBar
                percent={Math.round(progress * 100)} color={heldRank.color} trackColor={colors.border}
                style={styles.progressTrack}
              />
              <View style={styles.bandEnds}>
                <Text style={styles.cardMeta}>{heldRank.name} · {heldRank.low}</Text>
                <Text style={styles.cardMeta}>{nextRank ? `${nextRank.name} · ${nextRank.low}` : heldRank.high}</Text>
              </View>
            </View>
          )}

          {/* Performance adds no points; the higher score unlocks the top ranks */}
          {performance && rankData && showTopRanks && (
            <View style={[styles.card, styles.cardInset]}>
              <Text style={styles.cardTitle}>Top ranks</Text>
              <Text style={styles.gateHint}>
                Effort earns the points. The top two ranks also need your best performance score.
              </Text>
              <View style={styles.legRow}>
                {SCORE_LINKS.map(leg => {
                  const value = performance[leg.key];
                  const counts = bestLeg === leg.key;
                  const pct = value != null ? fmtOrdinal(value) : null;
                  return (
                    <TouchableOpacity
                      key={leg.key}
                      testID={`greek-leg-${leg.key}${counts ? '-counts' : ''}`}
                      style={[styles.legCard, { borderColor: counts ? heldTextColor : colors.background }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${leg.label}, ${pct ? `${pct} percentile` : 'no score yet'}${counts ? ', counts toward the top ranks' : ''}`}
                      // Open to everyone: the score screens lock their own breakdown for free accounts
                      onPress={() => (navigation as any).navigate('ProgressTab', { screen: leg.screen, initial: false })}
                    >
                      <View style={styles.legHead}>
                        <Text style={styles.legLabel} numberOfLines={1}>{leg.label}</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                      </View>
                      <Text style={styles.legValue}>
                        {pct ?? '–'}
                        {pct && <Text style={styles.legUnit}> percentile</Text>}
                      </Text>
                      <Text style={[styles.legCounts, { color: heldTextColor, opacity: counts ? 1 : 0 }]}>Counts</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {gateEntries.map(([gateRank, required]) => {
                const met = performance.best != null && performance.best >= required;
                const gateColor = GREEK_RANK_COLORS[gateRank] ?? heldRank.color;
                return (
                  <View key={gateRank} testID={`greek-gate-${gateRank}-${met ? 'met' : 'locked'}`} style={styles.gateRow}>
                    <Ionicons name={met ? 'checkmark-circle' : 'lock-closed'} size={16} color={met ? rankTextColor(gateRank, gateColor, mode) : colors.textSecondary} />
                    <Text style={[styles.gateRank, { color: met ? rankTextColor(gateRank, gateColor, mode) : colors.textPrimary }]}>{gateRank}</Text>
                    <Text style={styles.gateRequirement}>
                      {fmtOrdinal(required)} percentile
                      {performance.best != null && !met && ` · you're at ${fmtOrdinal(performance.best)}`}
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
              ) : lockedGateText && lockedGateText !== heroLine ? (
                <Text style={styles.gateHint}>{lockedGateText}</Text>
              ) : null}
            </View>
          )}

          <TrophyHallCard onOpen={() => navigation.navigate('Achievements')} />

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}

      <ChooseFrameSheet
        visible={framePickerOpen}
        onClose={() => setFramePickerOpen(false)}
        avatarSource={avatarSource}
        selectedFrame={selectedFrame}
        heldIdx={heldIdx}
        onChoose={handleEquip}
      />
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
    heroSection: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
    heroAvatarWrap: {
      width: HERO_FRAME, height: HERO_FRAME,
      alignItems: 'center', justifyContent: 'center',
      marginTop: HERO_BLEED, marginBottom: HERO_BLEED + spacing.xs,
    },
    heroAvatar: { width: HERO_AVATAR, height: HERO_AVATAR, borderRadius: HERO_AVATAR / 2 },
    // 34pt drawn, inside the avatar's own much larger touch target
    pencilBadge: {
      position: 'absolute', width: PENCIL, height: PENCIL, borderRadius: PENCIL / 2,
      backgroundColor: colors.border, borderWidth: 3, borderColor: colors.background,
      alignItems: 'center', justifyContent: 'center',
    },
    rankNameLarge: { fontSize: 36, fontWeight: '900', letterSpacing: 1 },
    heroLine: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    scoreBtn: {
      marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.surface, borderRadius: radius.full,
      paddingHorizontal: 14, minHeight: 36,
    },
    scoreBtnText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    card: {
      backgroundColor: colors.surface, borderRadius: 14,
      padding: spacing.md, gap: spacing.sm,
    },
    cardInset: { marginHorizontal: spacing.md },
    cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    cardTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
    cardMeta: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    progressTrack: { height: 8, borderRadius: 4 },
    bandEnds: { flexDirection: 'row', justifyContent: 'space-between' },
    partBlock: { gap: 6, marginTop: spacing.xs },
    partHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    partLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
    partWeight: { fontSize: typography.fontSize.xs, color: colors.textSecondary, flex: 1 },
    partValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
    partBar: { height: 6, borderRadius: 3 },
    partWhat: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
    tip: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: spacing.xs,
      backgroundColor: colors.background, borderRadius: radius.md, padding: 12,
    },
    tipText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 19, color: colors.textPrimary },
    tipStrong: { fontWeight: '700' },
    legRow: { flexDirection: 'row', gap: spacing.sm },
    legCard: {
      flex: 1, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1.5,
      paddingHorizontal: 12, paddingVertical: 10, gap: 2, minHeight: 44,
    },
    legHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
    legLabel: { flexShrink: 1, fontSize: typography.fontSize.xs, color: colors.textSecondary },
    legValue: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
    legUnit: { fontSize: typography.fontSize.xs, fontWeight: '500', color: colors.textSecondary },
    legCounts: { fontSize: typography.fontSize.xs, fontWeight: '700' },
    gateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    gateRank: { fontSize: typography.fontSize.sm, fontWeight: '700', width: 72 },
    gateRequirement: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    gateHint: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    unlockCta: { gap: spacing.sm },
    unlockBtnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    unlockBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    unlockBtnText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  });
