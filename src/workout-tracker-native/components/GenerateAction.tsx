import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 48;

type Props = {
  /** The blurb above the button: what pressing it makes */
  message: string;
  label: string;
  loading: boolean;
  onPress: () => void;
  /** Spoken names for the button; the label and a generic wait message by default */
  accessibilityLabel?: string;
  loadingAccessibilityLabel?: string;
};

/**
 * An AI "generate" button that owns its whole space. While loading, the icon
 * and blurb fade out and collapse, the button narrows into a circle, and a star
 * pulses alone in the middle; when loading ends it all comes back. Width and
 * height are layout props so they run on the JS driver; the pulse is
 * transform/opacity only and runs native, on its own views (one view can't be
 * driven by both).
 */
export default function GenerateAction({ message, label, loading, onPress, accessibilityLabel, loadingAccessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // The icon and blurb, measured so they can collapse to nothing
  const [introHeight, setIntroHeight] = useState(100);
  const morph = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(morph, {
      toValue: loading ? 1 : 0, duration: loading ? 280 : 220,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    if (!loading) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [loading, morph, pulse]);

  const buttonWidth = morph.interpolate({ inputRange: [0, 1], outputRange: [BUTTON_WIDTH, BUTTON_HEIGHT] });
  const labelOpacity = morph.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const starOpacity = morph.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const introOpacity = morph.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const introMaxHeight = morph.interpolate({ inputRange: [0, 1], outputRange: [introHeight, 0] });
  const starScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.3] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.intro, { opacity: introOpacity, maxHeight: introMaxHeight }]}>
        <View
          style={styles.introContent}
          onLayout={e => { if (!loading) setIntroHeight(e.nativeEvent.layout.height); }}
        >
          <Ionicons name="sparkles-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.message}>{message}</Text>
        </View>
      </Animated.View>
      <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={loading ? (loadingAccessibilityLabel ?? 'Working, please wait') : (accessibilityLabel ?? label)}
      >
        <Animated.View style={[styles.button, { width: buttonWidth }]}>
          <Animated.Text style={[styles.buttonText, { opacity: labelOpacity }]} numberOfLines={1}>
            {label}
          </Animated.Text>
          <Animated.View pointerEvents="none" style={[styles.star, { opacity: starOpacity }]}>
            <Animated.View style={{ opacity: glowOpacity, transform: [{ scale: starScale }] }}>
              <Ionicons name="sparkles" size={24} color={colors.accentText} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  // A fixed height keeps the surrounding card from jumping when the intro collapses, and centres the star
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, minHeight: 176 },
  intro: { overflow: 'hidden' },
  introContent: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md },
  message: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 },
  button: {
    height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  buttonText: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.accentText },
  star: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
