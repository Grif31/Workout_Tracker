import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'Onboarding'>;

type Msg =
  | { id: string; type: 'bot'; text: string }
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'typing' };

const STEPS = [
  {
    key: 'goal',
    botText: "Hey! I'm your Aretē coach 👋\n\nWhat's your main goal?",
    options: [
      { label: 'Hypertrophy', value: 'hypertrophy' },
      { label: 'Strength', value: 'strength' },
      { label: 'Endurance', value: 'endurance' },
      { label: 'General Fitness', value: 'general' },
    ],
  },
  {
    key: 'exp',
    botText: "Nice! What's your training experience?",
    options: [
      { label: 'Beginner', value: 'beginner' },
      { label: 'Intermediate', value: 'intermediate' },
      { label: 'Advanced', value: 'advanced' },
    ],
  },
  {
    key: 'days',
    botText: 'How many days per week can you train?',
    options: [2, 3, 4, 5, 6].map(d => ({ label: String(d), value: String(d) })),
  },
  {
    key: 'routine',
    botText: "Last one — want me to generate a starter routine based on your goals?",
    options: [
      { label: 'Yes, generate one', value: 'yes' },
      { label: 'Skip for now', value: 'no' },
    ],
  },
];

const DONE_TEXT = "You're all set! Let's get you started 🚀";

export default function OnboardingScreen({ navigation }: Props) {
  const msgIdRef = useRef(0);
  const nextId = () => String(++msgIdRef.current);

  const [messages, setMessages] = useState<Msg[]>([
    { id: nextId(), type: 'bot', text: STEPS[0].botText },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [chipsActive, setChipsActive] = useState(true);
  const [isDone, setIsDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [answers, setAnswers] = useState({ goal: '', exp: '', days: 0, routine: false });

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages]);

  const handleSelect = (option: { label: string; value: string }) => {
    if (!chipsActive) return;
    setChipsActive(false);

    const newAnswers = { ...answers };
    if (currentStep === 0) newAnswers.goal = option.value;
    else if (currentStep === 1) newAnswers.exp = option.value;
    else if (currentStep === 2) newAnswers.days = parseInt(option.value, 10);
    else if (currentStep === 3) newAnswers.routine = option.value === 'yes';
    setAnswers(newAnswers);

    // Add user bubble + typing indicator
    setMessages(prev => [
      ...prev,
      { id: nextId(), type: 'user', text: option.label },
      { id: nextId(), type: 'typing' },
    ]);

    const isLast = currentStep === STEPS.length - 1;
    setTimeout(() => {
      if (isLast) {
        setMessages(prev => [
          ...prev.filter(m => m.type !== 'typing'),
          { id: nextId(), type: 'bot', text: DONE_TEXT },
        ]);
        setIsDone(true);
      } else {
        const next = currentStep + 1;
        setMessages(prev => [
          ...prev.filter(m => m.type !== 'typing'),
          { id: nextId(), type: 'bot', text: STEPS[next].botText },
        ]);
        setCurrentStep(next);
        setChipsActive(true);
      }
    }, 600);
  };

  const handleContinue = async () => {
    if (answers.routine) {
      setGenerating(true);
      try {
        await apiFetch('/api/ai/generate', {
          method: 'POST',
          body: JSON.stringify({
            days_per_week: answers.days,
            goal: answers.goal,
            experience: answers.exp,
            generate_type: 'routine',
          }),
        });
      } catch {
        // non-blocking — continue regardless
      } finally {
        setGenerating(false);
      }
    }

    await AsyncStorage.multiSet([
      ['coach_settings', JSON.stringify({ days: answers.days, goal: answers.goal, exp: answers.exp })],
      ['user_goal', answers.goal],
      ['user_experience', answers.exp],
      ['user_days_per_week', String(answers.days)],
      ['workout_weekly_goal', String(answers.days)],
    ]);

    navigation.navigate('OnboardingTutorial');
  };

  const currentOptions = !isDone && chipsActive ? STEPS[currentStep].options : [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      {/* Chat area */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map(msg => {
          if (msg.type === 'typing') {
            return (
              <View key={msg.id} style={styles.botRow}>
                <View style={styles.avatar}>
                  <Ionicons name="barbell-outline" size={14} color={AUTH.accent} />
                </View>
                <View style={[styles.bubble, styles.botBubble]}>
                  <Text style={styles.typingDots}>•••</Text>
                </View>
              </View>
            );
          }
          if (msg.type === 'bot') {
            return (
              <View key={msg.id} style={styles.botRow}>
                <View style={styles.avatar}>
                  <Ionicons name="barbell-outline" size={14} color={AUTH.accent} />
                </View>
                <View style={[styles.bubble, styles.botBubble]}>
                  <Text style={styles.botText}>{msg.text}</Text>
                </View>
              </View>
            );
          }
          // user
          return (
            <View key={msg.id} style={styles.userRow}>
              <View style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{msg.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Chip options */}
      {currentOptions.length > 0 && (
        <View style={styles.chipsArea}>
          <View style={styles.chips}>
            {currentOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={styles.chip}
                onPress={() => handleSelect(opt)}
                activeOpacity={0.75}
              >
                <Text style={styles.chipText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Continue button when done */}
      {isDone && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <ActivityIndicator color={AUTH.bg} />
            ) : (
              <Text style={styles.continueBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },

  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 12, paddingBottom: 8 },

  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  userRow: { alignItems: 'flex-end', alignSelf: 'flex-end', maxWidth: '75%' },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 1,
  },
  botBubble: {
    backgroundColor: AUTH.card,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: AUTH.accent,
    borderBottomRightRadius: 4,
  },

  botText: { fontSize: 15, color: AUTH.text, lineHeight: 22 },
  userText: { fontSize: 15, color: AUTH.bg, fontWeight: '600' },
  typingDots: { fontSize: 18, color: AUTH.subtext, letterSpacing: 2 },

  chipsArea: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: AUTH.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  chipText: { fontSize: 14, fontWeight: '500', color: AUTH.text },

  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  continueBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: AUTH.bg },
});
