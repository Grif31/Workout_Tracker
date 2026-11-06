import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { motionSpring, motionTiming, reduceMotion } from '../../utils/motion';
import { BACK_INK, SET_DOWN_SHADOW } from '../../constants/achievements';
import type { BadgeMetal } from '../../constants/badgeArt';

// Held above its place, larger as if nearer and a little askew, then set down
const LIFT = -28;
const SCALE = 1.7;
const TILT = '-7deg';
const FALL_MS = 320;

interface Props {
  /** Starts the drop; until then the badge isn't shown */
  play: boolean;
  /** The badge's drawn size, for its shadow and the ring it sends out */
  size: number;
  /** The ring's colour on landing */
  metal: BadgeMetal;
  delay?: number;
  haptic?: Haptics.ImpactFeedbackStyle;
  /** When it touches down: the unlock sheet lights its glow and fires confetti */
  onLand?: () => void;
  children: React.ReactNode;
}

/**
 * A badge set down by hand (unlock sheet, Trophy Hall's top badges). It falls
 * faster as it comes down, straightening as it goes, over a shadow that
 * tightens and darkens beneath it; on touching down it gives a small squash, a
 * ring in its metal ripples out, and a haptic thud. Under Reduce Motion it's
 * simply there, and the thud and `onLand` still come.
 */
export default function SetDownBadge({ play, size, metal, delay = 0, haptic = Haptics.ImpactFeedbackStyle.Heavy, onLand, children }: Props) {
  const reduced = reduceMotion();
  // 0 held up, 1 set down
  const drop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const settle = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  // The cast shadow, until the badge's own drop shadow takes over on landing
  const shadow = useRef(new Animated.Value(reduced ? 0 : 0.15)).current;
  const styles = useMemo(() => createStyles(size, BACK_INK[metal].rule), [size, metal]);

  useEffect(() => {
    if (!play) return;
    const land = () => {
      Haptics.impactAsync(haptic);
      onLand?.();
      ripple.setValue(0);
      Animated.parallel([
        Animated.sequence([
          motionTiming(settle, { toValue: 0.93, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          motionSpring(settle, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
        ]),
        motionTiming(ripple, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        motionTiming(shadow, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    };
    const fall = { duration: FALL_MS, delay, easing: Easing.in(Easing.quad), useNativeDriver: true };
    // The shadow darkens as the badge nears the surface
    const anim = Animated.parallel([
      motionTiming(drop, { ...fall, toValue: 1 }),
      motionTiming(shadow, { ...fall, toValue: 1 }),
    ]);
    // Not when cut short by the badge going away
    anim.start(({ finished }) => { if (finished) land(); });
    return () => anim.stop();
  }, [play]);

  return (
    <View style={styles.box}>
      <Animated.View
        pointerEvents="none"
        style={[styles.shadow, {
          opacity: shadow,
          transform: [{ scaleX: drop.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
        }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, {
          opacity: ripple.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.35, 0] }),
          transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
        }]}
      />
      <Animated.View
        style={{
          opacity: drop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [LIFT, 0] }) },
            { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: [TILT, '0deg'] }) },
            { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [SCALE, 1] }) },
            { scale: settle },
          ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// The badge art fills about 80% of its box (a 64-unit pin in an 80-unit view)
const createStyles = (size: number, ringColor: string) => StyleSheet.create({
  box: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
  shadow: {
    position: 'absolute',
    bottom: size * 0.06,
    width: size * 0.6,
    height: size * 0.12,
    borderRadius: size,
    backgroundColor: SET_DOWN_SHADOW,
  },
  ring: {
    position: 'absolute',
    width: size * 0.82,
    height: size * 0.82,
    borderRadius: size,
    borderWidth: 1,
    borderColor: ringColor,
  },
});
