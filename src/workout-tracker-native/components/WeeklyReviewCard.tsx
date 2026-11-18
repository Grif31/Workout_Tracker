import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch, isNetworkError } from '../utils/api';
import GenerateAction from './GenerateAction';
import { syncServerPremium } from '../utils/premiumSync';
import { loadCoachProfile } from '../utils/coachProfile';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// The parts come back in this order; the first one present is what a free account reads
const PARTS = [
  { key: 'went_well', label: 'Went well', icon: 'checkmark', tone: 'accent' },
  { key: 'lagged', label: 'Lagged', icon: 'arrow-down', tone: 'warmup' },
  { key: 'next_change', label: 'Next week', icon: 'arrow-forward', tone: 'info' },
] as const;

const MONTH = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });

// "Oct 12 to 18", or "Sep 28 to Oct 4" across a month
function fmtWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const endText = end.getMonth() === start.getMonth() ? `${end.getDate()}` : `${MONTH(end)} ${end.getDate()}`;
  return `${MONTH(start)} ${start.getDate()} to ${endText}`;
}

type PartKey = typeof PARTS[number]['key'];
export type ReviewPart = { title: string; body: string };
type Review = Partial<Record<PartKey, ReviewPart>>;
// locked: the parts the server held back from a free account (absent in a cache from an older build)
type Cache = { weekStart: string; review: Review; locked?: PartKey[] };

// Per user: `${WEEKLY_REVIEW_KEY}_${userId}`. The review for one summary week,
// so a week is asked for once and reopening the screen costs nothing.
export const WEEKLY_REVIEW_KEY = 'weekly_coach_review';

type Props = {
  /** The summary week's Monday, the cache key. */
  weekStart: string;
  isPremium: boolean;
  onUnlock: () => void;
  /** Changed by a screen that stays mounted (Coach) to re-read the saved review, which Weekly Summary may have written since. */
  reloadToken?: number;
};

export default function WeeklyReviewCard({ weekStart, isPremium, onUnlock, reloadToken }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const storageKey = `${WEEKLY_REVIEW_KEY}_${user?.id}`;

  const [review, setReview] = useState<Review | null>(null);
  const [heldBack, setHeldBack] = useState<PartKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Another week (Weekly Summary's arrows) never shows the last week's review while the cache is read
  useEffect(() => {
    setReview(null);
    setHeldBack([]);
    setFailed(false);
  }, [storageKey, weekStart]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then(raw => {
      if (cancelled) return;
      let cache: Cache | null = null;
      try { cache = raw ? JSON.parse(raw) : null; } catch { }
      // A review the server trimmed for a free account is incomplete once they upgrade: ask again
      const usable = !!cache && cache.weekStart === weekStart && Object.keys(cache.review ?? {}).length > 0
        && !(isPremium && cache.locked?.length);
      setReview(usable ? cache!.review : null);
      setHeldBack(usable ? cache!.locked ?? [] : []);
      if (!usable) setFailed(false);
    });
    return () => { cancelled = true; };
  }, [storageKey, weekStart, user?.id, isPremium, reloadToken]);

  const generate = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // The device's copy is the newest; without one the server reads its stored profile
      const profile = await loadCoachProfile(user?.id);
      const res = await apiFetch('/api/ai/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile
          ? { experience: profile.experience, goal: profile.goal, avoid: profile.avoid, notes: profile.notes, week_start: weekStart }
          : { week_start: weekStart }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Couldn't Load Review", data.message || 'Try again in a moment.'); return; }
      const next: Review = data.review ?? {};
      const locked: PartKey[] = Array.isArray(data.locked) ? data.locked : [];
      // The server says free but the store says Premium: it hasn't heard yet. Tell it, and ask again shortly.
      if (isPremium && locked.length) {
        syncServerPremium();
        Alert.alert('Almost There', 'Your Premium is still reaching our servers. Try again in a moment.');
        return;
      }
      // Every part failed its check against the data: nothing worth keeping for the week
      if (!Object.keys(next).length) { setFailed(true); return; }
      setReview(next);
      setHeldBack(locked);
      await AsyncStorage.setItem(storageKey, JSON.stringify({ weekStart, review: next, locked } satisfies Cache));
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Review", 'Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [storageKey, weekStart, user?.id, isPremium]);

  const present = review ? PARTS.filter(p => review[p.key]) : [];
  // Free accounts read the first part; a response that still carries the others is trimmed here
  const visible = isPremium ? present : present.slice(0, 1);
  const showUpsell = !isPremium && (heldBack.length > 0 || present.length > 1);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Weekly Review</Text>
        <Text style={styles.headerDate}>{fmtWeek(weekStart)}</Text>
      </View>
      {review ? (
        <>
          {visible.map(p => (
            <View key={p.key} style={styles.part}>
              <View style={[styles.partIcon, { backgroundColor: colors[p.tone] + '26' }]}>
                <Ionicons name={p.icon} size={14} color={colors[p.tone]} />
              </View>
              <View style={styles.partText}>
                <Text style={styles.partLabel}>{p.label}</Text>
                <Text style={styles.partBody}>{review[p.key]!.body}</Text>
              </View>
            </View>
          ))}
          {showUpsell && (
            <View style={styles.upsell}>
              <Text style={styles.upsellText}>Premium shows the full review, plus insights whenever you want them.</Text>
              <TouchableOpacity style={styles.upgradeBtn} onPress={onUnlock} accessibilityRole="button">
                <Text style={styles.upgradeBtnText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <GenerateAction
          message={failed
            ? "The Coach couldn't back a review with this week's data. Try again later."
            : isPremium
              ? 'What went well, what lagged, and one change for next week.'
              : 'Your free weekly read from the Coach.'}
          label={failed ? 'Try Again' : 'Get Review'}
          loading={loading}
          onPress={generate}
          accessibilityLabel={failed ? 'Try again' : 'Get weekly review'}
          loadingAccessibilityLabel="Writing weekly review"
        />
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headerLabel: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  headerDate: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  part: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
  partIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  partText: { flex: 1, gap: 2 },
  partLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  partBody: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  upsell: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  upsellText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  upgradeBtn: {
    backgroundColor: colors.accent, borderRadius: 999,
    paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center',
  },
  upgradeBtnText: { color: colors.accentText, fontSize: typography.fontSize.sm, fontWeight: '700' },
});
