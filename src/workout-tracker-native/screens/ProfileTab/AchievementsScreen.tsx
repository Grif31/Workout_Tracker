import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ProfileStackParamsList } from '../../navigation/types';
import { appCache } from '../../utils/appCache';
import {
  ACHIEVEMENTS_CACHE_KEY, almostThere, amountText, badgeDate, earnedBadges, earnedLine, fetchAchievements,
  markAchievementsSeen, milestoneTiles, notYetShown, rungProgress, topBadges,
  type AchievementsData, type EarnedItem,
} from '../../utils/achievements';
import { badgeAccessibilityLabel, badgeLook } from '../../constants/achievements';
import AchievementBadge from '../../components/achievements/AchievementBadge';
import SetDownBadge from '../../components/achievements/SetDownBadge';
import BadgeRing from '../../components/achievements/BadgeRing';
import BadgeDetailModal, { type BadgeDetail } from '../../components/achievements/BadgeDetailModal';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Achievements'>;

const SHOWCASE_SIZES = [84, 108, 84];
// The top badges are set down one by one as the Hall opens, finest first
const SET_DOWN_START = 150;
const SET_DOWN_STAGGER = 140;

/**
 * The Trophy Hall (TODO §27, layout C): top badges, Almost there, Milestones
 * (one tile per track), Feats, Hidden and Recently earned.
 */
export default function AchievementsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<AchievementsData | null>(() => appCache.get<AchievementsData>(ACHIEVEMENTS_CACHE_KEY));
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<BadgeDetail | null>(null);
  // The untrained track whose sentence is showing under Still to discover
  const [discoverOpen, setDiscoverOpen] = useState<string | null>(null);
  // Dots stay for this visit even though the server is told they've been seen
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const reported = useRef(new Set<string>());

  const load = useCallback(async () => {
    const fresh = await fetchAchievements();
    if (!fresh) { setError(true); return; }
    setError(false);
    setData(fresh);
    const unseen = fresh.unseen.filter(k => !reported.current.has(k));
    if (unseen.length) {
      unseen.forEach(k => reported.current.add(k));
      setNewKeys(prev => new Set([...prev, ...unseen]));
      markAchievementsSeen(unseen);
      appCache.set(ACHIEVEMENTS_CACHE_KEY, { ...fresh, unseen: [] });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openWorkout = (workoutId: number, cardio: boolean) => {
    setDetail(null);
    navigation.navigate(cardio ? 'CardioDetails' : 'WorkoutDetails', { workoutId });
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">Trophy Hall</Text>
      <Text style={styles.headerCount}>{data ? `${data.earned_count} of ${data.total_count} earned` : ''}</Text>
    </View>
  );

  if (loading && !data) {
    return <View style={styles.container}>{header}<ActivityIndicator style={styles.spinner} color={colors.accent} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.errorBox}>
          <Text style={styles.muted}>Couldn{'’'}t load your trophies.</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.accent }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const wu = data.weight_unit;
  const du = data.distance_unit;
  const top = topBadges(data);
  const close = almostThere(data);
  const tiles = milestoneTiles(data);
  const undiscovered = notYetShown(data);
  const openNote = undiscovered.find(u => u.track === discoverOpen);
  const feats = data.feats.filter(f => f.visible);
  const recent = earnedBadges(data).slice(0, 3);
  const unfound = Array.from({ length: data.hidden_remaining });

  const itemDetail = (item: EarnedItem): BadgeDetail => ({ key: item.key, title: item.title, threshold: item.threshold, unit: item.unit, state: item.state });
  // Shown in the order earned, the middle one largest
  const showcase = top.length === 3 ? [top[1], top[0], top[2]] : top;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
        {error && <Text style={[styles.muted, styles.staleNote]}>Showing your trophies from earlier. Pull to refresh.</Text>}

        {showcase.length > 0 && (
          <View style={styles.showcase}>
            <View style={styles.showcaseRow}>
              {showcase.map((item, i) => {
                const size = showcase.length === 3 ? SHOWCASE_SIZES[i] : 96;
                return (
                  <TouchableOpacity
                    key={item.key} style={styles.showcaseItem} onPress={() => setDetail(itemDetail(item))}
                    accessibilityRole="button"
                    accessibilityLabel={badgeAccessibilityLabel(item.title, { earnedAt: item.state.earned_at })}
                  >
                    {/* Set down finest first, as the unlock sheet sets down a new badge */}
                    <SetDownBadge
                      play size={size} metal={badgeLook(item.key, { threshold: item.threshold }).metal}
                      delay={SET_DOWN_START + top.indexOf(item) * SET_DOWN_STAGGER} haptic={Haptics.ImpactFeedbackStyle.Light}
                    >
                      <AchievementBadge badgeKey={item.key} threshold={item.threshold} weightUnit={wu} size={size} />
                    </SetDownBadge>
                    <Text style={styles.showcaseTitle} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.showcaseCaption}>Your top badges</Text>
          </View>
        )}

        {close.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Almost there</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.closeRow}>
              {close.map(t => {
                const next = t.next!;
                const nextBadge = t.badges.find(b => b.key === next.key)!;
                const pct = rungProgress(t);
                const toGo = `${amountText(t.track, next.remaining, t.unit, du)} to go`;
                return (
                  <TouchableOpacity
                    key={t.track} style={styles.closeCard}
                    onPress={() => setDetail({ key: next.key, title: next.title, threshold: next.threshold, unit: t.unit, value: t.value, state: nextBadge })}
                    accessibilityRole="button"
                    accessibilityLabel={`${next.title}, ${Math.round(pct * 100)} percent, ${toGo}`}
                  >
                    <BadgeRing badgeKey={next.key} threshold={next.threshold} weightUnit={wu} progress={pct} size={96} />
                    <Text style={styles.closeName} numberOfLines={1}>{next.title}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{toGo}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={styles.sectionTitle} accessibilityRole="header">Milestones</Text>
        <View style={styles.grid}>
          {tiles.map(tile => (
            <TouchableOpacity
              key={tile.id} style={styles.tile}
              onPress={() => navigation.navigate('AchievementTrack', { track: tile.id })}
              accessibilityRole="button"
              accessibilityLabel={`${tile.label}: ${tile.badge.title}, ${tile.earned} of ${tile.total} earned`}
            >
              <AchievementBadge badgeKey={tile.badge.key} threshold={tile.badge.threshold} weightUnit={wu} size={100} locked={tile.locked} />
              <Text style={styles.tileTrack} numberOfLines={1}>{tile.label.toUpperCase()}</Text>
              <Text style={styles.tileTitle} numberOfLines={1}>{tile.badge.title}</Text>
              <Text style={styles.muted}>{tile.earned} of {tile.total} earned</Text>
            </TouchableOpacity>
          ))}
        </View>
        {undiscovered.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Still to discover</Text>
            <View style={styles.discoverRow}>
              {undiscovered.map(u => (
                <TouchableOpacity
                  key={u.track} style={styles.discoverItem}
                  onPress={() => setDiscoverOpen(open => (open === u.track ? null : u.track))}
                  accessibilityRole="button"
                  accessibilityLabel={u.line}
                  accessibilityState={{ expanded: discoverOpen === u.track }}
                >
                  {/* The track's shape in the locked greys, with no stamp, so no badge is given away */}
                  <View style={discoverOpen && discoverOpen !== u.track ? styles.discoverDim : undefined}>
                    <AchievementBadge badgeKey={`${u.track}_1`} size={56} locked />
                  </View>
                  <Text style={styles.tileTrack} numberOfLines={1}>{u.label.toUpperCase()}</Text>
                  <Text style={[styles.muted, styles.center]} numberOfLines={2}>{u.trigger}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {openNote && <Text style={[styles.muted, styles.note]}>{openNote.line}</Text>}
          </>
        )}

        {feats.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitleInline} accessibilityRole="header">Feats</Text>
              <Text style={styles.muted}>{feats.filter(f => f.earned).length} of {feats.length}</Text>
            </View>
            <View style={styles.panel}>
              {feats.map(f => (
                <TouchableOpacity
                  key={f.key} style={styles.panelItem}
                  onPress={() => setDetail({ key: f.key, title: f.title, unit: du, state: f })}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.title}, ${f.earned ? 'earned' : 'locked'}`}
                >
                  <AchievementBadge badgeKey={f.key} weightUnit={wu} size={72} locked={!f.earned} />
                  <Text style={styles.panelLabel} numberOfLines={2}>{f.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitleInline} accessibilityRole="header">Hidden</Text>
          <Text style={styles.muted}>{data.hidden.length} found · {data.hidden_remaining} to find</Text>
        </View>
        <View style={styles.panel}>
          {data.hidden.map(h => (
            <TouchableOpacity
              key={h.key} style={styles.panelItem}
              onPress={() => setDetail({ key: h.key, title: h.title, unit: du, state: h })}
              accessibilityRole="button" accessibilityLabel={`${h.title}, earned`}
            >
              <AchievementBadge badgeKey={h.key} weightUnit={wu} size={72} />
              <Text style={styles.panelLabel} numberOfLines={2}>{h.title}</Text>
            </TouchableOpacity>
          ))}
          {unfound.map((_, i) => (
            <TouchableOpacity
              key={`unfound${i}`} style={styles.panelItem}
              onPress={() => setDetail({ title: 'Hidden', unit: du })}
              accessibilityRole="button" accessibilityLabel="Hidden badge, not found yet"
            >
              <AchievementBadge size={72} />
            </TouchableOpacity>
          ))}
        </View>

        {recent.length > 0 && (
          <>
            <Text style={styles.sectionTitle} accessibilityRole="header">Recently earned</Text>
            <View style={styles.recentList}>
              {recent.map(item => (
                <TouchableOpacity
                  key={item.key} style={styles.recentRow} onPress={() => setDetail(itemDetail(item))}
                  accessibilityRole="button"
                  accessibilityLabel={`${badgeAccessibilityLabel(item.title, { earnedAt: item.state.earned_at })}${newKeys.has(item.key) ? ', new' : ''}`}
                >
                  <AchievementBadge badgeKey={item.key} threshold={item.threshold} weightUnit={wu} size={52} />
                  <View style={styles.recentText}>
                    <Text style={styles.recentTitle}>{item.title}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{earnedLine(item.key, item.threshold, item.unit, du)}</Text>
                  </View>
                  {newKeys.has(item.key) && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
                  <Text style={styles.muted}>{item.state.earned_at ? badgeDate(item.state.earned_at, false) : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <BadgeDetailModal
        detail={detail}
        weightUnit={wu}
        distanceUnit={du}
        onClose={() => setDetail(null)}
        onViewWorkout={openWorkout}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  headerCount: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  spinner: { marginTop: spacing.xl },
  errorBox: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  link: { fontSize: typography.fontSize.md, fontWeight: '600', padding: spacing.sm },
  scroll: { paddingBottom: spacing.xl },
  staleNote: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  muted: { fontSize: typography.fontSize.xs + 1, color: colors.textSecondary },
  showcase: {
    marginHorizontal: spacing.md, marginTop: spacing.xs, borderRadius: 20, backgroundColor: colors.surface,
    paddingTop: spacing.md + 4, paddingBottom: spacing.md, paddingHorizontal: spacing.sm + 4, alignItems: 'center', gap: spacing.sm,
  },
  showcaseRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.sm },
  showcaseItem: { width: 108, alignItems: 'center', gap: 6 },
  showcaseTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  showcaseCaption: { fontSize: 13, color: colors.textSecondary },
  sectionTitle: {
    marginTop: spacing.lg, marginBottom: spacing.sm + 2, marginHorizontal: spacing.md,
    fontSize: 17, fontWeight: '700', color: colors.textPrimary,
  },
  sectionRow: {
    marginTop: spacing.lg, marginBottom: spacing.sm + 2, marginHorizontal: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  sectionTitleInline: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  closeRow: { gap: spacing.sm + 4, paddingHorizontal: spacing.md },
  closeCard: {
    width: 148, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: spacing.sm + 4, alignItems: 'center', gap: spacing.sm,
  },
  closeName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  grid: { marginHorizontal: spacing.md, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md + 4 },
  tile: { width: '33.33%', alignItems: 'center', gap: 2, minHeight: 44 },
  tileTrack: { marginTop: 2, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: colors.textSecondary },
  tileTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: 2 },
  note: { marginHorizontal: spacing.md, marginTop: spacing.md },
  discoverRow: { marginHorizontal: spacing.md, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  discoverItem: { width: '25%', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 2 },
  discoverDim: { opacity: 0.5 },
  center: { textAlign: 'center' },
  panel: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4, paddingHorizontal: 6, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm,
  },
  panelItem: { width: '25%', alignItems: 'center', gap: 2, minHeight: 44 },
  panelLabel: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 2 },
  recentList: { marginHorizontal: spacing.md, gap: spacing.sm + 2 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 44 },
  recentText: { flex: 1, gap: 2 },
  recentTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
