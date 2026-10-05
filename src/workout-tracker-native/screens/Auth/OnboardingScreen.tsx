import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WEEKLY_GOAL_KEY } from '../../constants/storageKeys';
import { markOnboardingComplete } from '../../utils/onboarding';
import { useAuth } from '../../context/AuthContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { navigationRef } from '../../navigation/navigationRef';
import { COACH_PROFILE_KEY, DEFAULT_PROFILE, CoachProfile } from '../../components/coach/CoachProfileModal';
import PressableScale from '../../components/PressableScale';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'Onboarding'> & { onComplete: () => void };

type Msg =
  | { id: string; type: 'bot'; text: string }
  // step: the question this answers, so tapping it can reopen that question
  | { id: string; type: 'user'; text: string; step: number }
  | { id: string; type: 'typing' };

type StepKey = 'goal' | 'exp' | 'days' | 'equipment' | 'avoid';

type Step = {
  key: StepKey;
  botText: string;
  // Names the question while an earlier answer to it is being changed
  shortLabel: string;
  options: { label: string; value: string }[];
  // Several options can be picked before a Done chip; 'none' still answers at once
  multi?: boolean;
};

const DONE_VALUE = '__done';

// Kept to what generation and the app use. Workout length defaults to the
// Coach profile's 60 min and is edited there.
const STEPS: Step[] = [
  {
    key: 'goal',
    shortLabel: 'Main goal',
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
    shortLabel: 'Training experience',
    botText: 'How long have you been training consistently?',
    options: [
      { label: 'Under 1 year', value: 'beginner' },
      { label: '1–3 years', value: 'intermediate' },
      { label: '3+ years', value: 'advanced' },
    ],
  },
  {
    key: 'days',
    shortLabel: 'Days per week',
    botText: 'How many days per week can you train?',
    options: [2, 3, 4, 5, 6].map(d => ({ label: `${d} days`, value: String(d) })),
  },
  {
    key: 'equipment',
    shortLabel: 'Equipment',
    botText: 'What equipment do you have access to?',
    options: [
      { label: 'Full gym', value: 'full_gym' },
      { label: 'Home gym (barbell + bench)', value: 'home_barbell' },
      { label: 'Dumbbells only', value: 'dumbbells' },
      { label: 'Bodyweight only', value: 'bodyweight' },
    ],
  },
  {
    key: 'avoid',
    shortLabel: 'Injuries',
    botText: 'Any injuries or areas I should work around? Pick all that apply.',
    multi: true,
    options: [
      { label: 'Lower back', value: 'lower_back' },
      { label: 'Knees', value: 'knees' },
      { label: 'Shoulders', value: 'shoulders' },
      { label: 'All clear', value: 'none' },
    ],
  },
];

// The pause before the coach "replies": long enough to read as a reply,
// short enough not to stall five questions
const TYPING_MS = 350;

const DECIDE_TEXT = "Got it, I have everything I need.\n\nWant me to build your personalized program now?";
const DONE_TEXT_LATER = "No problem. When you're ready, you can generate a personalized program anytime from the Coach tab.\n\nTap Continue to enter the app.";
const GENERATING_TEXT = 'Perfect, building your program now. This takes a few seconds.';
const GENERATE_FAILED_TEXT = "I couldn't build your program right now. You can generate one anytime from the Coach tab.\n\nTap Continue to enter the app.";

// Shown in turn while the program generates, so the wait reads as progress
const GENERATING_STATUS = [
  'Choosing your split…',
  'Picking exercises for each day…',
  'Setting sets, reps and effort…',
  'Fitting it to your schedule…',
];
const STATUS_MS = 1600;

type Phase = 'asking' | 'deciding' | 'generating' | 'generated' | 'done';

type Answers = { goal: string; exp: string; days: number; equipment: string; avoid: string[] };

type GeneratedRoutine = {
  id: number;
  name: string;
  description: string;
  days: { label: string; count: number }[];
};

/** Three dots that pulse in turn while the coach is "typing". */
function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new RNAnimated.Value(0.3))).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.stagger(150, dots.map(d => RNAnimated.sequence([
        RNAnimated.timing(d, { toValue: 1, duration: 250, useNativeDriver: true }),
        RNAnimated.timing(d, { toValue: 0.3, duration: 250, useNativeDriver: true }),
      ]))),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.typingRow} accessibilityLabel="Coach is typing">
      {dots.map((d, i) => <RNAnimated.View key={i} style={[styles.typingDot, { opacity: d }]} />)}
    </View>
  );
}

/** Placeholder program while generation runs: pulsing rows and a status line. */
function GeneratingCard() {
  const pulse = useRef(new RNAnimated.Value(0.4)).current;
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    const loop = RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      RNAnimated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    const timer = setInterval(() => setStatusIdx(i => Math.min(i + 1, GENERATING_STATUS.length - 1)), STATUS_MS);
    return () => { loop.stop(); clearInterval(timer); };
  }, []);
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={styles.previewCard} testID="generating-card">
      <RNAnimated.View style={[styles.skeletonTitle, { opacity: pulse }]} />
      {[0, 1, 2].map(i => (
        <RNAnimated.View key={i} style={[styles.skeletonRow, { opacity: pulse }]} />
      ))}
      <Text style={styles.generatingStatus}>{GENERATING_STATUS[statusIdx]}</Text>
    </Animated.View>
  );
}

/** A check that springs in when the program is ready. */
function ReadyBadge() {
  const scale = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  return (
    <View style={styles.readyRow}>
      <RNAnimated.View style={[styles.readyCircle, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={18} color={AUTH.bg} />
      </RNAnimated.View>
      <Text style={styles.readyText}>Your program is ready</Text>
    </View>
  );
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { user } = useAuth();
  const msgIdRef = useRef(0);
  const nextId = () => String(++msgIdRef.current);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<Msg[]>(() => [
    { id: nextId(), type: 'bot', text: STEPS[0].botText },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState<Phase>('asking');
  const [generatedRoutine, setGeneratedRoutine] = useState<GeneratedRoutine | null>(null);
  const [answers, setAnswers] = useState<Answers>({
    goal: '', exp: '', days: 0, equipment: 'full_gym', avoid: [],
  });
  const [avoidPicks, setAvoidPicks] = useState<string[]>([]);
  // An earlier answer being changed in place: its question's chips show again,
  // and picking one rewrites that bubble without touching the rest of the chat
  const [editing, setEditing] = useState<{ step: number; msgId: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, phase]);

  useEffect(() => () => { if (replyTimer.current) clearTimeout(replyTimer.current); }, []);

  // The coach "types", then posts its next message
  const reply = (text: string, then?: () => void) => {
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      replyTimer.current = null;
      setTyping(false);
      setMessages(prev => [...prev, { id: nextId(), type: 'bot', text }]);
      then?.();
    }, TYPING_MS);
  };

  const applyAnswer = (key: StepKey, value: string, a: Answers): Answers => {
    const next: Answers = { ...a };
    if (key === 'goal') next.goal = value;
    else if (key === 'exp') next.exp = value;
    else if (key === 'days') next.days = parseInt(value, 10);
    else if (key === 'equipment') next.equipment = value;
    else if (key === 'avoid') next.avoid = value === 'none' ? [] : avoidPicks;
    return next;
  };

  const handleSelect = (option: { label: string; value: string }) => {
    if (editing) {
      const step = STEPS[editing.step];
      if (step.multi && option.value !== 'none' && option.value !== DONE_VALUE) {
        Haptics.selectionAsync();
        setAvoidPicks(prev =>
          prev.includes(option.value) ? prev.filter(v => v !== option.value) : [...prev, option.value]);
        return;
      }
      Haptics.selectionAsync();
      setAnswers(prev => applyAnswer(step.key, option.value, prev));
      setMessages(prev => prev.map(m => (m.id === editing.msgId && m.type === 'user' ? { ...m, text: option.label } : m)));
      setEditing(null);
      return;
    }
    if (phase !== 'asking' || typing) return;
    const step = STEPS[currentStep];
    if (step.multi && option.value !== 'none' && option.value !== DONE_VALUE) {
      Haptics.selectionAsync();
      setAvoidPicks(prev =>
        prev.includes(option.value) ? prev.filter(v => v !== option.value) : [...prev, option.value]);
      return;
    }
    Haptics.selectionAsync();

    setAnswers(applyAnswer(step.key, option.value, answers));

    setMessages(prev => [...prev, { id: nextId(), type: 'user', text: option.label, step: currentStep }]);

    if (currentStep === STEPS.length - 1) {
      reply(DECIDE_TEXT, () => setPhase('deciding'));
    } else {
      const following = currentStep + 1;
      reply(STEPS[following].botText, () => setCurrentStep(following));
    }
  };

  // Tapping an earlier answer offers that question's options again; the pick
  // replaces just that answer and the chat carries on where it was
  const editAnswer = (msgId: string, step: number) => {
    if (typing || phase === 'generating' || phase === 'generated') return;
    Haptics.selectionAsync();
    if (STEPS[step].key === 'avoid') setAvoidPicks(answers.avoid);
    setEditing({ step, msgId });
  };

  const cancelEdit = () => setEditing(null);

  // Write to the CURRENT coach profile key — the Coach tab reads coach_profile,
  // not the legacy coach_settings key (which only migrated when the profile
  // modal was opened, so generation used defaults until then)
  const persistAnswers = async (a: Answers) => {
    const profile: CoachProfile = {
      goal: a.goal || 'general',
      experience: a.exp || 'beginner',
      equipment: a.equipment,
      days_per_week: a.days || 3,
      session_length_min: DEFAULT_PROFILE.session_length_min,
      avoid: a.avoid,
      notes: '',
    };
    await AsyncStorage.multiSet([
      [`${COACH_PROFILE_KEY}_${user?.id}`, JSON.stringify(profile)],
      [`${WEEKLY_GOAL_KEY}_${user?.id}`, String(a.days)],
    ]);
    if (user?.id) await markOnboardingComplete(user.id);
  };

  const decide = (build: boolean) => {
    Haptics.selectionAsync();
    setMessages(prev => [
      ...prev,
      { id: nextId(), type: 'user', text: build ? 'Yes, build my program' : 'Maybe later', step: STEPS.length },
    ]);
    if (!build) {
      reply(DONE_TEXT_LATER, () => setPhase('done'));
      return;
    }
    setPhase('generating');
    setMessages(prev => [...prev, { id: nextId(), type: 'bot', text: GENERATING_TEXT }]);
    runGeneration(answers);
  };

  const runGeneration = async (a: Answers) => {
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: a.days,
          goal: a.goal,
          experience: a.exp,
          equipment: a.equipment,
          session_length_min: DEFAULT_PROFILE.session_length_min,
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
      setPhase('generated');
    } catch {
      setMessages(prev => [...prev, { id: nextId(), type: 'bot', text: GENERATE_FAILED_TEXT }]);
      setPhase('done');
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
            if (user?.id) await markOnboardingComplete(user.id);
            onComplete();
          },
        },
      ],
    );
  };

  const step = STEPS[editing ? editing.step : currentStep];
  const showChips = editing != null || (phase === 'asking' && !typing);
  const pickedLabels = step.options.filter(o => avoidPicks.includes(o.value)).map(o => o.label);
  const canEdit = !typing && (phase === 'asking' || phase === 'deciding' || (phase === 'done' && !generatedRoutine));
  const hasAnswered = messages.some(m => m.type === 'user');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        {phase === 'asking' || phase === 'deciding' ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} accessibilityRole="button">
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
          if (msg.type === 'bot') {
            return (
              <Animated.View key={msg.id} entering={FadeInDown.duration(220)} style={styles.botRow}>
                <View style={styles.avatar}>
                  <Ionicons name="barbell-outline" size={14} color={AUTH.accent} />
                </View>
                <View style={[styles.bubble, styles.botBubble]}>
                  <Text style={styles.botText}>{msg.text}</Text>
                </View>
              </Animated.View>
            );
          }
          if (msg.type === 'user') {
            const editable = canEdit && msg.step < STEPS.length;
            const beingEdited = editing?.msgId === msg.id;
            return (
              <Animated.View key={msg.id} entering={FadeInDown.duration(220)} style={styles.userRow}>
                <TouchableOpacity
                  disabled={!editable}
                  onPress={() => editAnswer(msg.id, msg.step)}
                  activeOpacity={0.75}
                  accessibilityRole={editable ? 'button' : undefined}
                  accessibilityHint={editable ? 'Change this answer' : undefined}
                  style={[styles.bubble, styles.userBubble, beingEdited && styles.userBubbleEditing]}
                >
                  <Text style={styles.userText}>{msg.text}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          }
          return null;
        })}
        {typing && (
          <Animated.View entering={FadeInDown.duration(180)} style={styles.botRow}>
            <View style={styles.avatar}>
              <Ionicons name="barbell-outline" size={14} color={AUTH.accent} />
            </View>
            <View style={[styles.bubble, styles.botBubble]}>
              <TypingDots />
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Answer chips */}
      {showChips && (
        <View style={styles.chipsArea}>
          {editing ? (
            <View style={styles.editingRow}>
              <Text style={styles.editingLabel}>Changing: {step.shortLabel}</Text>
              <TouchableOpacity onPress={cancelEdit} hitSlop={8} accessibilityRole="button">
                <Text style={styles.editingCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            hasAnswered && <Text style={styles.editHint}>Tap an answer above to change it</Text>
          )}
          <View style={styles.chips}>
            {step.options.map((opt, i) => {
              const picked = step.multi && avoidPicks.includes(opt.value);
              return (
                <Animated.View
                  key={`${editing ? `edit-${editing.msgId}` : currentStep}-${opt.value}`}
                  entering={FadeInDown.delay(i * 40).duration(200)}
                >
                  <PressableScale
                    style={[styles.chip, picked && styles.chipPicked]}
                    onPress={() => handleSelect(opt)}
                  >
                    <Text
                      style={[styles.chipText, picked && styles.chipTextPicked]}
                      accessibilityRole="button"
                      accessibilityState={step.multi ? { selected: !!picked } : undefined}
                    >
                      {opt.label}
                    </Text>
                  </PressableScale>
                </Animated.View>
              );
            })}
            {step.multi && avoidPicks.length > 0 && (
              <Animated.View entering={FadeInDown.duration(200)}>
                <PressableScale
                  style={[styles.chip, styles.chipDone]}
                  onPress={() => handleSelect({ label: pickedLabels.join(', '), value: DONE_VALUE })}
                >
                  <Text style={styles.chipDoneText} accessibilityRole="button">Done</Text>
                </PressableScale>
              </Animated.View>
            )}
          </View>
        </View>
      )}

      {/* Build now or later */}
      {phase === 'deciding' && !typing && !editing && (
        <Animated.View entering={FadeInDown.duration(250)} style={styles.footer}>
          <TouchableOpacity style={styles.continueBtn} onPress={() => decide(true)} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>Yes, build my program</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.laterBtn} onPress={() => decide(false)} activeOpacity={0.7}>
            <Text style={styles.laterBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {phase === 'generating' && (
        <View style={styles.footer}>
          <GeneratingCard />
        </View>
      )}

      {/* Generated program */}
      {phase === 'generated' && generatedRoutine && (
        <View style={styles.footer}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.previewCard}>
            <ReadyBadge />
            <Text style={styles.previewName} numberOfLines={1}>{generatedRoutine.name}</Text>
            {!!generatedRoutine.description && (
              <Text style={styles.previewDesc} numberOfLines={2}>{generatedRoutine.description}</Text>
            )}
            {generatedRoutine.days.map((d, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(150 + i * 70).duration(250)} style={styles.previewDayRow}>
                <Ionicons name="calendar-outline" size={14} color={AUTH.accent} />
                <Text style={styles.previewDayLabel} numberOfLines={1}>{d.label}</Text>
                <Text style={styles.previewDayCount}>{d.count} exercise{d.count !== 1 ? 's' : ''}</Text>
              </Animated.View>
            ))}
          </Animated.View>
          <TouchableOpacity style={styles.continueBtn} onPress={handleViewNow} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>View My Program</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.laterBtn} onPress={handleContinue} activeOpacity={0.7}>
            <Text style={styles.laterBtnText}>I'll check it later</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'done' && !typing && !editing && (
        <Animated.View entering={FadeInDown.duration(250)} style={styles.footer}>
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  skipBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
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
  userBubbleEditing: { borderWidth: 2, borderColor: AUTH.text },

  botText: { fontSize: 15, color: AUTH.text, lineHeight: 22 },
  userText: { fontSize: 15, color: AUTH.bg, fontWeight: '600' },
  typingRow: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: AUTH.subtext },

  chipsArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: AUTH.border,
  },
  editHint: { fontSize: typography.fontSize.xs, color: AUTH.subtext, textAlign: 'center' },
  editingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editingLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: AUTH.text },
  editingCancel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: AUTH.subtext },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '500', color: AUTH.text },
  chipPicked: { borderColor: AUTH.accent, backgroundColor: AUTH.accent + '22' },
  chipTextPicked: { color: AUTH.accent, fontWeight: '700' },
  chipDone: { backgroundColor: AUTH.accent, borderColor: AUTH.accent },
  chipDoneText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: AUTH.bg },

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
    gap: spacing.xs,
  },
  previewName: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.text },
  previewDesc: { fontSize: typography.fontSize.sm, color: AUTH.subtext, lineHeight: 18, marginBottom: 2 },
  previewDayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  previewDayLabel: { flex: 1, fontSize: typography.fontSize.sm, color: AUTH.text },
  previewDayCount: { fontSize: typography.fontSize.sm, color: AUTH.subtext },

  skeletonTitle: { height: 16, width: '55%', borderRadius: 6, backgroundColor: AUTH.border, marginBottom: spacing.xs },
  skeletonRow: { height: 12, borderRadius: 6, backgroundColor: AUTH.border, marginTop: spacing.xs },
  generatingStatus: { fontSize: typography.fontSize.sm, color: AUTH.subtext, marginTop: spacing.sm, textAlign: 'center' },

  readyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  readyCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AUTH.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: AUTH.accent },

  laterBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  laterBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: AUTH.subtext },
});
