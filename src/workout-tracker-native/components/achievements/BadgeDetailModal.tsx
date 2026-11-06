import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import AchievementBadge from './AchievementBadge';
import BadgeBack from './BadgeBack';
import FlipBadge from './FlipBadge';
import AchievementShareCard from '../share/AchievementShareCard';
import { captureAndShare } from '../../utils/shareCapture';
import { amountText, badgeDate, earnedLine, goalText, shareLine, type EarnedState } from '../../utils/achievements';
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
}

const MAX_BADGE = 300;
/** The fade-in, then a moment on the front */
const FLIP_DELAY_MS = 600;

/**
 * The badge lifted onto a card over the backdrop, then turned over to its
 * engraved back. Tapping it turns it again; Close puts it away. Never a
 * slide-up sheet (TODO §27).
 */
export default function BadgeDetailModal({ detail, weightUnit, distanceUnit, onClose, onViewWorkout }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const size = Math.min(MAX_BADGE, width - spacing.md * 2 - spacing.lg * 2);
  const [flipped, setFlipped] = useState(false);
  const shareRef = useRef<View>(null);

  // Lifted face up, then turned over once it's been seen: the modal's fade
  // takes about 300 ms, and turning sooner hid the front entirely
  useEffect(() => {
    // Reset on close, not on open: this component outlives the modal, and a
    // reset on open let the next badge render back side up for a frame first
    if (!detail) { setFlipped(false); return; }
    const t = setTimeout(() => setFlipped(true), FLIP_DELAY_MS);
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
  const canShare = earned && !!detail.key;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {canShare && (
        // Off screen, for the capture. Inside the Modal, so it's mounted only while the badge is open
        <View style={styles.offscreen} collapsable={false} pointerEvents="none">
          <AchievementShareCard
            ref={shareRef}
            badgeKey={detail.key!}
            title={detail.title}
            threshold={detail.threshold}
            weightUnit={weightUnit}
            line={shareLine(detail.key!, detail.threshold, detail.unit, distanceUnit, detail.state?.earned_at ?? null)}
            accentColor={colors.accentDark}
          />
        </View>
      )}
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
          {earned && (
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
              {canShare && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.accent }]}
                  onPress={() => captureAndShare(shareRef, 'Share your badge')}
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
  offscreen: { position: 'absolute', left: -9999, top: -9999 },
  secondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  close: { flex: 0, alignSelf: 'stretch' },
  secondaryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
