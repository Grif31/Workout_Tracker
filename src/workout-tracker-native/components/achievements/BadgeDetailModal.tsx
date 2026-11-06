import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import AchievementBadge from './AchievementBadge';
import BadgeBack from './BadgeBack';
import FlipBadge from './FlipBadge';
import { amountText, badgeDate, earnedLine, goalText, type EarnedState } from '../../utils/achievements';
import { badgeAccessibilityLabel } from '../../constants/achievements';
import type { DistanceUnit } from '../../utils/units';

/** What a tap on any badge opens with */
export interface BadgeDetail {
  /** Omit for an unfound hidden badge */
  key?: string;
  title: string;
  threshold?: number;
  unit: string;
  /** The ladder's lifetime value, for "137 so far" on a locked rung */
  value?: number;
  state?: EarnedState;
}

interface Props {
  detail: BadgeDetail | null;
  weightUnit: string;
  distanceUnit: DistanceUnit;
  onClose: () => void;
  onViewWorkout?: (workoutId: number, cardio: boolean) => void;
  onShare?: (detail: BadgeDetail) => void;
}

const MAX_BADGE = 300;

/**
 * The badge lifted onto a card over the backdrop, then turned over to its
 * engraved back. Tapping it turns it again; Close puts it away. Never a
 * slide-up sheet (TODO §27).
 */
export default function BadgeDetailModal({ detail, weightUnit, distanceUnit, onClose, onViewWorkout, onShare }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const size = Math.min(MAX_BADGE, width - spacing.md * 2 - spacing.lg * 2);
  const [flipped, setFlipped] = useState(false);

  // Lifted face up, then turned over once it's on screen
  useEffect(() => {
    if (!detail) return;
    setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 250);
    return () => clearTimeout(t);
  }, [detail]);

  if (!detail) return null;

  const earned = !!detail.state?.earned;
  const track = detail.key ? detail.key.slice(0, detail.key.lastIndexOf('_')) : '';
  const isLadder = detail.threshold != null;
  const what = detail.key ? earnedLine(detail.key, detail.threshold, detail.unit, distanceUnit) : '';

  const earnedBack = earned && detail.state?.earned_at
    ? { date: badgeDate(detail.state.earned_at), workoutName: detail.state.workout_name, countLine: what || null }
    : undefined;
  const progress = !earned && detail.key
    ? isLadder
      ? {
        goal: goalText(track, detail.threshold!, detail.unit, distanceUnit),
        soFar: detail.value != null ? `${amountText(track, detail.value, detail.unit, distanceUnit)} so far` : null,
        toGo: detail.value != null
          ? `${amountText(track, Math.max(0, detail.threshold! - detail.value), detail.unit, distanceUnit)} to go`
          : null,
      }
      : { goal: what }
    : undefined;

  const label = badgeAccessibilityLabel(detail.title, {
    earnedAt: detail.state?.earned_at,
    value: detail.value, threshold: detail.threshold,
    hiddenUnfound: !detail.key,
  });
  const backLabel = [
    `Back of ${detail.key ? detail.title : 'a hidden badge'}`,
    earnedBack && `earned ${earnedBack.date}`,
    earnedBack?.workoutName && `on ${earnedBack.workoutName}`,
    earnedBack?.countLine,
    progress?.goal, progress?.soFar, progress?.toGo,
  ].filter(Boolean).join(', ');

  const workoutId = detail.state?.workout_id;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
          <Pressable
            onPress={() => setFlipped(f => !f)}
            accessibilityRole="button"
            accessibilityLabel={flipped ? backLabel : label}
            accessibilityHint={flipped ? 'Turns the badge back over' : 'Turns the badge over'}
          >
            <FlipBadge
              size={size}
              flipped={flipped}
              front={
                <AchievementBadge
                  badgeKey={detail.key} size={size} threshold={detail.threshold}
                  weightUnit={weightUnit} locked={!earned}
                />
              }
              back={
                <BadgeBack
                  badgeKey={detail.key} size={size} title={detail.title} threshold={detail.threshold}
                  weightUnit={weightUnit} earned={earnedBack} progress={progress}
                />
              }
            />
          </Pressable>
          <View style={styles.hint}>
            <Ionicons name="sync-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.hintText}>{flipped ? 'Tap to flip back' : 'Tap to flip'}</Text>
          </View>
          {earned && (workoutId || onShare) && (
            <View style={styles.row}>
              {!!workoutId && onViewWorkout && (
                <TouchableOpacity
                  style={[styles.button, styles.secondary]}
                  onPress={() => onViewWorkout(workoutId, !!detail.state?.workout_cardio)}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>View Workout</Text>
                </TouchableOpacity>
              )}
              {onShare && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.accent }]}
                  onPress={() => onShare(detail)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.primaryText, { color: colors.accentText }]}>Share</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity style={[styles.button, styles.secondary, styles.close]} onPress={onClose} accessibilityRole="button">
            <Text style={styles.secondaryText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: typography.fontSize.xs + 2, color: colors.textSecondary },
  row: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm + 2 },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  close: { flex: 0, alignSelf: 'stretch' },
  secondaryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
