import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { SPLASH_BG, SPLASH_IMAGE } from './SplashView';

// The logo's centre in Arete_splash.png, as fractions of the image, so the
// zoom flies into the logo rather than the middle of the screen
const LOGO_X = 0.492;
const LOGO_Y = 0.469;
const IMAGE_ASPECT = 1284 / 2778;
const ZOOM = 8;
const DURATION_MS = 500;

/**
 * Laid over the app when the last splash screen goes away: starts as the exact
 * splash picture, then zooms into the logo while fading, revealing the screen
 * underneath. Scale and opacity only, on the native driver, so it stays smooth
 * while the JS thread is busy mounting the tabs. With Reduce Motion on it only fades.
 */
export default function SplashExit({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => { if (!cancelled) setReduceMotion(reduce); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 250 : DURATION_MS,
      easing: reduceMotion ? Easing.linear : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) onDone(); });
    return () => anim.stop();
  }, [reduceMotion, progress, onDone]);

  // Where `contain` draws the image, to find the logo on any screen shape
  const imageW = width / height > IMAGE_ASPECT ? height * IMAGE_ASPECT : width;
  const imageH = width / height > IMAGE_ASPECT ? height : width / IMAGE_ASPECT;
  const dx = (LOGO_X - 0.5) * imageW;
  const dy = (LOGO_Y - 0.5) * imageH;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reduceMotion ? 1 : ZOOM] });
  const opacity = progress.interpolate({ inputRange: [reduceMotion ? 0 : 0.35, 1], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]}>
      <Animated.Image
        source={SPLASH_IMAGE}
        resizeMode="contain"
        // Scale about the logo: move it to the origin, scale, move it back
        style={[styles.image, {
          transform: [{ translateX: dx }, { translateY: dy }, { scale }, { translateX: -dx }, { translateY: -dy }],
        }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: SPLASH_BG },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
});
