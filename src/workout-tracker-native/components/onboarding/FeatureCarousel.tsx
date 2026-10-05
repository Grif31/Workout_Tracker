import React, { useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, ImageSourcePropType, Animated, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AUTH } from '../../theme/authColors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { APP_ICONS_ENABLED } from '../../constants/featureFlags';

type Slide =
  | { type: 'screenshot'; source: ImageSourcePropType; title: string; body: string }
  | { type: 'premium'; title: string; body: string };

const PREMIUM_FEATURES = [
  'AI Coach: personalized programs in seconds',
  'Personalized training insights',
  'Strength Score & Endurance Score',
  'Muscle volume zones',
  'Unlimited templates & routines',
  ...(APP_ICONS_ENABLED ? ['Custom app icons'] : []),
];

// Testers get premium for free while this is set (see PurchaseContext), so the
// premium pitch slide is hidden. It returns automatically at public launch when
// EXPO_PUBLIC_BETA_PREMIUM is removed from eas.json.
const BETA_PREMIUM = process.env.EXPO_PUBLIC_BETA_PREMIUM === 'true';

const SLIDES: Slide[] = [
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-workout.jpg'),
    title: 'Track Every Workout',
    body: 'Log lifts set by set, or record runs and rides with GPS. Rest timers and PR detection built in.',
  },
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-progress.png'),
    title: 'Watch Yourself Improve',
    body: "Charts and personal records show exactly when you're getting stronger and faster.",
  },
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-ai.jpg'),
    title: 'Your AI Coach',
    body: 'Programs built around your goal, schedule and equipment, plus insights on when to push and when to back off.',
  },
  ...(BETA_PREMIUM ? [] : [{
    type: 'premium',
    title: 'Reach Your Peak',
    body: 'Everything you need to train smarter and hit your goals. No fluff.',
  } as Slide]),
];

// Phone screenshots keep their portrait shape
const FRAME_RATIO = 2.05;

/**
 * The Welcome screen's swipeable feature tour. It sits before sign-up, where
 * it can still persuade someone; it used to run after sign-up, behind a
 * second logo screen.
 */
export default function FeatureCarousel() {
  const { width: W, height: H } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  // Leaves room for the logo above and the sign-up buttons below on any phone
  const frameH = Math.max(200, Math.min(H * 0.36, 400));
  const frameW = frameH / FRAME_RATIO;
  const styles = useMemo(() => createStyles(W, frameW, frameH), [W, frameW, frameH]);

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * W, index * W, (index + 1) * W];
          // The slide in view sits full size; its neighbours shrink and fade as they leave
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.88, 1, 0.88], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
          return (
            <View style={styles.slide} testID={`feature-slide-${index}`}>
              <Animated.View style={{ transform: [{ scale }], opacity }}>
                {item.type === 'screenshot' ? (
                  <View style={styles.phoneShadow}>
                    <View style={styles.phoneFrame}>
                      <Image source={item.source} style={styles.phoneImage} resizeMode="cover" />
                      <LinearGradient colors={['transparent', AUTH.bg]} style={styles.phoneGradient} />
                    </View>
                  </View>
                ) : (
                  <LinearGradient colors={[AUTH.card, '#0F2018']} style={styles.premiumCard}>
                    <View style={styles.premiumHeader}>
                      <Ionicons name="sparkles" size={24} color={AUTH.accent} />
                      <Text style={styles.premiumLabel}>ARETĒ PREMIUM</Text>
                    </View>
                    {PREMIUM_FEATURES.map(f => (
                      <View key={f} style={styles.featureRow}>
                        <Ionicons name="checkmark-circle" size={16} color={AUTH.accent} />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </LinearGradient>
                )}
              </Animated.View>
              <Animated.View style={[styles.textBlock, { opacity }]}>
                <Text style={styles.slideTitle}>{item.title}</Text>
                <Text style={styles.slideBody}>{item.body}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  width: scrollX.interpolate({ inputRange, outputRange: [8, 22, 8], extrapolate: 'clamp' }),
                  backgroundColor: scrollX.interpolate({
                    inputRange,
                    outputRange: [AUTH.border, AUTH.accent, AUTH.border],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (W: number, frameW: number, frameH: number) => StyleSheet.create({
  container: { flex: 1 },
  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  phoneShadow: {
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  phoneFrame: {
    width: frameW,
    height: frameH,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: AUTH.border,
    overflow: 'hidden',
    backgroundColor: AUTH.card,
  },
  phoneImage: { width: '100%', height: '100%' },
  phoneGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: frameH * 0.28 },
  premiumCard: {
    width: Math.max(frameW, 240),
    height: frameH,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: AUTH.accent + '55',
    padding: spacing.md,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  premiumHeader: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  premiumLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: AUTH.accent, letterSpacing: 1.4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureText: { flex: 1, fontSize: typography.fontSize.sm, color: AUTH.text, lineHeight: 18 },
  textBlock: { alignItems: 'center', gap: spacing.xs, maxWidth: 320 },
  slideTitle: { fontSize: typography.fontSize.xl, fontWeight: '700', color: AUTH.text, textAlign: 'center' },
  slideBody: { fontSize: typography.fontSize.sm, color: AUTH.subtext, textAlign: 'center', lineHeight: 20 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AUTH.border },
});
