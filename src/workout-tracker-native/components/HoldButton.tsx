import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export const HOLD_MS = 800;

/**
 * A button that acts only after being held for HOLD_MS, a bar filling as it's held.
 * For a phone on handlebars, where a bump or a gloved brush would otherwise end
 * the ride. A tap says how it works instead. Screen readers can't hold, so
 * their activate action goes to `onAccessibilityActivate` (a confirm dialog).
 */
export default function HoldButton({ label, icon, color, textColor, onComplete, onAccessibilityActivate, style }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  /** The label, icon and progress bar; must read on `color` (defaults to accentText, for an accent button) */
  textColor?: string;
  onComplete: () => void;
  onAccessibilityActivate: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const ink = textColor ?? colors.accentText;
  const progress = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 1500);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const pressIn = () => {
    done.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(progress, {
      toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      done.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    });
  };

  const pressOut = () => {
    if (done.current) return;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    setHint(true);
  };

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[styles.btn, { backgroundColor: color }, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'activate') onAccessibilityActivate(); }}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.fill, { backgroundColor: ink, transform: [{ scaleX: progress }] }]}
      />
      <View style={styles.content} pointerEvents="none">
        <Ionicons name={icon} size={26} color={ink} />
        <Text style={[styles.label, { color: ink }]}>{hint ? 'Keep holding' : label}</Text>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  btn: {
    borderRadius: 50,
    overflow: 'hidden',
    justifyContent: 'center',
    minWidth: 180,
    minHeight: 60,
  },
  // A solid bar in the label's colour: a tinted wash over the whole button
  // measured 1.4:1 against the red, so the hold showed no progress. Fills left
  // to right: scaleX would otherwise grow from the centre
  fill: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: spacing.xs,
    transformOrigin: 'left',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  label: { fontSize: typography.fontSize.md, fontWeight: '700' },
});
