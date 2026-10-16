import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { GREEK_RANKS } from '../constants/greekRanks';
import ProfileAvatarFrame, { GREEK_RANK_COLORS } from './ProfileAvatarFrame';
import { LaurelBranch } from './LaurelWreath';
import { type GreekRankData, gateRequirementText } from '../utils/greekRank';

// Only the old rank's name is cached, not its score, so the old bar can't
// start where the user really was; it starts most of the way so the fill is short
const OLD_BAR_START = 0.6;
const FILL_MS = 700;
const SWAP_MS = 300;

type Props = {
  /** The rank held now */
  rank: string;
  /** The rank before this workout, only when this workout moved the user up */
  previousRank: string | null;
  rankData: GreekRankData | null;
  selectedFrame: string;
  reduceMotion: boolean;
  /** Wait before playing, so the card's entrance and the PR moment finish first */
  startDelay: number;
};

function bandOf(rankName: string) {
  const idx = GREEK_RANKS.findIndex(r => r.name === rankName);
  return { band: GREEK_RANKS[Math.max(idx, 0)], next: GREEK_RANKS[idx + 1] };
}

/**
 * The Greek Rank card on the workout summary. Without a rank-up its progress
 * bar fills in. With one it plays the promotion: the card opens on the old
 * rank, its bar fills to the end, the card pops as the old name gives way to
 * the new one and its tint crossfades to the new color, laurels and a glow
 * arrive, and the bar refills from the start of the new band. With Reduce
 * Motion the old rank just crossfades into the new one.
 *
 * Transforms and opacity run native; the bar's width is a layout prop and runs
 * on the JS driver, on its own view.
 */
export default function RankUpCard({ rank, previousRank, rankData, selectedFrame, reduceMotion, startDelay }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const promoting = previousRank != null;
  // Before the swap the card is the old rank; after it, the new one
  const [swapped, setSwapped] = useState(!promoting);

  const fill = useRef(new Animated.Value(promoting ? OLD_BAR_START : 0)).current;
  const swap = useRef(new Animated.Value(promoting ? 0 : 1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const flourish = useRef(new Animated.Value(promoting ? 0 : 1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const greekScore = rankData?.greek_score ?? null;
  const shown = swapped ? rank : (previousRank ?? rank);
  const { band, next } = bandOf(shown);
  const color = GREEK_RANK_COLORS[shown] ?? GREEK_RANK_COLORS.Neophyte;
  const oldColor = GREEK_RANK_COLORS[previousRank ?? rank] ?? GREEK_RANK_COLORS.Neophyte;
  const newColor = GREEK_RANK_COLORS[rank] ?? GREEK_RANK_COLORS.Neophyte;
  const { band: newBand, next: newNext } = bandOf(rank);
  const newProgress = greekScore != null && newNext
    ? Math.min(1, Math.max(0, (greekScore - newBand.low) / (newBand.high - newBand.low)))
    : null;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, startDelay + ms));
    const fillTo = (toValue: number) =>
      Animated.timing(fill, { toValue, duration: FILL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

    if (!promoting) {
      if (newProgress != null) at(0, () => fillTo(newProgress));
      return () => timers.forEach(clearTimeout);
    }

    if (reduceMotion) {
      at(0, () => {
        setSwapped(true);
        fill.setValue(newProgress ?? 0);
        Animated.timing(swap, { toValue: 1, duration: SWAP_MS, useNativeDriver: true }).start();
        flourish.setValue(1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
      return () => timers.forEach(clearTimeout);
    }

    // The old bar runs out, with light ticks as it fills
    at(0, () => fillTo(1));
    [0, 230, 460].forEach(ms => at(ms, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)));
    // The promotion
    at(FILL_MS, () => {
      setSwapped(true);
      fill.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.timing(swap, { toValue: 1, duration: SWAP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.04, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]).start();
    });
    // Laurels, pill and two glow pulses
    at(FILL_MS + SWAP_MS, () => {
      Animated.timing(flourish, { toValue: 1, duration: 400, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
      const pulse = Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]);
      Animated.sequence([pulse, Animated.delay(100), pulse]).start();
    });
    // The bar refills into the new band
    at(FILL_MS + SWAP_MS + 300, () => { if (newProgress != null) fillTo(newProgress); });
    return () => timers.forEach(clearTimeout);
    // Plays once, on mount: the card mounts after the rank fetch settles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ptsToNext = greekScore != null && next ? Math.max(0, Math.ceil(next.low - greekScore)) : null;
  const subtitle = promoting && swapped
    ? `You reached ${rank}. This workout pushed you over.`
    : next
    ? `Keep training to reach ${next.name}`
    : "You've reached the highest rank.";

  const slide = reduceMotion ? 0 : 12;
  const oldNameStyle = {
    opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [0, -slide] }) }],
  };
  const newNameStyle = {
    opacity: swap,
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [slide, 0] }) }],
  };
  const laurelStyle = (dir: 1 | -1) => ({
    opacity: flourish,
    transform: [{ translateX: flourish.interpolate({ inputRange: [0, 1], outputRange: [8 * dir, 0] }) }],
  });

  return (
    <Animated.View
      // Without a promotion the tint layer alone colors the card; under it too, the tint would double
      style={[styles.card, promoting && { backgroundColor: oldColor + '15', borderColor: oldColor + '44' }, { transform: [{ scale: pop }] }]}
    >
      {/* The new rank's tint and border, faded in over the old one's */}
      <Animated.View
        pointerEvents="none"
        style={[styles.tint, {
          backgroundColor: newColor + '15', borderColor: promoting ? newColor : newColor + '44', opacity: swap,
        }]}
      />
      {promoting && (
        <Animated.View style={[styles.pill, { backgroundColor: newColor + '26' }, {
          opacity: flourish,
          transform: [{ translateX: flourish.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : -20, 0] }) }],
        }]}>
          <Ionicons name="arrow-up" size={12} color={newColor} />
          <Text style={[styles.pillText, { color: newColor }]}>Ranked up</Text>
        </Animated.View>
      )}
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.glow, {
              backgroundColor: newColor,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            }]}
          />
          <View style={styles.avatarDisc} />
          <ProfileAvatarFrame rankName={selectedFrame} size={44} avatarSize={36} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.nameRow}>
            {promoting && (
              <Animated.View style={laurelStyle(-1)}>
                <LaurelBranch height={18} color={newColor} />
              </Animated.View>
            )}
            <View>
              <Animated.Text style={[styles.name, { color: newColor }, newNameStyle]}>{rank}</Animated.Text>
              {promoting && (
                <Animated.Text style={[styles.name, styles.oldName, { color: oldColor }, oldNameStyle]}>
                  {previousRank}
                </Animated.Text>
              )}
            </View>
            {promoting && (
              <Animated.View style={laurelStyle(1)}>
                <LaurelBranch side="right" height={18} color={newColor} />
              </Animated.View>
            )}
          </View>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
      </View>
      {greekScore != null && next && (
        <View style={styles.progressWrap}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, {
              backgroundColor: color,
              width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          {swapped && (
            <Text style={styles.label}>
              {/* At 0 points the score already earns the next rank, so a
                  top-rank gate is what's holding it back */}
              {ptsToNext === 0 && rankData
                ? gateRequirementText(rankData, next.name) ?? `Keep training to reach ${next.name}`
                : `${ptsToNext} point${ptsToNext !== 1 ? 's' : ''} to ${next.name}`}
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: 'transparent' },
  tint: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: radius.md, borderWidth: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.sm,
  },
  pillText: { fontSize: typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  textCol: { flex: 1 },
  avatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 44, height: 44, borderRadius: 22 },
  // own layer so the rounded disc never clips the Aretē frame's wreath, which bleeds past 44px
  avatarDisc: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: typography.fontSize.md, fontWeight: '800', letterSpacing: 0.5 },
  oldName: { position: 'absolute', left: 0, top: 0 },
  sub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  progressWrap: { marginTop: spacing.sm },
  track: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  label: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
});
