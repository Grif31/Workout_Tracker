import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Animated, ActivityIndicator, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { usePurchase } from '../../context/PurchaseContext';
import { handlePremiumRequired } from '../../utils/premiumSync';
import { FREE_ROUTINE_LIMIT, FREE_TEMPLATE_LIMIT } from '../../utils/paywall';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { COACH_INSIGHTS_KEY } from '../../constants/storageKeys';
import { apiFetch, isNetworkError } from '../../utils/api';
import { appCache, useRefetchGate } from '../../utils/appCache';
import { buildTemplatePrefill, parseProgramming, type TemplateExercise } from '../../utils/templatePrefill';
import { routineRotation, type RotationWorkout } from '../../utils/routineRotation';
import { toLocalDateStr } from '../../utils/date';
import { mondayOf } from '../../utils/widgetSnapshot';
import { TrainingStackParamsList } from '../../navigation/types';
import { muscleGroups } from '../../constants/muscleGroups';
import CoachProfileModal, { CoachProfile, COACH_PROFILE_KEY, DEFAULT_PROFILE } from '../../components/coach/CoachProfileModal';
import SectionRule from '../../components/SectionRule';
import Collapsible, { useCollapseAnim } from '../../components/Collapsible';
import PressableScale from '../../components/PressableScale';
import TopTabBar from '../../components/TopTabBar';
import { GREEK_RANK_COLORS, GREEK_RANKS, rankTextColor } from '../../constants/greekRanks';
import type { GreekRankData } from '../../utils/greekRank';
import RoutinePickerModal from '../../components/coach/RoutinePickerModal';
import MusclePickerModal from '../../components/coach/MusclePickerModal';
import PlateauNudge from '../../components/PlateauNudge';
import GenerateAction from '../../components/GenerateAction';
import { writeWidgetGreekRank } from '../../utils/widgetData';


type Props = NativeStackScreenProps<TrainingStackParamsList, 'TrainingHome'>;

// Templates listed before Show All: three full rows of the 2-column grid
const VISIBLE_TEMPLATES = 6;

type Exercise = TemplateExercise;
type WorkoutTemplate = { id: number; name: string; exercises: Exercise[]; programming_json?: string | null; starter?: boolean };
type RoutineDay = {
  id: number; day_order: number; label: string;
  workout_template: { id: number; name: string; exercises: Exercise[]; programming_json?: string | null };
};
type Routine = { id: number; name: string; description?: string; day_count: number; starter?: boolean };
type ActiveRoutine = { id: number; name: string; days: RoutineDay[] };
type InsightReason = 'known' | 'irrelevant' | 'wrong' | 'vague';
type Insight = {
  type: string; title: string; body: string; priority: 'high' | 'medium' | 'low';
  helpful?: boolean | null; reason?: InsightReason | null;
};
type InsightsCache = { insights: Insight[]; fetchedAt: string; shapedByFeedback?: boolean };
const INSIGHT_REASONS: { key: InsightReason; label: string }[] = [
  { key: 'known', label: 'Already knew this' },
  { key: 'irrelevant', label: 'Not for my goal' },
  { key: 'wrong', label: 'Looks wrong' },
  { key: 'vague', label: 'Too vague' },
];




const INSIGHT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  deload:      'battery-half-outline',
  rest:        'moon-outline',
  frequency:   'repeat-outline',
  routine:     'calendar-outline',
  achievement: 'trophy-outline',
  suggestion:  'bulb-outline',
};

// Human-readable labels for the coach-profile summary chips in the hero.
// Values mirror the option lists in CoachProfileModal.
const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hypertrophy', strength: 'Strength', endurance: 'Endurance', general: 'General',
};
const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};
const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Full Gym', home_barbell: 'Home Gym', dumbbells: 'Dumbbells', bodyweight: 'Bodyweight',
};
const AVOID_LABELS: Record<string, string> = {
  lower_back: 'Lower Back', knees: 'Knees', shoulders: 'Shoulders',
};

// Black or white text for a solid hex fill — keeps the rank badge letter
// readable on the light rank colors (Athlete blue, Aretē gold).
function onColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a1a1a' : '#fff';
}

// When a routine day was last logged, matched by name as the rotation does
function lastDoneText(label: string, history: RotationWorkout[], today: Date): string | null {
  const key = label.trim().toLowerCase();
  const days = history
    .filter(w => w.name.trim().toLowerCase() === key)
    .map(w => toLocalDateStr(new Date(w.date)))
    .sort();
  const last = days[days.length - 1];
  if (!last) return null;
  const [y, m, d] = last.split('-').map(Number);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const ago = Math.round((midnight - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (ago <= 0) return 'last done today';
  if (ago === 1) return 'last done yesterday';
  return `last done ${ago} days ago`;
}

// Rows shown from the day's exercises before "+ N more"
const PREVIEW_EXERCISES = 3;

function fmtUpdatedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!(mins >= 1)) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `Updated ${hours} hour${hours !== 1 ? 's' : ''} ago`;
}


export default function CoachScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors, mode } = useTheme();
  const { isPremium } = usePurchase();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Someone following a routine comes here to start its next day; everyone else for the Coach
  const initialTab: 'plans' | 'coach' = user?.active_routine_id ? 'plans' : 'coach';
  const [activeTab, setActiveTab] = useState<'plans' | 'coach'>(initialTab);

  // ── Tab animations ──────────────────────────────────────────────────────────
  const TAB_NAMES = ['plans', 'coach'] as const;
  const TABS = TAB_NAMES.map(key => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const insightAnimsRef = useRef<Animated.Value[]>([]);

  
  // Mutable refs so the stable PanResponder can read current values without stale closure
  const activeTabRef = useRef<typeof TAB_NAMES[number]>(initialTab);
  const handleTabChangeRef = useRef<(tab: typeof TAB_NAMES[number]) => void>(() => {});

  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.8,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, { dx, vx }) => {
        const idx = TAB_NAMES.indexOf(activeTabRef.current);
        if ((dx < -50 || vx < -0.5) && idx < TAB_NAMES.length - 1) {
          handleTabChangeRef.current(TAB_NAMES[idx + 1]);
        } else if ((dx > 50 || vx > 0.5) && idx > 0) {
          handleTabChangeRef.current(TAB_NAMES[idx - 1]);
        }
      },
    })
  ).current;

  const handleTabChange = (tab: typeof TAB_NAMES[number]) => {
    Animated.timing(contentOpacity, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      Animated.timing(contentOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  // Keep mutable refs in sync so PanResponder always reads current values
  activeTabRef.current = activeTab;
  handleTabChangeRef.current = handleTabChange;

  // ── Training tab state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  // Recent workouts by name and date, for the active routine's Up Next (see Home's routine card)
  const [routineHistory, setRoutineHistory] = useState<RotationWorkout[]>(
    () => appCache.get<RotationWorkout[]>('routine_history') ?? [],
  );
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  // Muscle picker for creating blank templates (existing feature)
  const [musclePickerVisible, setMusclePickerVisible] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const templatesAnim = useCollapseAnim(showAllTemplates);

  // ── Coach tab state ─────────────────────────────────────────────────────────
  const [greekRank, setGreekRank] = useState<string>('Neophyte');
  const [coachProfile, setCoachProfile] = useState<CoachProfile>(DEFAULT_PROFILE);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsFetchedAt, setInsightsFetchedAt] = useState<string | null>(null);
  const [insightsShaped, setInsightsShaped] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // AI generate muscle picker
  const [aiMusclePickerVisible, setAiMusclePickerVisible] = useState(false);
  const [aiSelectedMuscles, setAiSelectedMuscles] = useState<string[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);
  // Routine generate loading
  const [routineGenerating, setRoutineGenerating] = useState(false);

  // ── Initialization ──────────────────────────────────────────────────────────
  // Keyed on user.id: it can be undefined on first mount while auth hydrates,
  // and a `_undefined` key would just read back the defaults.
  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${COACH_PROFILE_KEY}_${user.id}`).then(profileRaw => {
      if (profileRaw) {
        try { setCoachProfile({ ...DEFAULT_PROFILE, ...JSON.parse(profileRaw) }); } catch { }
      }
    });
  }, [user?.id]);

  useEffect(() => {
    // Load cached insights
    AsyncStorage.getItem(COACH_INSIGHTS_KEY).then(raw => {
      if (!raw) return;
      try {
        const cache: InsightsCache = JSON.parse(raw);
        const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
        if (ageMs < 3_600_000 && cache.insights?.length) {
          setInsights(cache.insights);
          setInsightsFetchedAt(cache.fetchedAt);
          setInsightsShaped(!!cache.shapedByFeedback);
        }
      } catch { }
    });
  }, []);

  // The caps count what the user made, not the program onboarding generated for them
  const ownTemplateCount = templates.filter(t => !t.starter).length;
  const ownRoutineCount = routines.filter(r => !r.starter).length;
  const templatesAtLimit = !isPremium && ownTemplateCount >= FREE_TEMPLATE_LIMIT;
  const routinesAtLimit = !isPremium && ownRoutineCount >= FREE_ROUTINE_LIMIT;

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    const tmpl = appCache.get<WorkoutTemplate[]>('templates');
    const rout = appCache.get<Routine[]>('routines');
    if (tmpl) setTemplates(tmpl);
    if (rout) setRoutines(rout);
    const greek = appCache.get<GreekRankData>('greek_rank');
    if (greek?.greek_rank) setGreekRank(greek.greek_rank);
  }, []);

  // Keyed on the batch, not the array: a vote replaces the array, and replaying
  // the entrance then flashes every card
  useEffect(() => {
    if (insights.length === 0) return;
    while (insightAnimsRef.current.length < insights.length) {
      insightAnimsRef.current.push(new Animated.Value(0));
    }
    const anims = insightAnimsRef.current.slice(0, insights.length);
    anims.forEach(a => a.setValue(0));
    Animated.stagger(60, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 280, useNativeDriver: true })
    )).start();
  }, [insightsFetchedAt, insights.length]);

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (res.ok) setTemplates(await res.json());
    } catch { }
  };

  const fetchRoutines = async () => {
    try {
      const res = await apiFetch('/api/routines');
      if (res.ok) setRoutines(await res.json());
    } catch { }
  };

  // Same request as Home's: /api/workouts/recent caps at 5, too few to find the last routine day or a layoff
  const fetchRoutineHistory = async () => {
    try {
      const res = await apiFetch('/api/workouts?page=1&per_page=50');
      if (!res.ok) return;
      const data = await res.json();
      const history: RotationWorkout[] = (data.workouts ?? []).map((w: any) => ({ id: w.id, name: w.name ?? '', date: String(w.date) }));
      setRoutineHistory(history);
      appCache.set('routine_history', history);
    } catch { }
  };

  const fetchActiveRoutine = async () => {
    if (!user?.active_routine_id) { setActiveRoutine(null); return; }
    try {
      const res = await apiFetch(`/api/routines/${user.active_routine_id}`);
      if (res.ok) setActiveRoutine(await res.json());
    } catch { }
  };

  // Separate from strength-score, which needs gender: the rank doesn't
  const fetchGreekRank = async () => {
    try {
      const res = await apiFetch('/api/stats/greek-rank');
      if (res.ok) {
        const data: GreekRankData = await res.json();
        setGreekRank(data.greek_rank);
        appCache.set('greek_rank', data);
        writeWidgetGreekRank(user?.id, data);
      }
    } catch { }
  };

  // Seeded from the preload so the data the mount effect above just painted counts as fetched
  const refetchIfStale = useRefetchGate(() => ({
    templates: appCache.stampOf('templates'),
    routines: appCache.stampOf('routines'),
    greek: appCache.stampOf('greek_rank'),
    routineHistory: appCache.stampOf('routine_history'),
  }));

  useFocusEffect(useCallback(() => {
    refetchIfStale('templates', fetchTemplates);
    refetchIfStale('routines', fetchRoutines);
    // Keyed on the id so switching routines is never answered from the old one
    refetchIfStale(`routine:${user?.active_routine_id}`, fetchActiveRoutine);
    refetchIfStale('greek', fetchGreekRank);
    if (user?.active_routine_id) refetchIfStale('routineHistory', fetchRoutineHistory);
  }, [user?.active_routine_id]));

  // ── Coach tab handlers ──────────────────────────────────────────────────────
  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await apiFetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experience: coachProfile.experience,
          goal: coachProfile.goal,
          avoid: coachProfile.avoid,
        }),
      });
      const data = await res.json();
      if (handlePremiumRequired(res, isPremium)) return;
      if (!res.ok) { Alert.alert("Couldn't Load Insights", data.message || 'Try again in a moment.'); return; }
      const fetchedAt = data.generated_at || new Date().toISOString();
      const shapedByFeedback = !!data.shaped_by_feedback;
      setInsights(data.insights ?? []);
      setInsightsFetchedAt(fetchedAt);
      setInsightsShaped(shapedByFeedback);
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify({ insights: data.insights, fetchedAt, shapedByFeedback }));
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Load Insights", 'Try again in a moment.');
    } finally {
      setInsightsLoading(false);
    }
  };

  // Optimistic, since a vote shouldn't wait on the network
  const sendInsightVote = async (idx: number, helpful: boolean | null, reason: InsightReason | null) => {
    const ins = insights[idx];
    if (!ins) return;
    const previous = { helpful: ins.helpful ?? null, reason: ins.reason ?? null };
    const withVote = (vote: { helpful: boolean | null; reason: InsightReason | null }) => setInsights(current => {
      const updated = current.map((it, i) => (i === idx ? { ...it, ...vote } : it));
      if (insightsFetchedAt) {
        AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify({
          insights: updated, fetchedAt: insightsFetchedAt, shapedByFeedback: insightsShaped,
        })).catch(() => {});
      }
      return updated;
    });
    withVote({ helpful, reason });
    try {
      const res = await apiFetch('/api/ai/insights/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: ins.type, title: ins.title, body: ins.body, helpful, reason }),
      });
      if (!res.ok) withVote(previous);
    } catch {
      withVote(previous);
    }
  };

  // Pressing the chosen thumb or reason again takes it back
  const voteOnInsight = (idx: number, helpful: boolean) => {
    const current = insights[idx]?.helpful ?? null;
    sendInsightVote(idx, current === helpful ? null : helpful, null);
  };
  const giveInsightReason = (idx: number, reason: InsightReason) => {
    sendInsightVote(idx, false, insights[idx]?.reason === reason ? null : reason);
  };

  const handleGenerateTemplate = async () => {
    const muscles = aiSelectedMuscles;
    setAiMusclePickerVisible(false);
    setAiGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachProfile.days_per_week,
          goal: coachProfile.goal,
          experience: coachProfile.experience,
          equipment: coachProfile.equipment,
          session_length_min: coachProfile.session_length_min,
          avoid: coachProfile.avoid,
          generate_type: 'template',
          muscles,
          notes: coachProfile.notes,
        }),
      });
      const data = await res.json();
      if (handlePremiumRequired(res, isPremium)) return;
      if (!res.ok) { Alert.alert("Couldn't Generate Workout", data.message || 'Try again in a moment.'); return; }
      navigation.navigate('AIWorkoutPreview', {
        generateType: data.type,
        name: data.name,
        description: data.description,
        exercises: data.exercises,
        days: data.days,
        coachDays: coachProfile.days_per_week,
        coachGoal: coachProfile.goal,
        coachExp: coachProfile.experience,
        coachEquipment: coachProfile.equipment,
        coachSessionLength: String(coachProfile.session_length_min),
        coachAvoid: coachProfile.avoid,
        coachNotes: coachProfile.notes,
      });
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Generate Workout", 'Try again in a moment.');
    } finally {
      setAiGenerating(false);
      setAiSelectedMuscles([]);
    }
  };

  const handleGenerateRoutine = async () => {
    setRoutineGenerating(true);
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_per_week: coachProfile.days_per_week,
          goal: coachProfile.goal,
          experience: coachProfile.experience,
          equipment: coachProfile.equipment,
          session_length_min: coachProfile.session_length_min,
          avoid: coachProfile.avoid,
          generate_type: 'routine',
          notes: coachProfile.notes,
        }),
      });
      const data = await res.json();
      if (handlePremiumRequired(res, isPremium)) return;
      if (!res.ok) { Alert.alert("Couldn't Generate Routine", data.message || 'Try again in a moment.'); return; }
      navigation.navigate('AIWorkoutPreview', {
        generateType: data.type,
        name: data.name,
        description: data.description,
        exercises: data.exercises,
        days: data.days,
        coachDays: coachProfile.days_per_week,
        coachGoal: coachProfile.goal,
        coachExp: coachProfile.experience,
        coachEquipment: coachProfile.equipment,
        coachSessionLength: String(coachProfile.session_length_min),
        coachAvoid: coachProfile.avoid,
        coachNotes: coachProfile.notes,
      });
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Generate Routine", 'Try again in a moment.');
    } finally {
      setRoutineGenerating(false);
    }
  };

  // ── Training tab handlers ───────────────────────────────────────────────────
  const activateRoutine = async (routineId: number) => {
    try {
      const res = await apiFetch(`/api/routines/${routineId}/activate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        updateUser({ active_routine_id: data.active_routine_id });
        setSelectModalVisible(false);
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Set Active Routine", 'Try again in a moment.');
    }
  };

  const handleActiveBlockPress = () => {
    if (routines.length === 0) navigation.navigate('CreateRoutine');
    else setSelectModalVisible(true);
  };

  const createTemplate = () => {
    setSelectedMuscles([]);
    setMusclePickerVisible(true);
  };

  const handleCreateTemplateWithMuscles = () => {
    setMusclePickerVisible(false);
    // No template id: TemplateDetail creates the template on its first save, so
    // backing out without saving doesn't leave an empty template behind.
    navigation.navigate('TemplateDetail', {
      muscleGroups: selectedMuscles.length > 0 ? selectedMuscles : undefined,
    });
  };

  const routineDays = useMemo(
    () => [...(activeRoutine?.days ?? [])].sort((a, b) => a.day_order - b.day_order),
    [activeRoutine],
  );
  const rotation = useMemo(() => {
    const today = new Date();
    return routineRotation(routineDays.map(d => d.label), routineHistory, toLocalDateStr(today), mondayOf(today));
  }, [routineDays, routineHistory]);
  const nextDay = routineDays[rotation.nextIndex] ?? null;

  const startDay = (day: RoutineDay) => (navigation as any).navigate('DashboardTab', {
    screen: 'WorkoutLog',
    initial: false,
    params: {
      prefill: buildTemplatePrefill(day.label, day.workout_template.exercises, parseProgramming(day.workout_template.programming_json)),
      editMode: false,
    },
  });

  // ── Render helpers ──────────────────────────────────────────────────────────
  const rankColor = GREEK_RANK_COLORS[greekRank] ?? colors.accent;
  const rankIcon = GREEK_RANKS.find(r => r.name === greekRank)?.icon ?? greekRank.charAt(0);

  const renderTemplateCard = (t: WorkoutTemplate) => {
    // Two muscles: a third rarely fits half a row
    const muscles = [...new Set(
      t.exercises.flatMap(ex => ex.muscle_group ? ex.muscle_group.split(',').map(m => m.trim()) : []).filter(Boolean)
    )].slice(0, 2);
    return (
      <PressableScale
        key={t.id}
        style={styles.templateCard}
        onPress={() => navigation.navigate('TemplateDetail', { templateId: t.id })}
      >
        <View>
          <Text style={styles.cardName} numberOfLines={2}>{t.name}</Text>
          <Text style={styles.cardSub}>{t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}</Text>
          {muscles.length > 0 && (
            <View style={styles.muscleChipRow}>
              {muscles.map(m => (
                <View key={m} style={styles.templateMuscleChip}>
                  <Text style={styles.templateMuscleChipText} numberOfLines={1}>{m}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.logInlineBtn}
          onPress={() => (navigation as any).navigate('DashboardTab', {
            screen: 'WorkoutLog',
            initial: false,
            params: {
              prefill: buildTemplatePrefill(t.name, t.exercises, parseProgramming(t.programming_json)),
            },
          })}
          accessibilityLabel={`Log ${t.name}`}
        >
          <Text style={styles.logInlineBtnText}>Log</Text>
        </TouchableOpacity>
      </PressableScale>
    );
  };

  const renderInsightCard = (ins: Insight, idx: number) => {
    const icon = INSIGHT_ICONS[ins.type] ?? 'bulb-outline';
    const priorityColor = ins.type === 'achievement' ? colors.save : ins.priority === 'high' ? colors.danger : ins.priority === 'medium' ? colors.warmup : colors.accent;
    const anim = insightAnimsRef.current[idx] ?? new Animated.Value(1);
    return (
      <Animated.View
        key={idx}
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <View style={[styles.insightCard, { borderLeftWidth: 3, borderLeftColor: priorityColor }]}>
          <View style={styles.insightIconWrap}>
            <Ionicons name={icon} size={20} color={priorityColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightTitle}>{ins.title}</Text>
            <Text style={styles.insightBody}>{ins.body}</Text>
            <View style={styles.insightFeedbackRow}>
              <Text style={styles.insightFeedbackLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {ins.helpful == null ? 'Helpful?' : 'Thanks. The Coach will use this.'}
              </Text>
              <TouchableOpacity
                onPress={() => voteOnInsight(idx, true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Helpful"
                accessibilityState={{ selected: ins.helpful === true }}
              >
                <Ionicons
                  name={ins.helpful === true ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={20}
                  color={ins.helpful === true ? colors.accent : colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => voteOnInsight(idx, false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Not helpful"
                accessibilityState={{ selected: ins.helpful === false }}
              >
                <Ionicons
                  name={ins.helpful === false ? 'thumbs-down' : 'thumbs-down-outline'}
                  size={20}
                  color={ins.helpful === false ? colors.textPrimary : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {ins.helpful === false && (
              <View style={styles.insightReasonRow}>
                {INSIGHT_REASONS.map(({ key, label }) => {
                  const selected = ins.reason === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => giveInsightReason(idx, key)}
                      style={[styles.insightReasonChip, selected && styles.insightReasonChipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.insightReasonText, selected && { color: colors.textPrimary }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <TopTabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <Animated.View style={{ flex: 1, opacity: contentOpacity }} {...swipeResponder.panHandlers}>
      {/* ── PLANS TAB ── */}
      {activeTab === 'plans' && (
        <ScrollView style={styles.trainingScroll} contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          {/* Active routine with its Up Next. Not one big touchable: the
              routine name and Start are separate targets, since a touchable
              nested inside PressableScale gets stuck at its pressed opacity
              (the outer responder swallows the press-out). */}
          {activeRoutine ? (
            <View style={styles.activeBlock}>
              <View style={styles.activeHeaderRow}>
                <Text style={styles.activeRoutineLabel}>Active Routine</Text>
                <TouchableOpacity
                  style={styles.activeRoutineLink}
                  onPress={() => navigation.navigate('RoutineDetail', { routineId: activeRoutine.id, routineName: activeRoutine.name })}
                  accessibilityLabel={`Open ${activeRoutine.name}`}
                >
                  <Text style={styles.activeRoutineLinkText} numberOfLines={1}>{activeRoutine.name}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {nextDay ? (() => {
                const exercises = nextDay.workout_template.exercises;
                const programming = parseProgramming(nextDay.workout_template.programming_json);
                const lastDone = lastDoneText(nextDay.label, routineHistory, new Date());
                const meta = [
                  `${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}`,
                  ...(lastDone ? [lastDone] : []),
                ].join(' · ');
                return (
                  <>
                    <Text style={styles.upNextLabel}>
                      {rotation.restarted
                        ? `Up next · Fresh start, day 1 of ${routineDays.length}`
                        : `Up next · Day ${rotation.nextIndex + 1} of ${routineDays.length}`}
                    </Text>
                    <Text style={styles.upNextName} numberOfLines={2}>{nextDay.label}</Text>
                    <Text style={styles.upNextMeta}>{meta}</Text>

                    <View
                      style={styles.rotationBar}
                      accessible
                      accessibilityLabel={`${rotation.doneThisWeek.size} of ${routineDays.length} days done this week`}
                    >
                      {routineDays.map((d, i) => (
                        <View
                          key={d.id}
                          style={[
                            styles.rotationSegment,
                            {
                              backgroundColor: rotation.doneThisWeek.has(i) ? colors.accent
                                : i === rotation.nextIndex ? colors.textPrimary
                                : colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>

                    {exercises.length > 0 && (
                      <View style={styles.previewList}>
                        {exercises.slice(0, PREVIEW_EXERCISES).map(ex => {
                          const plan = programming[ex.id];
                          return (
                            <View key={ex.id} style={styles.previewRow}>
                              <Text style={styles.previewName} numberOfLines={1}>{ex.name}</Text>
                              {plan && <Text style={styles.previewPlan}>{plan.sets} × {plan.reps}</Text>}
                            </View>
                          );
                        })}
                        {exercises.length > PREVIEW_EXERCISES && (
                          <Text style={styles.previewMore}>+ {exercises.length - PREVIEW_EXERCISES} more</Text>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.startBtn}
                      onPress={() => startDay(nextDay)}
                      accessibilityLabel={`Start ${nextDay.label}`}
                    >
                      <Ionicons name="play" size={16} color={colors.accentText} />
                      <Text style={styles.startBtnText} numberOfLines={1}>Start {nextDay.label}</Text>
                    </TouchableOpacity>
                  </>
                );
              })() : (
                <Text style={styles.noRoutineText}>This routine has no days yet. Open it to add some.</Text>
              )}
            </View>
          ) : (
            <PressableScale style={styles.activeBlock} onPress={handleActiveBlockPress}>
              <Text style={styles.activeRoutineLabel}>Active Routine</Text>
              <Text style={styles.noRoutineText}>
                {routines.length === 0 ? 'No routines yet. Tap to create one' : 'No active routine. Tap to select one'}
              </Text>
            </PressableScale>
          )}

          {/* Templates */}
          <View style={styles.sectionHeaderRow}>
            <SectionRule label="Templates" style={{ flex: 1, marginBottom: 0 }} />
            {!isPremium && (
              <Text style={styles.freeLimitText}>{Math.min(ownTemplateCount, FREE_TEMPLATE_LIMIT)} of {FREE_TEMPLATE_LIMIT} free</Text>
            )}
            <TouchableOpacity
              onPress={templatesAtLimit
                ? () => (navigation as any).navigate('Paywall', { source: 'templates' })
                : createTemplate
              }
              style={styles.newTemplateBtn}
            >
              <Ionicons name={templatesAtLimit ? 'lock-closed-outline' : 'add'} size={16} color={colors.save} />
              <Text style={styles.newTemplateBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          {templates.length === 0 ? (
            <Text style={styles.emptyText}>No templates yet. Save a workout as a template to reuse it.</Text>
          ) : (
            <>
              <View style={styles.templateGrid}>
                {templates.slice(0, VISIBLE_TEMPLATES).map(renderTemplateCard)}
              </View>
              {/* The rest open and close as one block, so height and fade
                  stay on one timeline (see utils/layoutAnimation.ts). */}
              {templates.length > VISIBLE_TEMPLATES && (
                <Collapsible progress={templatesAnim} expanded={showAllTemplates}>
                  <View style={styles.templateGrid}>
                    {templates.slice(VISIBLE_TEMPLATES).map(renderTemplateCard)}
                  </View>
                </Collapsible>
              )}
            </>
          )}
          {templates.length > VISIBLE_TEMPLATES && (
            <TouchableOpacity
              style={styles.showAllBtn}
              onPress={() => setShowAllTemplates(v => !v)}
            >
              <Text style={[styles.showAllBtnText, { color: colors.accent }]}>
                {showAllTemplates ? 'Show Less' : `Show All (${templates.length})`}
              </Text>
              <Animated.View
                style={{ transform: [{ rotate: templatesAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
              >
                <Ionicons name="chevron-down" size={14} color={colors.accent} />
              </Animated.View>
            </TouchableOpacity>
          )}

          {/* Routines */}
          <View style={[styles.sectionHeaderRow, { marginTop: spacing.md }]}>
            <SectionRule label="Routines" style={{ flex: 1, marginBottom: 0 }} />
            {!isPremium && (
              <Text style={styles.freeLimitText}>{Math.min(ownRoutineCount, FREE_ROUTINE_LIMIT)} of {FREE_ROUTINE_LIMIT} free</Text>
            )}
            <TouchableOpacity
              onPress={routinesAtLimit
                ? () => (navigation as any).navigate('Paywall', { source: 'routines' })
                : () => navigation.navigate('CreateRoutine')
              }
              style={styles.newTemplateBtn}
            >
              <Ionicons name={routinesAtLimit ? 'lock-closed-outline' : 'add'} size={16} color={colors.save} />
              <Text style={styles.newTemplateBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          {routines.length === 0 ? (
            <Text style={styles.emptyText}>No routines yet</Text>
          ) : (
            <View style={styles.routineGrid}>
              {routines.map(item => (
                <PressableScale
                  key={item.id}
                  style={styles.routineCard}
                  onPress={() => navigation.navigate('RoutineDetail', { routineId: item.id, routineName: item.name })}
                >
                  <Text style={styles.routineCardName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.routineCardSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
                </PressableScale>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── COACH TAB ── */}
      {activeTab === 'coach' && (
        <ScrollView contentContainerStyle={styles.coachContent}>
          <PlateauNudge
            isPremium={isPremium}
            onOpenLift={lift => navigation.navigate('ExerciseDetail', { ...lift, initialTab: 'charts' })}
          />
          {/* Coach-profile summary — the whole card opens the profile modal */}
          <PressableScale
            style={[styles.coachHero, { backgroundColor: rankColor + '18', borderColor: rankColor + '40' }]}
            onPress={() => setProfileModalVisible(true)}
          >
            <View style={styles.coachHeroTopRow}>
              <TouchableOpacity
                style={[styles.rankPill, { borderColor: rankColor + '55' }]}
                onPress={() => (navigation as any).navigate('ProgressTab', { screen: 'StrengthScore', initial: false })}
              >
                <View style={[styles.rankPillIcon, { backgroundColor: rankColor }]}>
                  <Text style={[styles.rankPillIconText, { color: onColor(rankColor) }]}>{rankIcon}</Text>
                </View>
                <Text style={[styles.rankPillText, { color: rankTextColor(greekRank, rankColor, mode) }]}>{greekRank}</Text>
              </TouchableOpacity>
              <Ionicons name="create-outline" size={16} color={colors.accent} />
            </View>

            <View style={styles.coachSummaryRow}>
              <Text style={styles.coachSummaryLabel}>Goal</Text>
              <Text style={styles.coachSummaryValue} numberOfLines={1}>
                {GOAL_LABELS[coachProfile.goal] ?? coachProfile.goal}
                {'  ·  '}{EXPERIENCE_LABELS[coachProfile.experience] ?? coachProfile.experience}
              </Text>
            </View>
            <View style={styles.coachSummaryRow}>
              <Text style={styles.coachSummaryLabel}>Setup</Text>
              <Text style={styles.coachSummaryValue} numberOfLines={1}>
                {EQUIPMENT_LABELS[coachProfile.equipment] ?? coachProfile.equipment}
                {'  ·  '}{coachProfile.days_per_week} days/wk
                {'  ·  '}{coachProfile.session_length_min} min
              </Text>
            </View>
            {coachProfile.avoid.length > 0 && (
              <View style={styles.coachSummaryRow}>
                <Ionicons name="alert-circle-outline" size={13} color={colors.danger} style={styles.coachAvoidIcon} />
                <Text style={[styles.coachSummaryValue, { color: colors.danger }]} numberOfLines={1}>
                  Avoid {coachProfile.avoid.map(a => AVOID_LABELS[a] ?? a).join(', ')}
                </Text>
              </View>
            )}
          </PressableScale>

          {/* AI Coach card — Generate + Insights unified */}
          <View style={styles.aiCoachCard}>
            <SectionRule label="Generate" style={{ marginBottom: spacing.sm }} />
            <View style={styles.generateBtnRow}>
              <TouchableOpacity
                style={[styles.generateBtn, aiGenerating && { opacity: 0.6 }]}
                disabled={aiGenerating || routineGenerating}
                onPress={isPremium
                  ? () => { setAiSelectedMuscles([]); setAiMusclePickerVisible(true); }
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
              >
                <Ionicons
                  name={isPremium ? (aiGenerating ? 'hourglass-outline' : 'list-outline') : 'lock-closed-outline'}
                  size={16} color={colors.accentText}
                />
                <Text style={styles.generateBtnText}>
                  {aiGenerating ? 'Generating…' : 'Template'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.generateBtnOutline, routineGenerating && { opacity: 0.6 }]}
                disabled={aiGenerating || routineGenerating}
                onPress={isPremium
                  ? handleGenerateRoutine
                  : () => (navigation as any).navigate('Paywall', { source: 'ai_coach' })
                }
              >
                <Ionicons
                  name={isPremium ? (routineGenerating ? 'hourglass-outline' : 'calendar-outline') : 'lock-closed-outline'}
                  size={16} color={colors.save}
                />
                <Text style={styles.generateBtnOutlineText}>
                  {routineGenerating ? 'Generating…' : 'Routine'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.insightsSectionHeader}>
              <SectionRule label="Insights" style={{ flex: 1, marginBottom: 0 }} />
              {isPremium && (
                <TouchableOpacity onPress={fetchInsights} disabled={insightsLoading} style={styles.refreshBtn}>
                  {insightsLoading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name="refresh-outline" size={18} color={colors.accent} />
                  }
                </TouchableOpacity>
              )}
            </View>

            {isPremium && insights.length > 0 && insightsFetchedAt && (
              <Text style={styles.insightsUpdated}>
                {fmtUpdatedAgo(insightsFetchedAt)}{insightsShaped ? '  ·  Shaped by your feedback' : ''}
              </Text>
            )}
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {isPremium ? (
                insights.length > 0
                  ? insights.map(renderInsightCard)
                  : (
                    <GenerateAction
                      message="Personalized coaching based on your recent training."
                      label="Generate Insights"
                      loading={insightsLoading}
                      onPress={fetchInsights}
                      loadingAccessibilityLabel="Writing insights"
                    />
                  )
              ) : (
                <>
                  {/* A free account reads one insight a week, in the Weekly Summary's review */}
                  <View style={styles.insightsEmpty}>
                    <Ionicons name="lock-closed-outline" size={32} color={colors.textSecondary} />
                    <Text style={styles.insightsEmptyText}>
                      Insights are part of Premium. Your free weekly read is in the Weekly Summary.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.upgradeBanner}
                    onPress={() => (navigation as any).navigate('Paywall', { source: 'ai_coach' })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.upgradeBannerTitle}>Unlock AI Coach</Text>
                      <Text style={styles.upgradeBannerSub}>
                        Insights whenever you want them, the full weekly review, plus programs built for you.
                      </Text>
                    </View>
                    <View style={styles.upgradeBannerCTA}>
                      <Text style={styles.upgradeBannerCTAText}>Upgrade</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      </Animated.View>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      <RoutinePickerModal
        visible={selectModalVisible}
        routines={routines}
        activeRoutineId={user?.active_routine_id}
        onSelect={activateRoutine}
        onClose={() => setSelectModalVisible(false)}
      />

      {/* Muscle Picker for blank template creation */}
      <MusclePickerModal
        visible={musclePickerVisible}
        onClose={() => setMusclePickerVisible(false)}
        title="What muscles are you training?"
        subtitle="We'll pre-filter your exercise list."
        muscles={muscleGroups}
        selected={selectedMuscles}
        onToggle={mg => setSelectedMuscles(prev => prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg])}
        buttonLabel={selectedMuscles.length > 0 ? 'Create Template' : 'Create Template (Skip)'}
        onSubmit={handleCreateTemplateWithMuscles}
      />

      {/* AI Muscle Picker for Coach tab generate */}
      <MusclePickerModal
        visible={aiMusclePickerVisible}
        onClose={() => setAiMusclePickerVisible(false)}
        title="Target muscles for this template?"
        subtitle="Pick the muscles you want to train. Your AI coach will build around them."
        muscles={muscleGroups.filter(mg => mg !== 'Other')}
        selected={aiSelectedMuscles}
        onToggle={mg => setAiSelectedMuscles(prev => prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg])}
        buttonLabel={aiSelectedMuscles.length > 0
          ? `Generate Template (${aiSelectedMuscles.length} muscle${aiSelectedMuscles.length > 1 ? 's' : ''})`
          : 'Generate Template'}
        onSubmit={handleGenerateTemplate}
        submitDisabled={aiGenerating}
      />

      {/* Coach Profile Modal */}
      <CoachProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onSave={profile => setCoachProfile(profile)}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  insightsUpdated: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },

  emptyText: { textAlign: 'center', color: colors.textSecondary, marginVertical: spacing.sm, fontSize: typography.fontSize.sm },

  // ── Training tab ────────────────────────────────────────────────────────────
  trainingScroll: { flex: 1, paddingHorizontal: spacing.md },
  activeBlock: {
    backgroundColor: colors.surface, borderRadius: spacing.md, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.accent + '59',
  },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  // Same label treatment as SectionRule, minus the hairlines and centering.
  activeRoutineLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  activeRoutineLink: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, minHeight: 32 },
  activeRoutineLinkText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, flexShrink: 1 },
  noRoutineText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
  upNextLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.accent },
  upNextName: { fontSize: typography.fontSize.xxl, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  upNextMeta: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rotationBar: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  rotationSegment: { flex: 1, height: 6, borderRadius: 3 },
  previewList: { marginTop: spacing.md, gap: spacing.sm },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  previewName: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary },
  previewPlan: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  previewMore: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    minHeight: 50, marginTop: spacing.md, borderRadius: spacing.md, backgroundColor: colors.accent, paddingHorizontal: spacing.md,
  },
  startBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.accentText, flexShrink: 1 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  newTemplateBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  newTemplateBtnText: { color: colors.save, fontWeight: '600', fontSize: typography.fontSize.sm },
  cardName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  cardSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  routineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  routineCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, width: '48%', minHeight: 72,
    justifyContent: 'space-between',
  },
  routineCardName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },
  routineCardSub: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  // Same 2-column grid as the routines; cards in a row stretch to the taller one, so Log buttons line up
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  templateCard: {
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md, width: '48%', gap: spacing.sm,
    justifyContent: 'space-between',
  },
  logInlineBtn: {
    backgroundColor: colors.save, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    minHeight: 32, alignItems: 'center', justifyContent: 'center',
  },
  logInlineBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.sm },
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  showAllBtnText: { fontWeight: '600', fontSize: typography.fontSize.sm },
  muscleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 5 },
  templateMuscleChip: { backgroundColor: colors.accent + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  templateMuscleChipText: { fontSize: typography.fontSize.xs, color: colors.accent, fontWeight: '600' },

  // ── Coach tab ───────────────────────────────────────────────────────────────
  coachContent: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coachHero: {
    backgroundColor: colors.surface, borderRadius: spacing.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.xs,
  },
  coachHeroTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999,
    paddingLeft: 3, paddingRight: spacing.sm, paddingVertical: 3,
  },
  rankPillIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  rankPillIconText: { fontSize: typography.fontSize.xs, fontWeight: '800', color: '#fff' },
  rankPillText: { fontSize: typography.fontSize.sm, fontWeight: '800', letterSpacing: 0.3 },
  coachSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coachSummaryLabel: {
    width: 44, fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
    color: colors.textSecondary, textTransform: 'uppercase',
  },
  coachSummaryValue: {
    flex: 1, fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textPrimary,
  },
  coachAvoidIcon: { width: 44, textAlign: 'center' },
  aiCoachCard: { marginBottom: spacing.md, gap: spacing.sm },
  generateBtnRow: { flexDirection: 'row', gap: spacing.sm },
  generateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.save, borderRadius: spacing.sm, paddingVertical: 12 },
  generateBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.sm },
  generateBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.save, borderRadius: spacing.sm, paddingVertical: 12 },
  generateBtnOutlineText: { color: colors.save, fontWeight: '700', fontSize: typography.fontSize.sm },
  insightsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  refreshBtn: { padding: spacing.xs },
  insightCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: colors.border, borderRightColor: colors.border, borderBottomColor: colors.border,
  },
  insightIconWrap: { width: 32, alignItems: 'center', paddingTop: 2 },
  insightTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  insightBody: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  insightFeedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  // flex: 1 keeps the thumbs pinned right while the label swaps to the longer thanks
  insightFeedbackLabel: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary },
  insightReasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  insightReasonChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  insightReasonChipSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  insightReasonText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  freeLimitText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  insightsEmpty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  insightsEmptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 240 },
  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.accent + '15', borderRadius: spacing.sm,
    borderWidth: 1, borderColor: colors.accent + '40',
    padding: spacing.md, marginTop: spacing.xs,
  },
  upgradeBannerTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  upgradeBannerSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
  upgradeBannerCTA: { backgroundColor: colors.accent, borderRadius: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  upgradeBannerCTAText: { color: colors.accentText, fontSize: typography.fontSize.sm, fontWeight: '700' },
});
