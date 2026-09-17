import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerToastCallback, type ToastOptions } from '../utils/toast';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const SLIDE_DURATION = 250;
const DISPLAY_DURATION = 3000;
// Far enough above the safe area to fully hide the taller titled layout too.
const HIDDEN_OFFSET = -220;

export function ToastBanner() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [message, setMessage] = useState('');
  const [options, setOptions] = useState<ToastOptions>({});
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(translateY, {
      toValue: HIDDEN_OFFSET,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  useEffect(() => {
    registerToastCallback((msg, opts = {}) => {
      if (timer.current) clearTimeout(timer.current);

      setMessage(msg);
      setOptions(opts);
      setVisible(true);
      translateY.setValue(HIDDEN_OFFSET);

      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();

      timer.current = setTimeout(hide, opts.durationMs ?? DISPLAY_DURATION);
    });

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (!visible) return null;

  const toneColor = options.tone === 'warning' ? colors.warmup : colors.accent;

  return (
    <Animated.View
      style={[
        styles.banner,
        options.title && styles.bannerLarge,
        { top: insets.top + spacing.sm, borderColor: toneColor, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
    >
      {options.title ? (
        // Long-lived toasts can be tapped away so they never block the screen.
        <Pressable style={styles.largeRow} onPress={hide} accessibilityHint="Dismisses this message">
          {options.icon && <Ionicons name={options.icon} size={28} color={toneColor} />}
          <View style={styles.largeTextBlock}>
            <Text style={styles.title}>{options.title}</Text>
            <Text style={styles.largeText}>{message}</Text>
          </View>
        </Pressable>
      ) : (
        <Text style={styles.text}>{message}</Text>
      )}
    </Animated.View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
    borderRadius: spacing.sm,
    borderWidth: 1.5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  bannerLarge: {
    borderWidth: 2,
    borderRadius: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  largeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  largeTextBlock: { flex: 1 },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '800',
    marginBottom: 2,
  },
  largeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    lineHeight: 19,
  },
});
