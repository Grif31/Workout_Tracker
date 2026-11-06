import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import AchievementBadge from './AchievementBadge';
import BadgeGlow from './BadgeGlow';
import SetDownBadge from './SetDownBadge';
import AchievementShareCard from '../share/AchievementShareCard';
import { captureAndShare } from '../../utils/shareCapture';
import { motionSpring, motionTiming } from '../../utils/motion';
import { orderUnlocks, shareLine, unlockLine, type NewAchievement } from '../../utils/achievements';
import { BACK_INK, badgeAccessibilityLabel, badgeLook } from '../../constants/achievements';
import { BADGE_METALS } from '../../constants/badgeArt';
import type { DistanceUnit } from '../../utils/units';

interface Props {
  /** A save's `new_achievements`; the sheet shows when there's at least one */
  items: NewAchievement[];
  visible: boolean;
  weightUnit: string;
  distanceUnit: DistanceUnit;
  /** Read once when the sheet opens: with it on the badge is simply there, with no drop and no confetti */
  reduceMotion: boolean;
  onClose: () => void;
}

const BADGE = 150;
const DISMISS_DRAG = 80;

/**
 * An unlock on the workout summary (TODO §27): the finest new badge, its name
 * and one line of what it took and what's next, with "+N more" for the rest.
 * No ladder dots or "5 of 8 earned": those live on the track ladder screen.
 */
export default function AchievementUnlockSheet({ items, visible, weightUnit, distanceUnit, reduceMotion, onClose }: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const ordered = useMemo(() => orderUnlocks(items), [items]);
  const lead = ordered[0];
  const rest = ordered.slice(1);

  const offscreen = Dimensions.get('window').height;
  const slide = useRef(new Animated.Value(offscreen)).current;
  const glow = useRef(new Animated.Value(1)).current;
  // The badge is set down once the sheet is up
  const [placing, setPlacing] = useState(false);
  const confettiRef = useRef<ConfettiCannon>(null);
  const shareRef = useRef<View>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (!visible || !lead) return;
    closing.current = false;
    slide.setValue(offscreen);
    glow.setValue(reduceMotion ? 1 : 0);
    setPlacing(false);
    motionTiming(slide, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => {
      // Not when cut short by the sheet going away
      if (finished) setPlacing(true);
    });
  }, [visible]);

  const landed = () => {
    if (reduceMotion) return;
    motionTiming(glow, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    confettiRef.current?.start();
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    motionTiming(slide, { toValue: offscreen, duration: 220, useNativeDriver: true }).start(({ finished }) => { if (finished) onClose(); });
  };

  // Drag the sheet down to put it away; only a mostly vertical drag claims the touch, so taps reach the buttons
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slide.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_DRAG || g.vy > 0.8) close();
      else motionSpring(slide, { toValue: 0, friction: 8, useNativeDriver: true }).start();
    },
  }), []);

  if (!lead) return null;

  const look = badgeLook(lead.key, { threshold: lead.threshold, weightUnit });
  const unit = lead.unit ?? distanceUnit;
  const line = unlockLine(lead, distanceUnit);
  // The badge's own metal names the moment; its pale ink fails on white, so light mode takes the dark face
  const labelColor = mode === 'light' ? BACK_INK[look.metal].faceTop : BACK_INK[look.metal].rule;
  const confettiColors = [BADGE_METALS[look.metal].rim[0][1], BADGE_METALS[look.metal].rim[1][1], BADGE_METALS[look.metal].rim[2][1]];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.offscreen} collapsable={false} pointerEvents="none">
        <AchievementShareCard
          ref={shareRef}
          badgeKey={lead.key}
          title={lead.title}
          threshold={lead.threshold}
          weightUnit={weightUnit}
          line={shareLine(lead.key, lead.threshold, unit, distanceUnit, lead.earned_at)}
          accentColor={colors.accentDark}
        />
      </View>

      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY: slide }] }]}
        accessibilityViewIsModal
        {...pan.panHandlers}
      >
        <View style={styles.grabber} />
        <Text style={[styles.kicker, { color: labelColor }]} accessibilityRole="header">ACHIEVEMENT UNLOCKED</Text>
        <BadgeGlow metal={look.metal} size={180} glowOpacity={glow}>
          <SetDownBadge play={placing} size={BADGE} metal={look.metal} delay={80} onLand={landed}>
            <AchievementBadge
              badgeKey={lead.key} size={BADGE} threshold={lead.threshold} weightUnit={weightUnit}
              accessibilityLabel={badgeAccessibilityLabel(lead.title, { earnedAt: lead.earned_at })}
            />
          </SetDownBadge>
        </BadgeGlow>
        <Text style={styles.title}>{lead.title}</Text>
        <Text style={styles.line}>{line}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => captureAndShare(shareRef, 'Share your badge')}
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.secondaryText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={close}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { color: colors.accentText }]}>Continue</Text>
          </TouchableOpacity>
        </View>
        {rest.length > 0 && (
          <Text style={styles.more} numberOfLines={2}>
            +{rest.length} more unlocked: {rest.map(r => r.title).join(', ')}
          </Text>
        )}
      </Animated.View>

      {!reduceMotion && (
        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
          colors={confettiColors}
          fadeOut
          autoStart={false}
        />
      )}
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  offscreen: { position: 'absolute', left: -9999, top: -9999 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.sm + 4,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  line: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  row: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm + 2, marginTop: 6 },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '600' },
  primaryText: { fontSize: typography.fontSize.md, fontWeight: '700' },
  more: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
