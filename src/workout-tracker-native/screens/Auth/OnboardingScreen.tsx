import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { navigationRef } from '../../navigation/navigationRef';
import { COACH_PROFILE_KEY, CoachProfile } from '../TrainingTab/CoachProfileModal';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'Onboarding'> & { onComplete: () => void };

type Msg =
  | { id: string; type: 'bot'; text: string }
  | { id: string; type: 'user'; text: string }
  | { id: string; type: 'typing' };

const STEPS = [
  {
    key: 'goal',
    botText: "Hey! I'm your Aretē coach 👋\n\nWhat's your main goal?",
    options: [
      { label: 'Build Muscle', value: 'hypertrophy' },
      { label: 'Get Stronger', value: 'strength' },
      { label: 'Improve Endurance', value: 'endurance' },
      { label: 'General Fitness', value: 'general' },
    ],
  },
  {
    key: 'exp',
    botText: "How long have you been training consistently?",
    options: [
      { label: 'Under 1 year', value: 'beginner' },
      { label: '1–3 years', value: 'intermediate' },
      { label: '3+ years', value: 'advanced' },
    ],
  },
  {
    key: 'days',
    botText: 'How many days per week can you train?',
    options: [2, 3, 4, 5, 6].map(d => ({ label: `${d} days`, value: String(d) })),
  },
  {
    key: 'equipment',
    botText: 'What equipment do you have access to?',
    options: [
      { label: 'Full gym', value: 'full_gym' },
      { label: 'Home gym (barbell + bench)', value: 'home_barbell' },
      { label: 'Dumbbells only', value: 'dumbbells' },
      { label: 'Bodyweight only', value: 'bodyweight' },
    ],
  },
  {
    key: 'session_length',
    botText: 'How long can you train per session?',
    options: [
      { label: '30–45 min', value: '30' },
      { label: '45–60 min', value: '45' },
      { label: '60–75 min', value: '60' },
      { label: '90+ min', value: '90' },
    ],
  },
  {
    key: 'avoid',
    botText: 'Any injuries or areas I should work around?',
    options: [
      { label: 'Lower back', value: 'lower_back' },
      { label: 'Knees', value: 'knees' },
      { label: 'Shoulders', value: 'shoulders' },
      { label: 'All clear', value: 'none' },
    ],
  },
  {
    key: 'routine',
    botText: "Got it — I have everything I need.\n\nWant me to build your personalised program right now?",
    options: [
      { label: 'Yes, build my program', value: 'yes' },
      { label: 'Maybe later', value: 'no' },
    ],
  },
];

const DONE_TEXT_LATER = "No problem! When you're ready, you can generate a personalised program anytime from the Coach tab.\n\nTap Continue to enter the app.";
const GENERATING_TEXT = "Perfect — building your personalised program now. This takes a few seconds… 🏗️";
const GENERATE_FAILED_TEXT = "I couldn't build your program right now — you can generate one anytime from the Coach tab.\n\nTap Continue to enter the app.";

type GeneratedRoutine = {
  id: number;
  name: string;
  description: string;
  days: { label: string; count: number }[];
};

export default function OnboardingScreen({ onComplete }: Props) {
  const { user } = useAuth();
  const msgIdRef = useRef(0);
  const nextId = () => String(++msgIdRef.current);

  const [messages, setMessages] = useState<Msg[]>([
    { id: nextId(), type: 'bot', text: STEPS[0].botText },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [chipsActive, setChipsActive] = useState(true);
  const [isDone, setIsDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedRoutine, setGeneratedRoutine] = useState<GeneratedRoutine | null>(null);
  const [answers, setAnswers] = useState({
    goal: '', exp: '', days: 0,
    equipment: 'full_gym', sessionLength: '60', avoid: 'none',
    routine: false,
  });

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
    else if (currentStep === 3) newAnswers.equipment = option.value;
    else if (currentStep === 4) newAnswers.sessionLength = option.value;
    else if (currentStep === 5) newAnswers.avoid = option.value;
    else if (currentStep === 6) newAnswers.routine = option.value === 'yes';
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
        if (newAnswers.routine) {
          setMessages(prev => [
            ...prev.filter(m => m.type !== 'typing'),
            { id: nextId(), type: 'bot', text: GENERATING_TEXT },
            { id: nextId(), type: 'typing' },
          ]);
          runGeneration(newAnswers);
          return;
        }
        setMessages(prev => [
          ...prev.filter(m => m.type !== 'typing'),
          { id: nextId(), type: 'bot', text: DONE_TEXT_LATER },
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

  // Write to the CURRENT coach profile key — the Coach tab reads coach_profile,
  // not the legacy coach_settings key (which only migrated when the profile
  // modal was opened, so generation used defaults until then)
  const persistAnswers = async (a: typeof answers) => {
    const profile: CoachProfile = {
      goal: a.goal || 'general',
      experience: a.exp || 'beginner',
      equipment: a.equipment,
      days_per_week: a.days || 3,
      session_length_min: parseInt(a.sessionLength, 10) || 60,
      avoid: a.avoid && a.avoid !== 'none' ? [a.avoid] : [],
      notes: '',
    };
    await AsyncStorage.multiSet([
      [`${COACH_PROFILE_KEY}_${user?.id}`, JSON.stringify(profile)],
      ['user_goal', a.goal],
      ['user_experience', a.exp],
      ['user_days_per_week', String(a.days)],
      [`workout_weekly_goal_${user?.id}`, String(a.days)],
      ['onboarding_complete', 'true'],
    ]);
  };

  const runGeneration = async (a: typeof answers) => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: a.days,
          goal: a.goal,
          experience: a.exp,
          equipment: a.equipment,
          session_length_min: parseInt(a.sessionLength, 10),
          avoid: a.avoid,
          generate_type: 'routine',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();

      // /api/ai/generate only returns a preview — persist it so the routine
      // actually exists when the user lands in the app
      const toProgramming = (exs: any[]) => exs
        .filter(e => e.prescribed_sets)
        .map(e => ({
          exercise_template_id: e.id,
          sets: e.prescribed_sets,
          reps: e.prescribed_reps ?? '',
          rpe: e.prescribed_rpe ?? null,
        }));
      const saveRes = await apiFetch('/api/ai/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'routine',
          name: data.name,
          description: data.description || null,
          days: (data.days ?? []).map((d: any) => ({
            label: d.label,
            exercise_ids: d.exercises.map((e: any) => e.id),
            programming: toProgramming(d.exercises),
          })),
        }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error();

      setGeneratedRoutine({
        id: saved.id,
        name: data.name,
        description: data.description ?? '',
        days: (data.days ?? []).map((d: any) => ({ label: d.label, count: d.exercises.length })),
      });
      setMessages(prev => [
        ...prev.filter(m => m.type !== 'typing'),
        { id: nextId(), type: 'bot', text: "Done! Here's your program — take a quick look:" },
      ]);
    } catch {
      setMessages(prev => [
        ...prev.filter(m => m.type !== 'typing'),
        { id: nextId(), type: 'bot', text: GENERATE_FAILED_TEXT },
      ]);
      setIsDone(true);
    } finally {
      setGenerating(false);
    }
  };

  const handleContinue = async () => {
    await persistAnswers(answers);
    onComplete();
  };

  const handleViewNow = async () => {
    const routine = generatedRoutine;
    await persistAnswers(answers);
    onComplete();
    if (!routine) return;
    // AppTabs mounts right after onComplete flips the root navigator — retry
    // a couple of times until the tab routes exist, then deep-link in
    const tryNav = (attempt: number) => {
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'RoutineDetail') {
        (navigationRef as any).navigate('TrainingTab', {
          screen: 'RoutineDetail',
          params: { routineId: routine.id, routineName: routine.name },
          initial: false,
        });
      }
      if (attempt < 2) setTimeout(() => tryNav(attempt + 1), 600);
    };
    setTimeout(() => tryNav(0), 400);
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip coach setup?',
      "Your answers let the AI coach tailor generated programs and insights to your goal, equipment, and schedule. If you skip, you'll get generic defaults instead.\n\nYou can always do this later from the Coach tab → Edit Profile.",
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.setItem('onboarding_complete', 'true');
            onComplete();
          },
        },
      ],
    );
  };

  const currentOptions = !isDone && chipsActive ? STEPS[currentStep].options : [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        {!isDone && !generatedRoutine ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

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

      {/* Generated routine preview */}
      {generatedRoutine && (
        <View style={styles.footer}>
          <View style={styles.previewCard}>
            <Text style={styles.previewName} numberOfLines={1}>{generatedRoutine.name}</Text>
            {!!generatedRoutine.description && (
              <Text style={styles.previewDesc} numberOfLines={2}>{generatedRoutine.description}</Text>
            )}
            {generatedRoutine.days.map((d, i) => (
              <View key={i} style={styles.previewDayRow}>
                <Ionicons name="calendar-outline" size={14} color={AUTH.accent} />
                <Text style={styles.previewDayLabel} numberOfLines={1}>{d.label}</Text>
                <Text style={styles.previewDayCount}>{d.count} exercise{d.count !== 1 ? 's' : ''}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.continueBtn} onPress={handleViewNow} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>View My Program</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.laterBtn} onPress={handleContinue} activeOpacity={0.7}>
            <Text style={styles.laterBtnText}>I'll check it later</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Continue button when done */}
      {isDone && !generatedRoutine && (
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

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { fontSize: 15, color: AUTH.subtext, fontWeight: '500' },

  chat: { flex: 1 },
  chatContent: { padding: spacing.md, gap: 12, paddingBottom: spacing.sm },

  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '85%' },
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: AUTH.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '500', color: AUTH.text },

  footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: spacing.sm },
  continueBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.bg },

  previewCard: {
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  previewName: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.text },
  previewDesc: { fontSize: typography.fontSize.sm, color: AUTH.subtext, lineHeight: 18, marginBottom: 2 },
  previewDayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  previewDayLabel: { flex: 1, fontSize: typography.fontSize.sm, color: AUTH.text },
  previewDayCount: { fontSize: typography.fontSize.sm, color: AUTH.subtext },

  laterBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  laterBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: AUTH.subtext },
});
