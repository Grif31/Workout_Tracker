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
import { answered, appCache, useRefetchGate } from '../../utils/appCache';
import { buildTemplatePrefill, parseProgramming, type TemplateExercise } from '../../utils/templatePrefill';
import { routineRotation, type RotationWorkout } from '../../utils/routineRotation';
import { toLocalDateStr } from '../../utils/date';
import { mondayOf } from '../../utils/widgetSnapshot';
import { TrainingStackParamsList } from '../../navigation/types';
import { muscleGroups } from '../../constants/muscleGroups';
import CoachProfileModal from '../../components/coach/CoachProfileModal';
import { DEFAULT_PROFILE, loadCoachProfile, syncCoachProfile, type CoachProfile } from '../../utils/coachProfile';
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
import WeeklyReviewCard from '../../components/WeeklyReviewCard';
import { writeWidgetGreekRank } from '../../utils/widgetData';
import { motionTiming } from '../../utils/motion';


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
  // Absent on a batch cached by a build from before insights were stored
  id?: number;
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




// The tag over each insight card; colorFor picks its tint
const INSIGHT_TAGS: Record<string, string> = {
  deload:      'Deload',
  rest:        'Recovery',
  frequency:   'Volume',
  routine:     'Routine',
  achievement: 'Win',
  follow_up:   'Follow-up',
  suggestion:  'Tip',
};

// The profile card's summary. Values mirror the option lists in CoachProfileModal.
const GOAL_PHRASES: Record<string, string> = {
  hypertrophy: 'Build muscle', strength: 'Get stronger', endurance: 'Build endurance', general: 'Stay fit',
};
const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};
const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Full gym', home_barbell: 'Home gym', dumbbells: 'Dumbbells', bodyweight: 'Bodyweight',
};
const AVOID_LABELS: Record<string, string> = {
  lower_back: 'lower back', knees: 'knees', shoulders: 'shoulders',
};

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
  const TAB_NAMES = ['coach', 'plans'] as const;
  const TABS = TAB_NAMES.map(key => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1) }));
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

  // Switches on the tap's frame: the segmented control's sliding thumb already
  // shows the change, and a fade-out first delayed every switch.
  const handleTabChange = (tab: typeof TAB_NAMES[number]) => setActiveTab(tab);

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
  // null until this account has a profile; the defaults stand in on screen and for generation
  const [savedProfile, setSavedProfile] = useState<CoachProfile | null>(null);
  const coachProfile = savedProfile ?? DEFAULT_PROFILE;
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
  // Bumped on focus so the review card picks up one Weekly Summary wrote while this tab stayed mounted
  const [focusCount, setFocusCount] = useState(0);
  // The review covers the last completed week, the one Weekly Summary opens on, so the two share it
  const reviewWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return mondayOf(d);
  }, [focusCount]);

  // ── Initialization ──────────────────────────────────────────────────────────
  // Keyed on user.id: it can be undefined on first mount while auth hydrates,
  // and a `_undefined` key would just read back the defaults.
  // The device copy first, then the server's, which is how a reinstall gets it back
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    loadCoachProfile(user.id).then(local => { if (!cancelled && local) setSavedProfile(local); });
    syncCoachProfile(user.id).then(synced => { if (!cancelled && synced) setSavedProfile(synced); });
    return () => { cancelled = true; };
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
      motionTiming(a, { toValue: 1, duration: 280, useNativeDriver: true })
    )).start();
  }, [insightsFetchedAt, insights.length]);

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (!res.ok) return answered(res);
      setTemplates(await res.json());
    } catch {
      return false;
    }
  };

  const fetchRoutines = async () => {
    try {
      const res = await apiFetch('/api/routines');
      if (!res.ok) return answered(res);
      setRoutines(await res.json());
    } catch {
      return false;
    }
  };

  // Same request as Home's: /api/workouts/recent caps at 5, too few to find the last routine day or a layoff
  const fetchRoutineHistory = async () => {
    try {
      const res = await apiFetch('/api/workouts?page=1&per_page=50');
      if (!res.ok) return answered(res);
      const data = await res.json();
      const history: RotationWorkout[] = (data.workouts ?? []).map((w: any) => ({ id: w.id, name: w.name ?? '', date: String(w.date) }));
      setRoutineHistory(history);
      appCache.set('routine_history', history);
    } catch {
      return false;
    }
  };

  const fetchActiveRoutine = async () => {
    if (!user?.active_routine_id) { setActiveRoutine(null); return; }
    try {
      const res = await apiFetch(`/api/routines/${user.active_routine_id}`);
      if (!res.ok) return answered(res);
      setActiveRoutine(await res.json());
    } catch {
      return false;
    }
  };

  // Separate from strength-score, which needs gender: the rank doesn't
  const fetchGreekRank = async () => {
    try {
      const res = await apiFetch('/api/stats/greek-rank');
      if (!res.ok) return answered(res);
      const data: GreekRankData = await res.json();
      setGreekRank(data.greek_rank);
      appCache.set('greek_rank', data);
      writeWidgetGreekRank(user?.id, data);
    } catch {
      return false;
    }
  };

  // Seeded from the preload so the data the mount effect above just painted counts as fetched
  const refetchIfStale = useRefetchGate(() => ({
    templates: appCache.stampOf('templates'),
    routines: appCache.stampOf('routines'),
    greek: appCache.stampOf('greek_rank'),
    routineHistory: appCache.stampOf('routine_history'),
  }));

  useFocusEffect(useCallback(() => {
    setFocusCount(n => n + 1);
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
        // Without a profile on the device the server reads its stored one
        body: JSON.stringify(savedProfile
          ? { experience: savedProfile.experience, goal: savedProfile.goal, avoid: savedProfile.avoid, notes: savedProfile.notes }
          : {}),
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
        body: JSON.stringify({ insight_id: ins.id ?? null, type: ins.type, title: ins.title, body: ins.body, helpful, reason }),
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
        supersetNote: data.superset_note ?? null,
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
        supersetNote: data.superset_note ?? null,
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

  const insightTint = (type: string) =>
    type === 'achievement' || type === 'frequency' ? colors.accent
      : type === 'deload' || type === 'rest' ? colors.warmup
      : colors.info;

  const renderInsightCard = (ins: Insight, idx: number) => {
    const tint = insightTint(ins.type);
    const tag = INSIGHT_TAGS[ins.type] ?? 'Tip';
    const anim = insightAnimsRef.current[idx] ?? new Animated.Value(1);
    return (
      <Animated.View
        key={idx}
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <View style={styles.insightCard}>
          <View style={[styles.insightTag, { backgroundColor: tint + '26' }]}>
            <Text style={[styles.insightTagText, { color: tint }]}>{tag}</Text>
          </View>
          <Text style={styles.insightTitle}>{ins.title}</Text>
          <Text style={styles.insightBody}>{ins.body}</Text>
          <View style={styles.insightFeedbackRow}>
            <Text style={styles.insightFeedbackLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {ins.helpful == null ? '' : 'Thanks. The Coach will use this.'}
            </Text>
            <TouchableOpacity
              onPress={() => voteOnInsight(idx, true)}
              style={[styles.voteBtn, ins.helpful === true && styles.voteBtnHelpful]}
              accessibilityRole="button"
              accessibilityLabel="Helpful"
              accessibilityState={{ selected: ins.helpful === true }}
            >
              <Ionicons
                name={ins.helpful === true ? 'thumbs-up' : 'thumbs-up-outline'}
                size={18}
                color={ins.helpful === true ? colors.accentText : colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => voteOnInsight(idx, false)}
              style={[styles.voteBtn, ins.helpful === false && styles.voteBtnNotHelpful]}
              accessibilityRole="button"
              accessibilityLabel="Not helpful"
              accessibilityState={{ selected: ins.helpful === false }}
            >
              <Ionicons
                name={ins.helpful === false ? 'thumbs-down' : 'thumbs-down-outline'}
                size={18}
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
      </Animated.View>
    );
  };

  const profileHeadline = `${GOAL_PHRASES[coachProfile.goal] ?? coachProfile.goal} · ${coachProfile.days_per_week} day${coachProfile.days_per_week !== 1 ? 's' : ''} a week`;
  const profileDetails = [
    EXPERIENCE_LABELS[coachProfile.experience] ?? coachProfile.experience,
    `${coachProfile.session_length_min} min`,
    EQUIPMENT_LABELS[coachProfile.equipment] ?? coachProfile.equipment,
    ...(coachProfile.avoid.length ? [`Easy on ${coachProfile.avoid.map(a => AVOID_LABELS[a] ?? a).join(', ')}`] : []),
  ].join(' · ');
  const rankText = rankTextColor(greekRank, rankColor, mode);
  const openPaywall = () => (navigation as any).navigate('Paywall', { source: 'ai_coach' });

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <TopTabBar tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <View style={{ flex: 1 }} {...swipeResponder.panHandlers}>
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
          {/* The rank badge opens the Strength Score; the rest of the card edits the profile */}
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={[styles.rankBadge, { backgroundColor: rankColor + '26' }]}
              onPress={() => (navigation as any).navigate('ProgressTab', { screen: 'StrengthScore', initial: false })}
              accessibilityRole="button"
              accessibilityLabel={`${greekRank} rank. Open Strength Score`}
            >
              <Text style={[styles.rankBadgeText, { color: rankText }]}>{rankIcon}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileBody}
              onPress={() => setProfileModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit coach profile"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.profileHeadline} numberOfLines={1}>{profileHeadline}</Text>
                <Text style={styles.profileDetails} numberOfLines={2}>
                  <Text style={[styles.profileRank, { color: rankText }]}>{greekRank}</Text>
                  {' · '}{profileDetails}
                </Text>
              </View>
              <Text style={styles.profileEdit}>Edit</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, (aiGenerating || routineGenerating) && { opacity: 0.6 }]}
            disabled={aiGenerating || routineGenerating}
            onPress={isPremium ? () => { setAiSelectedMuscles([]); setAiMusclePickerVisible(true); } : openPaywall}
            accessibilityRole="button"
          >
            {aiGenerating
              ? <ActivityIndicator size="small" color={colors.accentText} />
              : <Ionicons name={isPremium ? 'sparkles-outline' : 'lock-closed'} size={18} color={colors.accentText} />}
            <Text style={styles.generateBtnText}>{aiGenerating ? 'Generating…' : 'Generate a workout'}</Text>
          </TouchableOpacity>
          {isPremium && (
            <TouchableOpacity
              style={styles.routineLink}
              disabled={aiGenerating || routineGenerating}
              onPress={handleGenerateRoutine}
              accessibilityRole="button"
            >
              {routineGenerating && <ActivityIndicator size="small" color={colors.textSecondary} />}
              <Text style={styles.routineLinkText}>{routineGenerating ? 'Building your routine…' : 'Or build a full routine'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.reviewWrap}>
            <WeeklyReviewCard weekStart={reviewWeek} isPremium={isPremium} onUnlock={openPaywall} reloadToken={focusCount} />
          </View>

          {/* A free account's one AI read a week is the review above, so it gets no insights section */}
          {isPremium && (
            <>
              <View style={styles.insightsHeader}>
                <Text style={styles.insightsHeading}>Insights</Text>
                {insights.length > 0 && insightsFetchedAt && (
                  <Text style={styles.insightsMeta} numberOfLines={1}>
                    {insightsShaped ? 'Shaped by your feedback' : fmtUpdatedAgo(insightsFetchedAt)}
                  </Text>
                )}
                {insights.length > 0 && (
                  <TouchableOpacity
                    onPress={fetchInsights}
                    disabled={insightsLoading}
                    style={styles.refreshBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh insights"
                  >
                    {insightsLoading
                      ? <ActivityIndicator size="small" color={colors.textSecondary} />
                      : <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />}
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.insightList}>
                {insights.length > 0
                  ? insights.map(renderInsightCard)
                  : (
                    <View style={styles.insightsEmpty}>
                      <GenerateAction
                        message="Personalized coaching based on your recent training."
                        label="Generate Insights"
                        loading={insightsLoading}
                        onPress={fetchInsights}
                        loadingAccessibilityLabel="Writing insights"
                      />
                    </View>
                  )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      </View>

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
        onSave={profile => setSavedProfile(profile)}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14,
    paddingVertical: 12, paddingLeft: spacing.md, marginBottom: spacing.md,
  },
  rankBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: typography.fontSize.md, fontWeight: '800' },
  profileBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, minHeight: 44 },
  profileHeadline: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  profileDetails: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  profileRank: { fontWeight: '700' },
  profileEdit: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.accent, borderRadius: 14, minHeight: 54,
  },
  generateBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.md },
  routineLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: 40, marginTop: spacing.xs,
  },
  routineLinkText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: '600' },
  reviewWrap: { marginTop: spacing.md },
  insightsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
  insightsHeading: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  insightsMeta: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  refreshBtn: { padding: spacing.xs },
  insightList: { gap: spacing.md },
  insightsEmpty: { backgroundColor: colors.surface, borderRadius: 14 },
  insightCard: { backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md },
  insightTag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: 10 },
  insightTagText: { fontSize: typography.fontSize.xs, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  insightTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 21 },
  insightBody: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  insightFeedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  // flex: 1 keeps the thumbs pinned right while the thanks comes and goes
  insightFeedbackLabel: { flex: 1, fontSize: 12, color: colors.textSecondary },
  voteBtn: {
    width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  voteBtnHelpful: { backgroundColor: colors.accent, borderColor: colors.accent },
  voteBtnNotHelpful: { backgroundColor: colors.border },
  insightReasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  insightReasonChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  insightReasonChipSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  insightReasonText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  freeLimitText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
});
