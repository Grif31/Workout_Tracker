import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { ProfileStackParamsList } from '../../navigation/types';
import { appCache } from '../../utils/appCache';
import {
  ACHIEVEMENTS_CACHE_KEY, amountText, badgeDate, fetchAchievements, goalText, rungProgress,
  type AchievementsData, type LadderBadge, type Track,
} from '../../utils/achievements';
import { badgeAccessibilityLabel } from '../../constants/achievements';
import AchievementBadge from '../../components/achievements/AchievementBadge';
import BadgeRing from '../../components/achievements/BadgeRing';
import BadgeDetailModal, { type BadgeDetail } from '../../components/achievements/BadgeDetailModal';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'AchievementTrack'>;

const ROW_HEIGHT = 66;
const ROW_BADGE = 60;

// What a track counts, where its name alone could mislead (TODO §27: the
// streak counts any week with a workout, not the weekly goal Profile uses)
const TRACK_NOTES: Record<string, string> = {
  streak: 'Weeks in a row with a workout.',
  running: 'Runs and walks. Rides count toward their own track.',
  explorer: 'Different exercises with at least one completed set.',
  hours: 'Your workout timer, or the cardio time you logged if that’s longer.',
};
const LIFT_NAMES: Record<string, string> = { plates_bench: 'Bench', plates_squat: 'Squat', plates_deadlift: 'Deadlift' };

export default function AchievementTrackScreen({ navigation, route }: Props) {
  const { track: trackId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<AchievementsData | null>(() => appCache.get<AchievementsData>(ACHIEVEMENTS_CACHE_KEY));
  const [detail, setDetail] = useState<BadgeDetail | null>(null);

  useFocusEffect(useCallback(() => {
    fetchAchievements().then(fresh => { if (fresh) setData(fresh); });
  }, []));

  const openWorkout = (workoutId: number, cardio: boolean) => {
    setDetail(null);
    navigation.navigate(cardio ? 'CardioDetails' : 'WorkoutDetails', { workoutId });
  };

  const isPlates = trackId === 'plates';
  const tracks = data ? data.tracks.filter(t => (isPlates ? t.group === 'plates' && t.visible : t.track === trackId)) : [];
  const earned = tracks.reduce((s, t) => s + t.earned_count, 0);
  const total = tracks.reduce((s, t) => s + t.total, 0);
  const title = isPlates ? 'Plates' : tracks[0]?.label ?? '';

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to Trophy Hall">
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
      {total > 0 && <Text style={styles.headerCount}>{earned} of {total}</Text>}
    </View>
  );

  if (!data || !tracks.length) {
    return <View style={styles.container}>{header}<ActivityIndicator style={styles.spinner} color={colors.accent} /></View>;
  }

  const wu = data.weight_unit;
  const du = data.distance_unit;
  const ladderDetail = (t: Track, b: LadderBadge): BadgeDetail => ({ key: b.key, title: b.title, threshold: b.threshold, unit: t.unit, value: t.value, state: b });

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        {isPlates ? (
          <>
            {tracks.map(t => (
              <View key={t.track}>
                <View style={styles.liftHeader}>
                  <Text style={styles.liftTitle} accessibilityRole="header">{LIFT_NAMES[t.track]}</Text>
                  <Text style={styles.muted}>Best {amountText(t.track, t.value, t.unit, du)}</Text>
                </View>
                <View style={styles.panel}>
                  {t.badges.map(b => (
                    <TouchableOpacity
                      key={b.key} style={styles.plateItem} onPress={() => setDetail(ladderDetail(t, b))}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.title}, ${goalText(t.track, b.threshold, t.unit, du)}, ${b.earned && b.earned_at ? `earned ${badgeDate(b.earned_at)}` : `locked, best ${amountText(t.track, t.value, t.unit, du)}`}`}
                    >
                      <AchievementBadge badgeKey={b.key} threshold={b.threshold} weightUnit={wu} size={76} locked={!b.earned} />
                      <Text style={styles.plateName}>{b.rung} Plate</Text>
                      <Text style={styles.muted}>{b.earned && b.earned_at ? badgeDate(b.earned_at, false) : 'Not yet'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <Text style={[styles.muted, styles.footnote]}>
              Your best completed set on a barbell bench press, squat and deadlift. Warm-ups don{'’'}t count.
            </Text>
          </>
        ) : (
          <Ladder
            track={tracks[0]} wu={wu} du={du} styles={styles} colors={colors}
            onOpen={b => setDetail(ladderDetail(tracks[0], b))}
          />
        )}
      </ScrollView>

      <BadgeDetailModal
        detail={detail} weightUnit={wu} distanceUnit={du}
        onClose={() => setDetail(null)} onViewWorkout={openWorkout}
      />
    </View>
  );
}

function Ladder({ track, wu, du, styles, colors, onOpen }: {
  track: Track; wu: string; du: AchievementsData['distance_unit'];
  styles: ReturnType<typeof createStyles>; colors: Colors; onOpen: (b: LadderBadge) => void;
}) {
  const next = track.next ? track.badges.find(b => b.key === track.next!.key)! : null;
  const topBadge = track.badges[track.badges.length - 1];
  const note = TRACK_NOTES[track.track];

  return (
    <>
      {note && <Text style={[styles.muted, styles.trackNote]}>{note}</Text>}
      <TouchableOpacity
        style={styles.nextCard} onPress={() => onOpen(next ?? topBadge)} accessibilityRole="button"
        accessibilityLabel={next
          ? `Next: ${next.title}, ${goalText(track.track, next.threshold, track.unit, du)}, ${amountText(track.track, track.value, track.unit, du)} so far`
          : `${topBadge.title}, all ${track.total} earned`}
      >
        {next ? (
          <BadgeRing badgeKey={next.key} threshold={next.threshold} weightUnit={wu} progress={rungProgress(track)} size={96} />
        ) : (
          <AchievementBadge badgeKey={topBadge.key} threshold={topBadge.threshold} weightUnit={wu} size={96} />
        )}
        <View style={styles.nextText}>
          <Text style={styles.nextLabel}>{next ? 'NEXT' : 'COMPLETE'}</Text>
          <Text style={styles.nextTitle}>{next ? next.title : topBadge.title}</Text>
          {next ? (
            <>
              <Text style={styles.muted}>{goalText(track.track, next.threshold, track.unit, du)}</Text>
              <Text style={[styles.nextProgress, { color: colors.accent }]}>
                {amountText(track.track, track.value, track.unit, du)} so far · {amountText(track.track, track.next!.remaining, track.unit, du)} to go
              </Text>
            </>
          ) : (
            <Text style={[styles.nextProgress, { color: colors.accent }]}>All {track.total} earned</Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.rows}>
        {track.badges.map((b, i) => {
          const isLast = i === track.badges.length - 1;
          const nextEarned = !isLast && track.badges[i + 1].earned;
          return (
            <TouchableOpacity
              key={b.key} style={styles.row} onPress={() => onOpen(b)} accessibilityRole="button"
              accessibilityLabel={`${badgeAccessibilityLabel(b.title, {
                earnedAt: b.earned_at, value: track.value, threshold: b.threshold,
              })}, ${goalText(track.track, b.threshold, track.unit, du)}`}
            >
              <View style={styles.rail}>
                {/* The line runs in the accent up to the latest badge earned, grey after */}
                <View style={[styles.railTop, { backgroundColor: i === 0 ? 'transparent' : b.earned ? colors.accent : colors.border }]} />
                <View style={[styles.railBottom, { backgroundColor: isLast ? 'transparent' : nextEarned ? colors.accent : colors.border }]} />
                <AchievementBadge badgeKey={b.key} threshold={b.threshold} weightUnit={wu} size={ROW_BADGE} locked={!b.earned} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{b.title}</Text>
                <Text style={styles.muted}>{goalText(track.track, b.threshold, track.unit, du)}</Text>
              </View>
              <Text style={styles.muted}>{b.earned && b.earned_at ? badgeDate(b.earned_at) : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
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
  scroll: { paddingBottom: spacing.xl },
  muted: { fontSize: typography.fontSize.xs + 1, color: colors.textSecondary },
  trackNote: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  nextCard: {
    marginHorizontal: spacing.md, marginTop: spacing.xs, backgroundColor: colors.surface, borderRadius: 20,
    paddingVertical: 14, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  nextText: { flex: 1, gap: 3 },
  nextLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.8, color: colors.textSecondary },
  nextTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  nextProgress: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  rows: { marginHorizontal: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: ROW_HEIGHT },
  rail: { width: ROW_BADGE, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  railTop: { position: 'absolute', left: ROW_BADGE / 2 - 1, top: 0, width: 2, height: ROW_HEIGHT / 2 },
  railBottom: { position: 'absolute', left: ROW_BADGE / 2 - 1, top: ROW_HEIGHT / 2, width: 2, height: ROW_HEIGHT / 2 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  liftHeader: {
    marginTop: spacing.md + 2, marginBottom: spacing.sm, marginHorizontal: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  liftTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  panel: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.xs, flexDirection: 'row',
  },
  plateItem: { flex: 1, alignItems: 'center', gap: 2, minHeight: 44 },
  plateName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  footnote: { marginHorizontal: spacing.md, marginTop: spacing.md + 2, lineHeight: 17 },
});
