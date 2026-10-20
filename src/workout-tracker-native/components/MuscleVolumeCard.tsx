import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import SegmentedControl from './SegmentedControl';
import { MUSCLE_STANDARDS, volumeZone, type VolumeZone } from '../constants/volumeLandmarks';
import { muscleTrend, GOOD_WEEKLY_SESSIONS, type Trend } from '../utils/muscleTrends';
import { toLocalDateStr } from '../utils/date';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type MuscleVolumeData = {
  muscle_sets: Record<string, number>;
  last_trained: Record<string, string>;
  total_sets: number;
  last_week_total: number;
  week_start: string;
  // Added with the trends: absent from a cached response saved by an older build
  session_count?: Record<string, number>;
  weekly_history?: Record<string, number[]>;
  this_week_total?: number;
  last_week_to_date_total?: number;
};

type View_ = 'volume' | 'frequency' | 'trend';
const VIEWS = [
  { key: 'volume', label: 'Zones' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'trend', label: 'Trend' },
] as const;

type Props = {
  data: MuscleVolumeData;
  isPremium: boolean;
  /** 0 to 1 as the card appears; the volume bars grow from the left with it */
  barsAnim: Animated.Value;
  onInfo: () => void;
  onUnlock: () => void;
};

const TREND_ICON: Record<Trend, keyof typeof Ionicons.glyphMap> = {
  up: 'arrow-up', flat: 'arrow-forward', down: 'arrow-down',
};
const TREND_LABEL: Record<Trend, string> = { up: 'Up', flat: 'Steady', down: 'Down' };
// Pips shown for weekly sessions; a fifth session in a week is rare and reads the same as four
const MAX_PIPS = 4;

function daysAgoStr(iso: string | undefined): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * This week's sets per muscle. Premium picks what the rows show: Zones (a bar
 * against the muscle's minimum / productive / maximum range), Frequency (how
 * many days it was trained) or Trend (the last 4 weeks beside this one). A free
 * account gets the plain set-count bars.
 */
export default function MuscleVolumeCard({ data, isPremium, barsAnim, onInfo, onUnlock }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState<View_>('volume');

  const zoneColor: Record<VolumeZone['kind'], string> = useMemo(() => ({
    over: colors.danger, atLimit: colors.warmup, high: colors.warmup,
    onTrack: colors.accent, toGo: colors.textSecondary, below: colors.textSecondary, none: colors.border,
  }), [colors]);

  // Sunday is the week's last day: from then on, a muscle short of MEV gets
  // its verdict instead of a countdown
  const weekEnd = new Date(data.week_start + 'T12:00:00');
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekOver = toLocalDateStr(new Date()) >= toLocalDateStr(weekEnd);

  const allMuscles = Object.keys(MUSCLE_STANDARDS);
  const trained = allMuscles.filter(m => (data.muscle_sets[m] ?? 0) > 0)
    .sort((a, b) => (data.muscle_sets[b] ?? 0) - (data.muscle_sets[a] ?? 0));
  const untrained = allMuscles.filter(m => !(data.muscle_sets[m] ?? 0));
  const maxSets = Math.max(1, ...trained.map(m => data.muscle_sets[m] ?? 0));
  const shown: View_ = isPremium ? view : 'volume';

  const renderRow = (muscle: string, rowIndex: number) => {
    const sets = data.muscle_sets[muscle] ?? 0;
    const std = MUSCLE_STANDARDS[muscle];
    const isTrained = sets > 0;
    const dim = !isTrained && { color: colors.textSecondary };
    let middle: React.ReactNode;
    let value: React.ReactNode;
    let tail: React.ReactNode;

    if (shown === 'frequency') {
      const sessions = data.session_count?.[muscle] ?? 0;
      const tone = sessions >= GOOD_WEEKLY_SESSIONS ? colors.save : colors.warmup;
      middle = (
        <View style={styles.pips} accessibilityLabel={`${muscle} trained ${sessions} ${sessions === 1 ? 'day' : 'days'} this week`}>
          {Array.from({ length: MAX_PIPS }, (_, i) => (
            <View key={i} style={[styles.pip, { backgroundColor: i < sessions ? tone : colors.border }]} />
          ))}
        </View>
      );
      value = <Text style={[styles.count, dim]}>{sessions > 0 ? `${sessions}×` : '–'}</Text>;
      tail = (
        <Text style={[styles.tail, { color: tone }]} numberOfLines={1}>
          {sessions >= GOOD_WEEKLY_SESSIONS ? 'On target' : sessions === 1 ? 'Add a day' : ''}
        </Text>
      );
    } else if (shown === 'trend') {
      const history = data.weekly_history?.[muscle] ?? [0, 0, 0, 0];
      const weeks = [...history, sets];
      const top = Math.max(...weeks, 1);
      const trend = muscleTrend(data.weekly_history?.[muscle]);
      const tone = trend === 'up' ? colors.save : trend === 'down' ? colors.warmup : colors.textSecondary;
      middle = (
        <View style={styles.spark} accessibilityLabel={`${muscle} sets over the last 4 weeks and this one`}>
          {weeks.map((n, i) => (
            <View
              key={i}
              style={{
                flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2,
                height: Math.max(n > 0 ? 3 : 1, (n / top) * 22),
                // This week is not over, so its bar is the faint one
                backgroundColor: i === weeks.length - 1 ? colors.accent + '66' : n > 0 ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>
      );
      value = trend
        ? <Ionicons name={TREND_ICON[trend]} size={15} color={tone} style={styles.countIcon} accessibilityLabel={`${muscle} trend ${TREND_LABEL[trend]}`} />
        : <Text style={[styles.count, dim]}>–</Text>;
      tail = <Text style={[styles.tail, { color: tone }]} numberOfLines={1}>{trend ? TREND_LABEL[trend] : ''}</Text>;
    } else {
      const zone = volumeZone(sets, std, weekOver);
      const color = zoneColor[zone.kind];
      const start = Math.min(rowIndex * 0.04, 0.4);
      const barGrow = {
        transform: [{ scaleX: barsAnim.interpolate({ inputRange: [start, start + 0.6], outputRange: [0, 1], extrapolate: 'clamp' }) }],
        transformOrigin: 'left' as const,
      };
      middle = isPremium ? (
        <View style={styles.premiumTrack}>
          <Animated.View style={[styles.premiumFill, { width: `${Math.min((sets / std.mrv) * 100, 100)}%` as any, backgroundColor: color }, barGrow]} />
          <View style={[styles.tick, { left: `${(std.mev / std.mrv) * 100}%` as any }]} />
          <View style={[styles.tick, { left: `${(std.mav / std.mrv) * 100}%` as any }]} />
        </View>
      ) : (
        <View style={styles.freeTrack}>
          <Animated.View style={[styles.freeFill, { width: `${(sets / maxSets) * 100}%` as any, backgroundColor: isTrained ? colors.accent : colors.border }, barGrow]} />
        </View>
      );
      value = <Text style={[styles.count, dim]}>{isTrained ? sets : '–'}</Text>;
      tail = isPremium && zone.label
        ? <Text style={[styles.tail, { color }]} numberOfLines={1}>{zone.label}</Text>
        : <Text style={styles.lastTrained} numberOfLines={1}>{daysAgoStr(data.last_trained[muscle])}</Text>;
    }

    return (
      <View key={muscle} style={styles.row}>
        <Text style={[styles.muscle, dim]} numberOfLines={1}>{muscle}</Text>
        <View style={styles.middle}>{middle}</View>
        {value}
        {tail}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>This Week</Text>
          <Text style={styles.weekRange}>{weekRangeLabel(data.week_start)}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.total}>{data.total_sets} working sets</Text>
          <TouchableOpacity onPress={onInfo} accessibilityRole="button" accessibilityLabel="About working sets">
            <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {isPremium && (
        <SegmentedControl options={VIEWS} value={view} onChange={setView} style={styles.segments} />
      )}
      {trained.map((m, i) => renderRow(m, i))}
      {untrained.length > 0 && (
        <>
          <View style={styles.divider}>
            <Text style={styles.dividerText}>Not trained this week</Text>
          </View>
          {untrained.map((m, i) => renderRow(m, trained.length + i))}
        </>
      )}

      {!isPremium && (
        <TouchableOpacity style={styles.teaser} onPress={onUnlock}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.accent} />
          <Text style={[styles.total, { color: colors.accent }]}>Unlock volume zones, frequency, trends and balance</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  weekRange: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  total: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  segments: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.xs },
  muscle: { width: 80, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  middle: { flex: 1 },
  count: { width: 30, fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  countIcon: { width: 30, textAlign: 'right' },
  tail: { width: 78, fontSize: typography.fontSize.xs, fontWeight: '600', textAlign: 'right' },
  lastTrained: { width: 78, fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: 'right' },
  freeTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  freeFill: { height: '100%', borderRadius: 3 },
  premiumTrack: { height: 7, backgroundColor: colors.border, borderRadius: 3, overflow: 'visible', position: 'relative' },
  premiumFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  // textSecondary, not background: past the fill the ticks sit on the border-colored
  // track, and the background grey was 1.1:1 against it, so MEV/MAV vanished
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: colors.textSecondary },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 12, height: 12, borderRadius: 6 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22, maxWidth: 90 },
  divider: { paddingVertical: spacing.xs, marginVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dividerText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  teaser: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
});
