import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import type { LiftVelocity } from './ProgressRateCard';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// Per user: `${PLATEAU_DISMISSED_KEY}_${userId}`. JSON { [exerciseTemplateId]: dismissedAtMs }.
// A dismissed lift stays quiet for REMIND_AFTER_DAYS, then is flagged again if it is still flat.
export const PLATEAU_DISMISSED_KEY = 'plateau_dismissed';
export const REMIND_AFTER_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  isPremium: boolean;
  onOpenLift: (lift: { exerciseId: number; exerciseName: string }) => void;
};

/** A dismissible card naming the most-trained lift that has stopped gaining. Premium only. */
export default function PlateauNudge({ isPremium, onOpenLift }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const storageKey = `${PLATEAU_DISMISSED_KEY}_${user?.id}`;
  const [lift, setLift] = useState<LiftVelocity | null>(null);

  useEffect(() => {
    if (!isPremium || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [res, raw] = await Promise.all([apiFetch('/api/stats/pr-velocity'), AsyncStorage.getItem(storageKey)]);
        if (!res.ok || cancelled) return;
        let dismissed: Record<string, number> = {};
        try { dismissed = raw ? JSON.parse(raw) : {}; } catch { }
        const data = await res.json();
        const next = (data.exercises as LiftVelocity[] | undefined)?.find(e =>
          e.status === 'plateau' && e.exercise_name
          && Date.now() - (dismissed[String(e.exercise_template_id)] ?? 0) > REMIND_AFTER_DAYS * DAY_MS);
        if (!cancelled) setLift(next ?? null);
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [isPremium, user?.id, storageKey]);

  const dismiss = useCallback(async () => {
    if (!lift) return;
    setLift(null);
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const dismissed = raw ? JSON.parse(raw) : {};
      dismissed[String(lift.exercise_template_id)] = Date.now();
      await AsyncStorage.setItem(storageKey, JSON.stringify(dismissed));
    } catch { }
  }, [lift, storageKey]);

  if (!isPremium || !lift) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="pause-circle-outline" size={20} color={colors.warmup} />
        <Text style={styles.title}>{lift.exercise_name} has plateaued</Text>
      </View>
      <Text style={styles.body}>
        Its estimated 1RM has not moved in 8 weeks. A lighter week, then a new rep range or variation, often gets it moving again.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={dismiss} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.secondary}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onOpenLift({ exerciseId: lift.exercise_template_id, exerciseName: lift.exercise_name! })}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.primary}>See the lift</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: spacing.sm + 4, padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.warmup,
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.lg },
  secondary: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  primary: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.accent },
});
