import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'OnboardingTutorial'> & {
  onComplete: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🏋️',
    title: 'Log Your Workouts',
    body: 'Track sets, reps, and weight. RPE tracking and rest timers built in.',
  },
  {
    icon: '📈',
    title: 'Watch Your Progress',
    body: 'Charts show your strength gains over time with automatic PR detection.',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Programs',
    body: 'Generate personalized routines based on your goals and experience.',
  },
  {
    icon: '🫀',
    title: 'Cardio Tracking',
    body: 'Log runs and cardio with distance, duration, and intensity.',
  },
  {
    icon: '⚖️',
    title: 'Body Metrics',
    body: 'Track bodyweight and measurements alongside your training.',
  },
  {
    icon: '🔔',
    title: 'Rest Timer & Reminders',
    body: 'Auto rest timer between sets and optional workout reminders.',
  },
];

export default function OnboardingTutorialScreen({ onComplete }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const handleComplete = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    onComplete();
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      handleComplete();
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        {!isLast && (
          <TouchableOpacity onPress={handleComplete} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        {isLast && <View style={styles.headerSpacer} />}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Text style={styles.slideIcon}>{item.icon}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 48,
  },
  headerSpacer: { width: 56 },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  skipText: { fontSize: 15, color: AUTH.subtext, fontWeight: '500' },

  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  slideIcon: { fontSize: 72, marginBottom: 8 },
  slideTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: AUTH.text,
    textAlign: 'center',
  },
  slideBody: {
    fontSize: 16,
    color: AUTH.subtext,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 20,
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AUTH.border },
  dotActive: { backgroundColor: AUTH.accent, width: 24, borderRadius: 4 },
  nextBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: AUTH.bg },
});
