import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { reduceMotion } from '../../utils/motion';

interface Props {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped: boolean;
  size: number;
}

const FLIP_MS = 420;
const FADE_MS = 200;

/**
 * Turns a badge over to its engraved back. RN Animated on the native driver,
 * not Reanimated (worklets crash in this app). With Reduce Motion on the turn
 * becomes a crossfade.
 */
export default function FlipBadge({ front, back, flipped, size }: Props) {
  const progress = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const fade = useRef(reduceMotion()).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: flipped ? 1 : 0,
      duration: fade ? FADE_MS : FLIP_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [flipped, fade, progress]);

  const frontStyle = fade
    ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : { transform: [{ perspective: 800 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] };
  const backStyle = fade
    ? { opacity: progress }
    : { transform: [{ perspective: 800 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }] };

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[styles.face, frontStyle]}
        pointerEvents={flipped ? 'none' : 'auto'}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={flipped}
      >
        {front}
      </Animated.View>
      <Animated.View
        style={[styles.face, backStyle]}
        pointerEvents={flipped ? 'auto' : 'none'}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!flipped}
      >
        {back}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    ...StyleSheet.absoluteFill,
    backfaceVisibility: 'hidden',
  },
});
