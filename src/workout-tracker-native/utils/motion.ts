import { AccessibilityInfo, Animated } from 'react-native';

// The system Reduce Motion setting, read once at launch and kept current, so
// an animation started from a handler can check it without a hook. Reanimated's
// layout animations (entering={FadeInDown}) already follow it on their own.
let reduced = false;
AccessibilityInfo.isReduceMotionEnabled().then(v => { reduced = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', v => { reduced = v; });

export const reduceMotion = () => reduced;

/** Tests only */
export function setReduceMotionForTests(value: boolean): void {
  reduced = value;
}

/**
 * Animated.timing for decorative motion: with Reduce Motion on it jumps to the
 * end at once (its callback still runs). Not for an infinite loop, which would
 * spin at 0 ms, or timing that means something, like a hold-to-confirm fill.
 */
export function motionTiming(value: Animated.Value | Animated.ValueXY, config: Animated.TimingAnimationConfig) {
  return Animated.timing(value, reduced ? { ...config, duration: 0, delay: 0 } : config);
}

/** Animated.spring for decorative motion: an instant jump to the end with Reduce Motion on. */
export function motionSpring(value: Animated.Value | Animated.ValueXY, config: Animated.SpringAnimationConfig) {
  return reduced
    ? Animated.timing(value, {
      toValue: config.toValue as Animated.TimingAnimationConfig['toValue'],
      duration: 0,
      useNativeDriver: config.useNativeDriver,
    })
    : Animated.spring(value, config);
}
