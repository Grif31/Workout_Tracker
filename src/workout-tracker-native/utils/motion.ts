import { AccessibilityInfo, Animated, Easing } from 'react-native';

// Strong curves for UI (Emil Kowalski's values). Animated.timing's own default
// is a gentle ease-in-out that starts slowly, delaying the moment the user is
// watching; never use an ease-in on UI.
/** Entering, exiting, fades and fills: the default for motionTiming. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Moving something that stays on screen, like a tab indicator sliding between tabs. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
/** iOS sheet curve, for a sheet or drawer animated with timing rather than a spring. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

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
 * Eases out with EASE_OUT unless the config names an easing.
 */
export function motionTiming(value: Animated.Value | Animated.ValueXY, config: Animated.TimingAnimationConfig) {
  const c = { easing: EASE_OUT, ...config };
  return Animated.timing(value, reduced ? { ...c, duration: 0, delay: 0 } : c);
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
