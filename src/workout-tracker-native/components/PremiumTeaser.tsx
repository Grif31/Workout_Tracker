import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  locked: boolean;
  /** The paywall `source`, so its pitch matches what was being looked at */
  source: string;
  title: string;
  body: string;
  children: React.ReactNode;
};

// How much of the locked content shows behind the blur
const PREVIEW_HEIGHT = 440;

/**
 * Shows a free user their own premium content, blurred, with one way to
 * unlock it. A locked screen sells a description; the shape of your own data
 * behind glass sells itself. Unlocked, it renders its children untouched.
 */
export default function PremiumTeaser({ locked, source, title, body, children }: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  if (!locked) return <>{children}</>;

  return (
    <View style={styles.wrap} testID="premium-teaser">
      {/* Real content, out of reach: not tappable and hidden from screen readers */}
      <View
        style={styles.preview}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </View>
      <BlurView intensity={28} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      {/* Blur falls back to a plain tint on some devices; this keeps the numbers unreadable there too */}
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <View style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={18} color={colors.accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Paywall', { source })}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Unlock with Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  // Tall enough for the unlock card even when there is little behind it
  wrap: { borderRadius: radius.lg, overflow: 'hidden', marginTop: spacing.sm, minHeight: 280 },
  preview: { maxHeight: PREVIEW_HEIGHT, overflow: 'hidden' },
  veil: { backgroundColor: colors.background, opacity: 0.55 },
  cardWrap: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
  },
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  buttonText: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.accentText },
});
