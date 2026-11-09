import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, Modal, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { BadgeMetal } from '../../constants/badgeArt';
import type { DistanceUnit } from '../../utils/units';

interface Props {
  /** A save's `new_achievements`; the sheet shows when there's at least one */
  items: NewAchievement[];
  visible: boolean;
  weightUnit: string;
  distanceUnit: DistanceUnit;
  /** Read once when the sheet opens: with it on the badge is simply there, with no drop */
  reduceMotion: boolean;
  onClose: () => void;
  /** Opens the Trophy Hall, once the sheet has slid away */
  onOpenTrophyHall: () => void;
}

const BADGE = 150;
const DISMISS_DRAG = 80;
const SIDE = 20;

/** One new badge: set down the first time its page is shown, its glow lit on landing */
function UnlockPage({ item, width, play, lead, weightUnit, distanceUnit, reduceMotion, onLand }: {
  item: NewAchievement;
  width: number;
  play: boolean;
  lead: boolean;
  weightUnit: string;
  distanceUnit: DistanceUnit;
  reduceMotion: boolean;
  onLand?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const look = badgeLook(item.key, { threshold: item.threshold, weightUnit });
  const glow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  const landed = () => {
    if (!reduceMotion) motionTiming(glow, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    onLand?.();
  };

  return (
    <View style={[styles.page, { width }]}>
      <BadgeGlow metal={look.metal} size={180} glowOpacity={glow}>
        <SetDownBadge
          play={play} size={BADGE} metal={look.metal} delay={lead ? 80 : 0} onLand={landed}
          // The first badge lands hard; the ones swiped to after it, lighter
          haptic={lead ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium}
        >
          <AchievementBadge
            badgeKey={item.key} size={BADGE} threshold={item.threshold} weightUnit={weightUnit}
            accessibilityLabel={badgeAccessibilityLabel(item.title, { earnedAt: item.earned_at })}
          />
        </SetDownBadge>
      </BadgeGlow>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.line}>{unlockLine(item, distanceUnit)}</Text>
    </View>
  );
}

/**
 * An unlock on the workout summary (TODO §27): each new badge, its name and
 * one line of what it took and what's next, finest first, swiped through when
 * a save earned several. No ladder dots or "5 of 8 earned": those live on the
 * track ladder screen.
 */
export default function AchievementUnlockSheet({
  items, visible, weightUnit, distanceUnit, reduceMotion, onClose, onOpenTrophyHall,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const ordered = useMemo(() => orderUnlocks(items), [items]);
  const lead = ordered[0];

  const offscreen = Dimensions.get('window').height;
  const slide = useRef(new Animated.Value(offscreen)).current;
  // Measured, so a page is exactly the pager's width wherever the sheet is laid out
  const [pageWidth, setPageWidth] = useState(Dimensions.get('window').width - SIDE * 2);
  const [page, setPage] = useState(0);
  // Pages whose badge has been set down: each lands the first time it's shown, once the sheet is up
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const sheetUp = useRef(false);
  // The page on screen, read when the sheet finishes arriving
  const pageRef = useRef(0);
  const shareRef = useRef<View>(null);
  const pagerRef = useRef<ScrollView>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (!visible || !lead) return;
    closing.current = false;
    sheetUp.current = false;
    slide.setValue(offscreen);
    setPage(0);
    pageRef.current = 0;
    setPlaced(new Set());
    pagerRef.current?.scrollTo({ x: 0, animated: false });
    motionTiming(slide, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => {
      // Not when cut short by the sheet going away
      if (!finished) return;
      sheetUp.current = true;
      // A swipe during the slide-in would otherwise leave that page's badge never set down
      setPlaced(new Set([0, pageRef.current]));
    });
  }, [visible]);

  const showPage = (index: number) => {
    setPage(index);
    pageRef.current = index;
    if (sheetUp.current) setPlaced(prev => (prev.has(index) ? prev : new Set(prev).add(index)));
  };

  const onPagerSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    showPage(Math.max(0, Math.min(ordered.length - 1, index)));
  };

  const goToPage = (index: number) => {
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: !reduceMotion });
    showPage(index);
  };

  const close = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    motionTiming(slide, { toValue: offscreen, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      onClose();
      then?.();
    });
  };

  // Drag the sheet down to put it away; only a mostly vertical drag claims the touch,
  // so taps reach the buttons and sideways swipes reach the pager
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slide.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_DRAG || g.vy > 0.8) close();
      else motionSpring(slide, { toValue: 0, friction: 8, useNativeDriver: true }).start();
    },
  }), []);

  if (!lead) return null;

  const current = ordered[Math.min(page, ordered.length - 1)];
  const metalOf = (item: NewAchievement): BadgeMetal => badgeLook(item.key, { threshold: item.threshold, weightUnit }).metal;
  const metal = metalOf(current);
  const unit = current.unit ?? distanceUnit;
  const several = ordered.length > 1;
  // The badge's own metal names the moment; its pale ink fails on white, so light mode takes the dark face
  const labelColor = mode === 'light' ? BACK_INK[metal].faceTop : BACK_INK[metal].rule;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close()} statusBarTranslucent>
      <View style={styles.offscreen} collapsable={false} pointerEvents="none">
        <AchievementShareCard
          ref={shareRef}
          badgeKey={current.key}
          title={current.title}
          threshold={current.threshold}
          weightUnit={weightUnit}
          line={shareLine(current.key, current.threshold, unit, distanceUnit, current.earned_at)}
          accentColor={colors.accentDark}
        />
      </View>

      <Pressable style={styles.backdrop} onPress={() => close()} accessibilityLabel="Close" accessibilityRole="button" />

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: slide }] }]}
        accessibilityViewIsModal
        {...pan.panHandlers}
      >
        <View style={styles.grabber} />
        <Text style={[styles.kicker, { color: labelColor }]} accessibilityRole="header">
          {several ? `${ordered.length} ACHIEVEMENTS UNLOCKED` : 'ACHIEVEMENT UNLOCKED'}
        </Text>
        <ScrollView
          ref={pagerRef}
          testID="unlock-pager"
          horizontal
          pagingEnabled
          scrollEnabled={several}
          showsHorizontalScrollIndicator={false}
          onLayout={e => setPageWidth(e.nativeEvent.layout.width)}
          onMomentumScrollEnd={onPagerSettle}
          style={styles.pager}
        >
          {ordered.map((item, i) => (
            <UnlockPage
              key={item.key}
              item={item}
              width={pageWidth}
              play={placed.has(i)}
              lead={i === 0}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              reduceMotion={reduceMotion}
            />
          ))}
        </ScrollView>
        {several && (
          <View
            style={styles.dots}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Badge ${page + 1} of ${ordered.length}`}
            accessibilityHint="Swipe up or down to see the other badges"
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={e => {
              if (e.nativeEvent.actionName === 'increment' && page < ordered.length - 1) goToPage(page + 1);
              if (e.nativeEvent.actionName === 'decrement' && page > 0) goToPage(page - 1);
            }}
          >
            {ordered.map((item, i) => (
              <TouchableOpacity key={item.key} testID={`unlock-dot-${i}`} onPress={() => goToPage(i)} hitSlop={8}>
                <View style={[styles.dot, { backgroundColor: i === page ? colors.textPrimary : colors.border }]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => captureAndShare(shareRef, 'Share your badge')}
            accessibilityRole="button"
            accessibilityLabel={`Share ${current.title}`}
          >
            <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.secondaryText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => close()}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { color: colors.accentText }]}>Continue</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.hallLink} onPress={() => close(onOpenTrophyHall)} accessibilityRole="button">
          <Ionicons name="trophy-outline" size={16} color={colors.accent} />
          <Text style={[styles.hallLinkText, { color: colors.accent }]}>See your Trophy Hall</Text>
        </TouchableOpacity>
      </Animated.View>
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
    paddingHorizontal: SIDE,
    alignItems: 'center',
    gap: 14,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  pager: { alignSelf: 'stretch', flexGrow: 0 },
  page: { alignItems: 'center', gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  line: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
  hallLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing.md, marginTop: -6 },
  hallLinkText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
});
