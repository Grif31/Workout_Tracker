import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  StatusBar,
  Image,
  ImageSourcePropType,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { APP_ICONS_ENABLED } from '../../constants/featureFlags';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'OnboardingTutorial'>;

const { width: W } = Dimensions.get('window');

// Phone frame dimensions — portrait, centred in slide
const FRAME_W = W * 0.52;
const FRAME_H = FRAME_W * 2.05;

type ScreenshotSlide = {
  type: 'screenshot';
  // Replace each file with an actual screenshot once captured.
  // Recommended screens to screenshot (1 per file, portrait, any resolution):
  //   slide-workout.png  → WorkoutLog form mid-session (exercises + sets visible)
  //   slide-progress.png → ExerciseDetailScreen on the Stats tab with a chart visible
  //   slide-ai.png       → AIWorkoutPreview screen showing a generated routine
  source: ImageSourcePropType;
  title: string;
  body: string;
};

type PremiumSlide = {
  type: 'premium';
  title: string;
  body: string;
};

type Slide = ScreenshotSlide | PremiumSlide;

const PREMIUM_FEATURES = [
  'AI Coach — personalised programs in seconds',
  'Strength Score',
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
    source: require('../../assets/screenshots/slide-dashboard.jpg'),
    title: 'Strength & Cardio, One Place',
    body: 'Every session lands on your dashboard — lifting workouts, runs, and GPS-tracked cardio side by side.',
  },
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-workout.jpg'),
    title: 'Track Every Rep',
    body: 'Log sets, weight, and reps. Rest timers, RPE tracking, and automatic PR detection built in.',
  },
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-progress.png'),
    title: 'Watch Yourself Improve',
    body: 'Progress charts and personal records show exactly when you\'re getting stronger.',
  },
  {
    type: 'screenshot',
    source: require('../../assets/screenshots/slide-ai.jpg'),
    title: 'Your AI Coach',
    body: 'Build personalised programs in seconds, and get insights from your training — when to push, when to deload, and what needs work.',
  },
  ...(BETA_PREMIUM ? [] : [{
    type: 'premium',
    title: 'Reach Your Peak',
    body: 'Everything you need to train smarter and hit your goals — no fluff.',
  } as PremiumSlide]),
];

export default function OnboardingTutorialScreen({ navigation }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const advance = () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      navigation.navigate('Onboarding');
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Image
          source={require('../../assets/Arete_name.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        {!isLast ? (
          <TouchableOpacity onPress={() => navigation.navigate('Onboarding')} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            {item.type === 'screenshot' ? (
              <ScreenshotFrame source={item.source} />
            ) : (
              <PremiumCard />
            )}

            <View style={styles.textBlock}>
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideBody}>{item.body}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: scrollX.interpolate({
                      inputRange,
                      outputRange: [8, 24, 8],
                      extrapolate: 'clamp',
                    }),
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

        <TouchableOpacity style={styles.nextBtn} onPress={advance} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ScreenshotFrame({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={styles.frameWrap}>
      <View style={styles.phoneShadow}>
        <View style={styles.phoneFrame}>
          <Image source={source} style={styles.phoneImage} resizeMode="cover" />
          {/* Bottom fade so screenshot blends into dark background */}
          <LinearGradient
            colors={['transparent', AUTH.bg]}
            style={styles.phoneGradient}
          />
        </View>
      </View>
    </View>
  );
}

function PremiumCard() {
  return (
    <View style={styles.frameWrap}>
      <LinearGradient
        colors={[AUTH.card, '#0F2018']}
        style={styles.premiumCard}
      >
        <View style={styles.premiumHeader}>
          <Ionicons name="sparkles" size={28} color={AUTH.accent} />
          <Text style={styles.premiumLabel}>ARETĒ PREMIUM</Text>
        </View>

        <View style={styles.divider} />

        {PREMIUM_FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={18} color={AUTH.accent} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  headerSpacer: { width: 56 },
  headerLogo: { width: 120, height: 32 },
  skipBtn: { width: 56, paddingVertical: 6, alignItems: 'flex-end' },
  skipText: { fontSize: 15, color: AUTH.subtext, fontWeight: '500' },

  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },

  // ── Phone frame ──────────────────────────────────────────────
  frameWrap: {
    alignItems: 'center',
  },
  phoneShadow: {
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  phoneFrame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: AUTH.border,
    overflow: 'hidden',
    backgroundColor: AUTH.card,
  },
  phoneImage: {
    width: '100%',
    height: '100%',
  },
  phoneGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FRAME_H * 0.28,
  },


  // ── Premium card ─────────────────────────────────────────────
  premiumCard: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: AUTH.accent + '55',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: spacing.md,
  },
  premiumHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  premiumLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: AUTH.accent,
    letterSpacing: 1.4,
  },
  divider: {
    height: 1,
    backgroundColor: AUTH.border,
    marginBottom: spacing.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: AUTH.text,
    lineHeight: 20,
  },

  // ── Text block ───────────────────────────────────────────────
  textBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 300,
  },
  slideTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '700',
    color: AUTH.text,
    textAlign: 'center',
  },
  slideBody: {
    fontSize: typography.fontSize.md,
    color: AUTH.subtext,
    textAlign: 'center',
    lineHeight: 24,
  },

  // ── Footer ───────────────────────────────────────────────────
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AUTH.border,
  },
  nextBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: AUTH.bg,
  },
});
