import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch, isNetworkError } from '../utils/api';
import GenerateAction from './GenerateAction';
import { syncServerPremium } from '../utils/premiumSync';
import { COACH_PROFILE_KEY, DEFAULT_PROFILE, type CoachProfile } from './coach/CoachProfileModal';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// The parts come back in this order; the first one present is what a free account reads
const PARTS = [
  { key: 'went_well', label: 'Went well', icon: 'checkmark-circle-outline' },
  { key: 'lagged', label: 'Lagged', icon: 'alert-circle-outline' },
  { key: 'next_change', label: 'Change for next week', icon: 'arrow-forward-circle-outline' },
] as const;

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
};

export default function WeeklyReviewCard({ weekStart, isPremium, onUnlock }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const storageKey = `${WEEKLY_REVIEW_KEY}_${user?.id}`;

  const [review, setReview] = useState<Review | null>(null);
  const [heldBack, setHeldBack] = useState<PartKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReview(null);
    setHeldBack([]);
    setFailed(false);
    if (!user?.id) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then(raw => {
      if (cancelled || !raw) return;
      try {
        const cache: Cache = JSON.parse(raw);
        if (cache.weekStart !== weekStart || !Object.keys(cache.review ?? {}).length) return;
        // A review the server trimmed for a free account is incomplete once they upgrade: ask again
        if (isPremium && cache.locked?.length) return;
        setReview(cache.review);
        setHeldBack(cache.locked ?? []);
      } catch { }
    });
    return () => { cancelled = true; };
  }, [storageKey, weekStart, user?.id, isPremium]);

  const generate = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // The coach profile lives on the device only, so it is sent with the request
      let profile: CoachProfile = DEFAULT_PROFILE;
      try {
        const raw = await AsyncStorage.getItem(`${COACH_PROFILE_KEY}_${user?.id}`);
        if (raw) profile = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
      } catch { }
      const res = await apiFetch('/api/ai/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experience: profile.experience, goal: profile.goal, avoid: profile.avoid, week_start: weekStart }),
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
  // Free accounts read the first part in full; the others stay as locked rows. The server
  // names the ones it held back; a response that still carries them is trimmed here.
  const visible = isPremium ? present : present.slice(0, 1);
  const locked = isPremium ? [] : PARTS.filter(p => heldBack.includes(p.key) || present.slice(1).some(q => q.key === p.key));

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Coach's Read</Text>
      {review ? (
        <View style={styles.card}>
          {visible.map((p, i) => (
            <View key={p.key} style={[styles.part, i > 0 && styles.partDivider]}>
              <View style={styles.partHeader}>
                <Ionicons name={p.icon} size={16} color={colors.accent} />
                <Text style={styles.partLabel}>{p.label}</Text>
              </View>
              <Text style={styles.partTitle}>{review[p.key]!.title}</Text>
              <Text style={styles.partBody}>{review[p.key]!.body}</Text>
            </View>
          ))}
          {locked.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.part, styles.partDivider, styles.lockedRow]}
              onPress={onUnlock}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}, part of Premium`}
            >
              <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
              <Text style={styles.lockedLabel}>{p.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
          {locked.length > 0 && (
            <Text style={styles.upsellNote}>Your free read shows one part a week. Premium shows all three.</Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <GenerateAction
            message={failed
              ? "The Coach couldn't back a review with this week's data. Try again later."
              : isPremium
                ? 'What went well, what lagged, and one change for next week.'
                : 'One part of your weekly review is free. Premium shows all three.'}
            label={failed ? 'Try Again' : "Get Coach's Read"}
            loading={loading}
            onPress={generate}
            accessibilityLabel={failed ? 'Try again' : "Get Coach's read"}
            loadingAccessibilityLabel="Writing Coach's read"
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  wrap: { gap: spacing.sm },
  sectionTitle: {
    fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  card: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  part: { padding: spacing.md, gap: spacing.xs },
  partDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  partHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  partLabel: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  partTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  partBody: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockedLabel: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  upsellNote: {
    fontSize: typography.fontSize.xs, color: colors.textSecondary,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
});
