import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch, isNetworkError } from '../utils/api';
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
type Cache = { weekStart: string; review: Review };

// Per user: `${WEEKLY_REVIEW_KEY}_${userId}`. The review for one summary week,
// so a week is asked for once and reopening the screen costs nothing.
export const WEEKLY_REVIEW_KEY = 'weekly_coach_review';

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 48;

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
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The button narrows into a circle holding a star that pulses while the
  // review is written. Width is a layout prop so it can't use the native
  // driver; the pulse is transform/opacity only and does.
  const morph = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(morph, {
      toValue: loading ? 1 : 0, duration: loading ? 280 : 220,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    if (!loading) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [loading, morph, pulse]);
  const buttonWidth = morph.interpolate({ inputRange: [0, 1], outputRange: [BUTTON_WIDTH, BUTTON_HEIGHT] });
  const labelOpacity = morph.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const starOpacity = morph.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const starScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.3] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  useEffect(() => {
    setReview(null);
    setFailed(false);
    if (!user?.id) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then(raw => {
      if (cancelled || !raw) return;
      try {
        const cache: Cache = JSON.parse(raw);
        if (cache.weekStart === weekStart && Object.keys(cache.review ?? {}).length) setReview(cache.review);
      } catch { }
    });
    return () => { cancelled = true; };
  }, [storageKey, weekStart, user?.id]);

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
      // Every part failed its check against the data: nothing worth keeping for the week
      if (!Object.keys(next).length) { setFailed(true); return; }
      setReview(next);
      await AsyncStorage.setItem(storageKey, JSON.stringify({ weekStart, review: next } satisfies Cache));
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Review", 'Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [storageKey, weekStart, user?.id]);

  const present = review ? PARTS.filter(p => review[p.key]) : [];
  // Free accounts read the first part in full; the others stay as locked rows
  const visible = isPremium ? present : present.slice(0, 1);
  const locked = isPremium ? [] : present.slice(1);

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
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="sparkles-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {failed
              ? "The Coach couldn't back a review with this week's data. Try again later."
              : isPremium
                ? 'What went well, what lagged, and one change for next week.'
                : 'One part of your weekly review is free. Premium shows all three.'}
          </Text>
          <TouchableOpacity
            onPress={generate}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={loading ? "Writing Coach's read" : failed ? 'Try again' : "Get Coach's read"}
          >
            <Animated.View style={[styles.button, { width: buttonWidth }]}>
              <Animated.Text style={[styles.buttonText, { opacity: labelOpacity }]} numberOfLines={1}>
                {failed ? 'Try Again' : "Get Coach's Read"}
              </Animated.Text>
              {/* Two layers because one view can't be driven by both the JS morph and the native pulse */}
              <Animated.View pointerEvents="none" style={[styles.star, { opacity: starOpacity }]}>
                <Animated.View style={{ opacity: glowOpacity, transform: [{ scale: starScale }] }}>
                  <Ionicons name="sparkles" size={24} color={colors.accentText} />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
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
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 },
  button: {
    height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  buttonText: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.accentText },
  star: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
