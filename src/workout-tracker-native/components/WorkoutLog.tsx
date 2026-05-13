import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, TouchableOpacity,
  KeyboardAvoidingView, Platform, Vibration, ScrollView,
  InputAccessoryView, Keyboard, Switch, Image, Modal, Dimensions,
  Animated, AppState,
} from 'react-native';
import {
  scheduleRestTimerAlert,
  cancelRestTimerAlert,
  postLiveWorkoutNotification,
  cancelLiveWorkoutNotification,
} from '../utils/notifications';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import ExerciseListModal from '../components/ExerciseList';
import NewExerciseForm from '../components/NewExerciseForm';
import { PrefillWorkoutData } from './WorkoutDetails';
import { muscleGroups } from 'constants/muscleGroups';
import { useWorkoutSession } from '../context/WorkoutSessionContext';

const REST_TIMER_KEY = 'default_rest_timer';
const AUTO_REST_KEY = 'workout_auto_rest';
const VIBRATE_KEY = 'workout_vibrate';
const RPE_KEY = 'workout_show_rpe';
const NUMERIC_ACCESSORY_ID = 'workoutNumericDismiss';

const RPE_LABELS = [
  { value: 1,  desc: 'Very easy — barely any effort' },
  { value: 2,  desc: 'Easy' },
  { value: 3,  desc: 'Very light effort' },
  { value: 4,  desc: 'Light effort' },
  { value: 5,  desc: 'Moderate — many reps left' },
  { value: 6,  desc: 'Could do 4–5 more reps' },
  { value: 7,  desc: 'Could do 3–4 more reps' },
  { value: 8,  desc: 'Could do 2–3 more reps' },
  { value: 9,  desc: 'Could do 1 more rep' },
  { value: 10, desc: 'Max effort — no reps left' },
];

const SET_TYPES = ['N', 'W', 'D', 'F'] as const;
type SetType = typeof SET_TYPES[number];

type WorkoutSet = {
  id?: number;
  reps: string;
  weight: string;
  set_type: SetType;
  done?: boolean;
  rpe?: string;
  cardio_duration?: string;
  distance?: string;
  distance_unit?: string;
  intensity?: string;
};

type EditableSetField = 'reps' | 'weight';

type PreviousSet = { reps: string; weight: string; set_type: string };
type ExerciseEntry = {
  uid: string;
  id?: string;
  name: string;
  exercise_template_id?: number;
  exercise_type?: 'strength' | 'cardio';
  equipment?: string;
  image_url?: string;
  sets: WorkoutSet[];
  previousSets?: PreviousSet[];
  currentPR?: {
    max_weight?: number | null;
    estimated_1rm?: number | null;
    per_weight_reps?: { weight: number; max_reps: number }[];
  };
  notes?: string;
};

const makeUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

type Props = {
  prefill?: PrefillWorkoutData;
  editMode?: boolean;
  workoutId?: number;
  onSubmit?: (workoutId?: number, summary?: { workoutName: string; prs: any[]; totalVolume: number; totalReps: number; totalSets: number; muscles: string[]; isFirstWorkout: boolean }) => void;
  onCancel?: () => void;
  onViewExerciseHistory?: (exerciseName: string, exerciseTemplateId?: number) => void;
};

function fmtElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60)}m`;
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WorkoutLog({ prefill, editMode, workoutId, onSubmit, onCancel, onViewExerciseHistory }: Props) {
  const { user } = useAuth();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SET_TYPE_COLORS = useMemo<Record<SetType, string>>(() => ({
    N: colors.textSecondary,
    W: '#FF9500',
    D: '#AF52DE',
    F: colors.danger,
  }), [colors]);
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const insets = useSafeAreaInsets();
  const { session, saveSession, clearSession, setWorkoutOpen } = useWorkoutSession();

  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<Date>(new Date());
  const baseRef = useRef(0);

  const [defaultRest, setDefaultRest] = useState(90);
  const [restActive, setRestActive] = useState(false);
  const [restPaused, setRestPaused] = useState(false);
  const [restRemaining, setRestRemaining] = useState(90);
  const [restTotal, setRestTotal] = useState(90);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [autoStartRest, setAutoStartRest] = useState(false);
  const [vibrateOnComplete, setVibrateOnComplete] = useState(true);
  const [showRpe, setShowRpe] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [focusedInput, setFocusedInput] = useState<{ exIdx: number; setIdx: number; field: 'reps' | 'weight' } | null>(null);
  const [rpePickerTarget, setRpePickerTarget] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const vibrateRef = useRef(true);
  vibrateRef.current = vibrateOnComplete;

  const [prBannerText, setPrBannerText] = useState<string | null>(null);
  const prAnim = useRef(new Animated.Value(0)).current;
  const prTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [exerciseList, setExerciseList] = useState<{ id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string }[]>([]);
  const [recentExerciseNames, setRecentExerciseNames] = useState<string[]>([]);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);
  const [replacingExIndex, setReplacingExIndex] = useState<number | null>(null);

  // Which exercise's 3-dot menu is open
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  // Whether any drag is in progress (collapses all cards)
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setWorkoutOpen(true);
    return () => setWorkoutOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(REST_TIMER_KEY),
      AsyncStorage.getItem(AUTO_REST_KEY),
      AsyncStorage.getItem(VIBRATE_KEY),
      AsyncStorage.getItem(RPE_KEY),
    ]).then(([timerVal, autoRestVal, vibrateVal, rpeVal]) => {
      const n = timerVal ? parseInt(timerVal, 10) : NaN;
      if (!isNaN(n)) { setDefaultRest(n); setRestRemaining(n); setRestTotal(n); }
      if (autoRestVal !== null) setAutoStartRest(autoRestVal === 'true');
      if (vibrateVal !== null) setVibrateOnComplete(vibrateVal !== 'false');
      if (rpeVal !== null) setShowRpe(rpeVal === 'true');
    });
  }, []);

  // Restore from minimized session if no prefill
  useEffect(() => {
    if (!prefill && !editMode && session) {
      setWorkoutName(session.workoutName);
      setNotes(session.notes);
      setExercises(session.exercises as ExerciseEntry[]);
      setSelectedDate(session.selectedDate);
      baseRef.current = session.baseElapsed + Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      startRef.current = new Date();
      clearSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editMode) return;
    startRef.current = new Date();
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [editMode]);

  const resetTimer = () => {
    baseRef.current = 0;
    startRef.current = new Date();
    setElapsed(0);
  };

  const _runRestInterval = () => {
    restRef.current = setInterval(() => {
      setRestRemaining(prev => {
        if (prev <= 1) {
          clearInterval(restRef.current!);
          setRestActive(false);
          setRestPaused(false);
          if (vibrateRef.current) Vibration.vibrate([0, 300, 100, 300]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRest = async () => {
    if (restRef.current) clearInterval(restRef.current);
    const duration = defaultRest;
    setRestTotal(duration);
    setRestRemaining(duration);
    setRestActive(true);
    setRestPaused(false);
    _runRestInterval();
    const alertsOff = await AsyncStorage.getItem('rest_timer_alerts_enabled');
    if (alertsOff !== 'false') scheduleRestTimerAlert(duration);
  };

  const pauseRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    setRestPaused(true);
  };

  const resumeRest = () => {
    setRestPaused(false);
    _runRestInterval();
  };

  const stopRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    setRestActive(false);
    setRestPaused(false);
    cancelRestTimerAlert();
  };

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  useEffect(() => {
    if (editMode) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background') {
        const liveOff = await AsyncStorage.getItem('live_workout_notif_enabled');
        if (liveOff === 'false') return;
        const setsDone = exercises.flatMap(e => e.sets).filter(s => s.done).length;
        const setsTotal = exercises.flatMap(e => e.sets).length;
        const elapsedSecs = baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000);
        postLiveWorkoutNotification({
          workoutName: workoutName || 'Workout',
          elapsed: fmtElapsed(elapsedSecs),
          setsDone,
          setsTotal,
        });
      } else if (nextState === 'active') {
        cancelLiveWorkoutNotification();
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, workoutName, editMode]);

  const showPRBanner = (exerciseName: string) => {
    if (prTimerRef.current) clearTimeout(prTimerRef.current);
    setPrBannerText(exerciseName);
    prAnim.setValue(0);
    Animated.spring(prAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 }).start();
    prTimerRef.current = setTimeout(() => {
      Animated.timing(prAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setPrBannerText(null);
      });
    }, 3500);
  };

  useEffect(() => () => { if (prTimerRef.current) clearTimeout(prTimerRef.current); }, []);

  useEffect(() => { fetchExercises(); fetchRecentExercises(); }, []);

  useEffect(() => {
    if (prefill) {
      setWorkoutName(prefill.name);
      setNotes(prefill.notes);
      setExercises(
        prefill.exercises.map((ex: any) => ({
          uid: makeUid(),
          id: ex.id,
          name: ex.name,
          sets: ex.sets.map((s: any) => ({
            id: s.id,
            reps: String(s.reps ?? ''),
            weight: String(s.weight ?? ''),
            set_type: s.set_type ?? 'N',
            rpe: s.rpe != null ? String(s.rpe) : '',
          })),
        }))
      );
    } else if (!session) {
      setWorkoutName('');
      setNotes('');
      setExercises([]);
    }
  }, [prefill]);

  const fetchRecentExercises = async () => {
    try {
      const res = await apiFetch('/api/stats/recent-exercises');
      if (res.ok) setRecentExerciseNames((await res.json()).recent ?? []);
    } catch {}
  };

  const fetchExercises = async () => {
    try {
      const res = await apiFetch('/api/exercises');
      if (res.ok) setExerciseList(await res.json());
    } catch {}
  };

  const addNewExercise = async (name: string, muscle: string) => {
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle }),
      });
      const data = await res.json();
      if (res.ok) { fetchExercises(); Alert.alert('Success', 'Exercise added'); }
      else Alert.alert('Error', data.message || 'Please try again');
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  const weightDelta = weightUnit === 'kg' ? 2.5 : 5;

  const updateSetField = (exIndex: number, setIndex: number, field: EditableSetField, value: string) => {
    const updated = [...exercises];
    if (updated[exIndex].sets[setIndex].done) return;
    updated[exIndex].sets[setIndex][field] = value;
    setExercises(updated);
  };

  const adjustNumericField = (exIdx: number, setIdx: number, field: 'reps' | 'weight', delta: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, j) => {
          if (j !== setIdx || s.done) return s;
          const current = parseFloat(s[field] as string) || 0;
          const next = Math.max(0, current + delta);
          const formatted = field === 'reps' ? String(Math.round(next)) : String(parseFloat(next.toFixed(2)));
          return { ...s, [field]: formatted };
        }),
      };
    }));
  };

  const cycleSetType = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    const current = (updated[exIndex].sets[setIndex].set_type as SetType) ?? 'N';
    const next = SET_TYPES[(SET_TYPES.indexOf(current) + 1) % SET_TYPES.length];
    updated[exIndex].sets[setIndex].set_type = next;
    setExercises(updated);
  };

  const toggleSetDone = (exIndex: number, setIndex: number) => {
    const ex = exercises[exIndex];
    const set = ex.sets[setIndex];
    if (!set.done && (!set.reps.trim() || !set.weight.trim())) return;
    const nowDone = !set.done;
    const updated = [...exercises];
    updated[exIndex].sets[setIndex].done = nowDone;
    setExercises(updated);
    if (nowDone && autoStartRest) startRest();
    if (nowDone && ex.currentPR && ex.exercise_type !== 'cardio') {
      const w = parseFloat(set.weight);
      const r = parseFloat(set.reps);
      const e1rm = w * (1 + r / 30);
      const pr = ex.currentPR;
      const perWeightEntry = pr.per_weight_reps?.find(e => Math.abs(e.weight - w) < 0.01);
      const isNewRepsPR =
        !isNaN(r) && !isNaN(w) &&
        pr.per_weight_reps != null &&
        r > (perWeightEntry?.max_reps ?? 0);
      const isNewPR =
        (!isNaN(w) && pr.max_weight != null && w > pr.max_weight) ||
        (!isNaN(e1rm) && pr.estimated_1rm != null && e1rm > pr.estimated_1rm) ||
        isNewRepsPR;
      if (isNewPR) {
        showPRBanner(ex.name);
        // Advance currentPR so subsequent sets in the same session don't re-trigger
        setExercises(prev => prev.map((e, i) => {
          if (i !== exIndex) return e;
          const updatedPR = { ...e.currentPR! };
          if (!isNaN(w) && (updatedPR.max_weight == null || w > updatedPR.max_weight)) {
            updatedPR.max_weight = w;
          }
          if (!isNaN(e1rm) && (updatedPR.estimated_1rm == null || e1rm > updatedPR.estimated_1rm)) {
            updatedPR.estimated_1rm = e1rm;
          }
          if (isNewRepsPR && !isNaN(r) && !isNaN(w)) {
            const existing = updatedPR.per_weight_reps ?? [];
            const idx = existing.findIndex(e => Math.abs(e.weight - w) < 0.01);
            updatedPR.per_weight_reps = idx >= 0
              ? existing.map((e, j) => j === idx ? { ...e, max_reps: r } : e)
              : [...existing, { weight: w, max_reps: r }];
          }
          return { ...e, currentPR: updatedPR };
        }));
      }
    }
  };

  const addSetToExercise = (exIndex: number) => {
    const updated = [...exercises];
    const ex = updated[exIndex];
    if (ex.exercise_type === 'cardio') {
      updated[exIndex].sets.push({ reps: '', weight: '', set_type: 'N', cardio_duration: '', distance: '', distance_unit: 'km', intensity: '' });
    } else {
      updated[exIndex].sets.push({ reps: '', weight: '', set_type: 'N' });
    }
    setExercises(updated);
  };

  const deleteSet = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    updated[exIndex].sets.splice(setIndex, 1);
    setExercises(updated);
  };

  const deleteEx = (exIndex: number) => {
    setOpenMenuIdx(null);
    const updated = [...exercises];
    updated.splice(exIndex, 1);
    setExercises(updated);
  };

  const toggleExMenu = (exIndex: number) => {
    setOpenMenuIdx(prev => (prev === exIndex ? null : exIndex));
  };

  const openAddNotes = (exIndex: number) => {
    setOpenMenuIdx(null);
    setExercises(prev => prev.map((ex, i) =>
      i === exIndex && ex.notes === undefined ? { ...ex, notes: '' } : ex
    ));
  };

  const startReplaceExercise = (exIndex: number) => {
    setOpenMenuIdx(null);
    setReplacingExIndex(exIndex);
    setExerciseModalVisible(true);
  };

  const addExToWorkout = async (exercise: { id: number; name: string; equipment?: string; image_url?: string; exercise_type?: string }) => {
    const isCardio = exercise.exercise_type === 'cardio';
    const initialSet: WorkoutSet = isCardio
      ? { reps: '', weight: '', set_type: 'N', cardio_duration: '', distance: '', distance_unit: 'km', intensity: '' }
      : { reps: '', weight: '', set_type: 'N' };

    if (replacingExIndex !== null) {
      const targetIdx = replacingExIndex;
      setExercises(prev => prev.map((ex, i) =>
        i === targetIdx
          ? { uid: ex.uid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], equipment: exercise.equipment, image_url: exercise.image_url, sets: [initialSet] }
          : ex
      ));
      setReplacingExIndex(null);
      setExerciseModalVisible(false);

      // Fetch previous session + PR for the new exercise
      try {
        const lastSessionParams = new URLSearchParams({ name: exercise.name });
        if (exercise.id) lastSessionParams.set('exercise_template_id', String(exercise.id));
        const fetches: Promise<Response>[] = [
          apiFetch(`/api/stats/exercise/last-session?${lastSessionParams}`),
        ];
        if (exercise.id) {
          fetches.push(apiFetch(`/api/personal-records/${exercise.id}`));
        }
        const [lastRes, prRes] = await Promise.all(fetches);
        let prData: ExerciseEntry['currentPR'] | undefined;
        if (prRes?.ok) {
          const pr = await prRes.json();
          prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps };
        }
        if (lastRes.ok) {
          const data = await lastRes.json();
          setExercises(prev => prev.map((ex, i) => {
            if (i !== targetIdx || ex.name !== exercise.name) return ex;
            if (data.sets?.length > 0) {
              return {
                ...ex,
                sets: data.sets.map((s: any) => ({ reps: s.reps, weight: s.weight, set_type: s.set_type ?? 'N' })),
                previousSets: data.sets,
                currentPR: prData,
              };
            }
            return prData ? { ...ex, currentPR: prData } : ex;
          }));
        }
      } catch {}
      return;
    }

    const newUid = makeUid();
    setExercises(prev => [
      ...prev,
      { uid: newUid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], equipment: exercise.equipment, image_url: exercise.image_url, sets: [initialSet] },
    ]);
    setExerciseModalVisible(false);

    try {
      const lastSessionParams = new URLSearchParams({ name: exercise.name });
      if (exercise.id) lastSessionParams.set('exercise_template_id', String(exercise.id));
      const fetches: Promise<Response>[] = [
        apiFetch(`/api/stats/exercise/last-session?${lastSessionParams}`),
      ];
      if (exercise.id) {
        fetches.push(apiFetch(`/api/personal-records/${exercise.id}`));
      }
      const [lastRes, prRes] = await Promise.all(fetches);

      let prData: ExerciseEntry['currentPR'] | undefined;
      if (prRes?.ok) {
        const pr = await prRes.json();
        prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps };
      }

      if (lastRes.ok) {
        const data = await lastRes.json();
        if (data.sets?.length > 0) {
          setExercises(prev => {
            const idx = prev.findIndex(ex => ex.uid === newUid);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              sets: data.sets.map((s: any) => ({
                reps: s.reps, weight: s.weight, set_type: s.set_type ?? 'N',
              })),
              previousSets: data.sets,
              currentPR: prData,
            };
            return updated;
          });
        } else if (prData) {
          setExercises(prev => {
            const idx = prev.findIndex(ex => ex.uid === newUid);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], currentPR: prData };
            return updated;
          });
        }
      }
    } catch {}
  };

  const doSubmit = async (exercisesToSave: ExerciseEntry[]) => {
    const payload = {
      workoutName,
      notes,
      date: selectedDate.toISOString().split('T')[0],
      duration: editMode ? undefined : Math.floor(elapsed / 60),
      exercises: exercisesToSave.map((ex, exIndex) => ({
        id: ex.id,
        name: ex.name,
        exercise_template_id: ex.exercise_template_id,
        exercise_type: ex.exercise_type || 'strength',
        order: exIndex,
        sets: ex.sets.map((s, setIndex) => {
          if (ex.exercise_type === 'cardio') {
            return {
              id: s.id,
              order: setIndex,
              set_type: 'N',
              reps: null,
              weight: null,
              cardio_duration: Number(s.cardio_duration) || null,
              distance: Number(s.distance) || null,
              distance_unit: s.distance_unit || 'km',
              intensity: Number(s.intensity) || null,
            };
          }
          return {
            id: s.id,
            reps: Number(s.reps),
            weight: Number(s.weight),
            order: setIndex,
            set_type: s.set_type ?? 'N',
            rpe: s.rpe ? Number(s.rpe) : null,
          };
        }),
      })),
    };
    const isEditing = Boolean(editMode && workoutId);
    try {
      const res = await apiFetch(
        isEditing ? `/api/workouts/${workoutId}` : '/api/workouts',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message || 'Please try again'); return; }
      cancelLiveWorkoutNotification();
      clearSession();
      if (onSubmit) onSubmit(
        isEditing ? workoutId : data.id,
        isEditing ? undefined : {
          workoutName,
          prs: data.new_prs ?? [],
          totalVolume: data.total_volume ?? 0,
          totalReps: data.total_reps ?? 0,
          totalSets: data.total_sets ?? 0,
          muscles: data.muscles ?? [],
          isFirstWorkout: data.is_first_workout ?? false,
        }
      );
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  const submitWorkout = () => {
    const hasUnchecked = exercises.some(
      ex => (ex.exercise_type || 'strength') !== 'cardio' && ex.sets.some(s => !s.done)
    );
    if (hasUnchecked) {
      Alert.alert(
        'Unchecked Sets',
        "Some sets haven't been checked off yet. What would you like to do?",
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Save Anyway', onPress: () => doSubmit(exercises) },
          {
            text: 'Check Off & Save',
            onPress: () => {
              const allChecked = exercises.map(ex => ({
                ...ex,
                sets: ex.sets.map(s => ({ ...s, done: true })),
              }));
              doSubmit(allChecked);
            },
          },
        ]
      );
      return;
    }
    doSubmit(exercises);
  };

  const minimizeWorkout = () => {
    saveSession({
      workoutName,
      notes,
      exercises,
      selectedDate,
      startedAt: startRef.current,
      baseElapsed: baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000),
      editMode,
      workoutId,
    });
    onCancel?.();
  };

  const renderSetDeleteAction = (onDelete: () => void) => (
    <TouchableOpacity style={styles.swipeDelete} onPress={onDelete}>
      <Text style={styles.swipeDeleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const progress = restTotal > 0 ? restRemaining / restTotal : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {onCancel && !editMode ? (
            <TouchableOpacity onPress={minimizeWorkout} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : onCancel ? (
            <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : <View style={styles.headerBtn} />}
        </View>
        <Text style={styles.headerTitle}>{editMode ? 'Edit Workout' : 'Log Workout'}</Text>
        <TouchableOpacity onPress={submitWorkout} style={styles.headerBtn}>
          <Text style={styles.saveText}>{editMode ? 'Update' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ExerciseListModal
        visible={exerciseModalVisible}
        onClose={() => { setExerciseModalVisible(false); setReplacingExIndex(null); }}
        exercises={exerciseList}
        recentExerciseNames={recentExerciseNames}
        onSelect={addExToWorkout}
        onAddExercise={addNewExercise}
        muscleGroups={muscleGroups}
      />
      <NewExerciseForm
        visible={newExerciseFormVisible}
        onClose={() => setNewExerciseFormVisible(false)}
        onSave={(name, muscle) => { addNewExercise(name, muscle); setNewExerciseFormVisible(false); }}
        muscleGroups={muscleGroups}
      />

      <DraggableFlatList
        data={exercises}
        keyExtractor={(item) => item.uid}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => setOpenMenuIdx(null)}
        extraData={isDragging}
        ListHeaderComponent={!isDragging ? (
          <View style={styles.formSection}>
            <TextInput
              style={styles.titleInput}
              placeholder="Workout Name"
              placeholderTextColor={colors.placeholder}
              value={workoutName}
              onChangeText={setWorkoutName}
            />
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes..."
              placeholderTextColor={colors.placeholder}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {/* Date + Settings row */}
            <View style={styles.dateSettingsRow}>
              <TouchableOpacity style={styles.datePart} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.dateText}>
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSettingsExpanded(e => !e)} style={styles.settingsGearBtn} activeOpacity={0.7}>
                <Ionicons name="settings-outline" size={18} color={settingsExpanded ? colors.accent : colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <View style={{ backgroundColor: colors.surface, borderRadius: spacing.sm, overflow: 'hidden', marginBottom: spacing.sm }}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  themeVariant={mode === 'dark' ? 'dark' : 'light'}
                  textColor={colors.textPrimary}
                  accentColor={colors.accent}
                  onChange={(_event: any, date?: Date) => {
                    setShowDatePicker(false);
                    if (date) setSelectedDate(date);
                  }}
                />
              </View>
            )}

            {!editMode && (
              <View style={styles.timerCard}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.timerLabel}>Elapsed</Text>
                <Text style={styles.timerValue}>{fmtElapsed(elapsed)}</Text>
                <TouchableOpacity onPress={resetTimer} style={styles.timerResetBtn}>
                  <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.timerResetText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}

            {settingsExpanded && (
              <View style={styles.settingsPanel}>
                <View style={styles.settingsItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>Auto-start rest timer</Text>
                    <Text style={styles.settingsHint}>Start rest countdown when a set is checked off</Text>
                  </View>
                  <Switch
                    value={autoStartRest}
                    onValueChange={val => {
                      setAutoStartRest(val);
                      AsyncStorage.setItem(AUTO_REST_KEY, String(val));
                    }}
                    trackColor={{ false: colors.border, true: colors.save }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={styles.settingsItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>Vibrate when rest ends</Text>
                    <Text style={styles.settingsHint}>Vibrate the phone when the rest countdown completes</Text>
                  </View>
                  <Switch
                    value={vibrateOnComplete}
                    onValueChange={val => {
                      setVibrateOnComplete(val);
                      AsyncStorage.setItem(VIBRATE_KEY, String(val));
                    }}
                    trackColor={{ false: colors.border, true: colors.save }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={styles.settingsItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>Track RPE (1–10)</Text>
                    <Text style={styles.settingsHint}>Show an RPE input column on each strength set</Text>
                  </View>
                  <Switch
                    value={showRpe}
                    onValueChange={val => {
                      setShowRpe(val);
                      AsyncStorage.setItem(RPE_KEY, String(val));
                    }}
                    trackColor={{ false: colors.border, true: colors.save }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}

            {exercises.length > 0 && (() => {
              const totalVolume = exercises.reduce((sum, ex) =>
                sum + ex.sets.reduce((s, set) => {
                  const r = parseFloat(set.reps);
                  const w = parseFloat(set.weight);
                  return s + (isNaN(r) || isNaN(w) ? 0 : r * w);
                }, 0), 0);
              return (
                <View style={styles.summaryBar}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{exercises.length}</Text>
                    <Text style={styles.summaryLabel}>{exercises.length === 1 ? 'Exercise' : 'Exercises'}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{Math.round(totalVolume).toLocaleString()}</Text>
                    <Text style={styles.summaryLabel}>Total {weightUnit}</Text>
                  </View>
                </View>
              );
            })()}

            {exercises.length > 0 && <Text style={styles.sectionLabel}>Exercises</Text>}
          </View>
        ) : null}
        ListFooterComponent={!isDragging ? (
          <View style={styles.formSection}>
            <TouchableOpacity style={styles.addExBtn} onPress={() => setExerciseModalVisible(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.discardBtn}
              onPress={() => Alert.alert(
                'Discard Workout',
                'Are you sure you want to discard this workout?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => { clearSession(); onCancel?.(); } },
                ]
              )}
            >
              <Text style={[styles.discardBtnText, { color: colors.danger }]}>Discard Workout</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        onDragBegin={() => { setIsDragging(true); setOpenMenuIdx(null); }}
        onDragEnd={({ data }) => { setExercises(data); setIsDragging(false); }}
        renderItem={({ item: exercise, getIndex, drag, isActive }: RenderItemParams<ExerciseEntry>) => {
          const exIndex = getIndex() ?? 0;
          const collapsed = isDragging;
          return (
            <ScaleDecorator activeScale={1.02}>
            <View style={[styles.exerciseBlock, isActive && styles.exerciseBlockActive]}>

                  {/* Exercise header */}
                  <View style={styles.exHeaderRow}>
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.exDiagramBtn}>
                      {exercise.image_url ? (
                        <Image source={{ uri: exercise.image_url }} style={styles.exDiagram} resizeMode="cover" />
                      ) : (
                        <View style={[styles.exDiagram, styles.exDiagramPlaceholder]}>
                          <Ionicons name="barbell-outline" size={22} color={colors.textSecondary} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onLongPress={drag} delayLongPress={150} style={{ flex: 1 }}>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                      {!!exercise.equipment && (
                        <Text style={[styles.exerciseEquipment, { color: colors.textSecondary }]}>{exercise.equipment}</Text>
                      )}
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={startRest} style={styles.exIconBtn}>
                        <Ionicons name="timer-outline" size={20} color={colors.save} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => {
                          const { pageX, pageY } = e.nativeEvent;
                          const screenWidth = Dimensions.get('window').width;
                          setMenuPosition({ top: pageY + 12, right: screenWidth - pageX - 4 });
                          toggleExMenu(exIndex);
                        }}
                        style={styles.exIconBtn}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Inline exercise notes */}
                  {exercise.notes !== undefined && !collapsed && (
                    <TextInput
                      style={[styles.exNotesInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
                      placeholder="Exercise notes..."
                      placeholderTextColor={colors.placeholder}
                      value={exercise.notes}
                      onChangeText={val => setExercises(prev => prev.map((ex, i) =>
                        i === exIndex ? { ...ex, notes: val } : ex
                      ))}
                      multiline
                    />
                  )}

                  {!collapsed && (
                    <>
                      {exercise.exercise_type === 'cardio' ? (
                        // ── Cardio sets ──────────────────────────────────────
                        <>
                          {exercise.sets.map((set, setIndex) => (
                            <CardioSetRow
                              key={setIndex}
                              set={set}
                              setIndex={setIndex}
                              colors={colors}
                              styles={styles}
                              onChangeField={(field, value) => {
                                const updated = [...exercises];
                                (updated[exIndex].sets[setIndex] as any)[field] = value;
                                setExercises(updated);
                              }}
                              onDelete={() => deleteSet(exIndex, setIndex)}
                            />
                          ))}
                          <TouchableOpacity style={styles.addSetBtn} onPress={() => addSetToExercise(exIndex)}>
                            <Ionicons name="add" size={15} color={colors.save} />
                            <Text style={styles.addSetText}>Add Bout</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        // ── Strength sets ─────────────────────────────────────
                        <>
                          {/* Column headers */}
                          <View style={styles.setHeaderRow}>
                            <Text style={[styles.setHeaderCell, styles.colSetType]}>#</Text>
                            <Text style={[styles.setHeaderCell, styles.colPrev]}>Prev</Text>
                            <Text style={[styles.setHeaderCell, styles.colInput]}>Reps</Text>
                            <Text style={[styles.setHeaderCell, styles.colInput]}>{weightUnit}</Text>
                            {showRpe && <Text style={[styles.setHeaderCell, styles.colRpe]}>RPE</Text>}
                            <View style={styles.colCheck} />
                          </View>

                          {exercise.sets.map((set, setIndex) => {
                            const type = (set.set_type as SetType) ?? 'N';
                            const tc = SET_TYPE_COLORS[type];
                            const isDone = set.done ?? false;
                            const prev = exercise.previousSets?.[setIndex];
                            const prevText = prev ? `${prev.reps} x ${prev.weight}` : '—';
                            return (
                              <Swipeable
                                key={setIndex}
                                renderRightActions={() => renderSetDeleteAction(() => deleteSet(exIndex, setIndex))}
                              >
                                <View style={[styles.setRow, isDone && styles.setRowDone]}>
                                  <TouchableOpacity
                                    style={[styles.setTypeBadge, styles.colSetType, { borderColor: tc }]}
                                    onPress={() => !isDone && cycleSetType(exIndex, setIndex)}
                                  >
                                    <Text style={[styles.setTypeBadgeNum, { color: tc }]}>{setIndex + 1}</Text>
                                    {type !== 'N' && <Text style={[styles.setTypeBadgeLabel, { color: tc }]}>{type}</Text>}
                                  </TouchableOpacity>

                                  <Text style={[styles.prevCellText, styles.colPrev]}>{prevText}</Text>

                                  <TextInput
                                    style={[styles.setInput, styles.colInput, isDone && styles.setInputDone]}
                                    placeholder="—"
                                    placeholderTextColor={colors.placeholder}
                                    keyboardType="numeric"
                                    inputAccessoryViewID={Platform.OS === 'ios' ? NUMERIC_ACCESSORY_ID : undefined}
                                    editable={!isDone}
                                    value={set.reps}
                                    onChangeText={val => updateSetField(exIndex, setIndex, 'reps', val)}
                                    onFocus={() => setFocusedInput({ exIdx: exIndex, setIdx: setIndex, field: 'reps' })}
                                    onBlur={() => setFocusedInput(null)}
                                  />

                                  <TextInput
                                    style={[styles.setInput, styles.colInput, isDone && styles.setInputDone]}
                                    placeholder="—"
                                    placeholderTextColor={colors.placeholder}
                                    keyboardType="numeric"
                                    inputAccessoryViewID={Platform.OS === 'ios' ? NUMERIC_ACCESSORY_ID : undefined}
                                    editable={!isDone}
                                    value={set.weight}
                                    onChangeText={val => updateSetField(exIndex, setIndex, 'weight', val)}
                                    onFocus={() => setFocusedInput({ exIdx: exIndex, setIdx: setIndex, field: 'weight' })}
                                    onBlur={() => setFocusedInput(null)}
                                  />

                                  {showRpe && (
                                    <TouchableOpacity
                                      style={[styles.setInput, styles.colRpe, styles.rpeTouchable, isDone && styles.setInputDone]}
                                      onPress={() => !isDone && setRpePickerTarget({ exIdx: exIndex, setIdx: setIndex })}
                                      disabled={isDone}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={[styles.rpeValueText, !set.rpe && { color: colors.placeholder }]}>
                                        {set.rpe || '—'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}

                                  <TouchableOpacity
                                    style={[styles.colCheck, { alignItems: 'center' }]}
                                    onPress={() => toggleSetDone(exIndex, setIndex)}
                                  >
                                    <Ionicons
                                      name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                                      size={30}
                                      color={isDone ? colors.save : colors.textSecondary}
                                    />
                                  </TouchableOpacity>
                                </View>
                              </Swipeable>
                            );
                          })}

                          <TouchableOpacity style={styles.addSetBtn} onPress={() => addSetToExercise(exIndex)}>
                            <Ionicons name="add" size={15} color={colors.save} />
                            <Text style={styles.addSetText}>Add Set</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}
                </View>
            </ScaleDecorator>
            );
          }}
        />

      {/* Rest timer overlay */}
      {restActive && (
        <View style={styles.restOverlay}>
          <View style={styles.restBackdrop} />
          <View style={[styles.restModal, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.restCloseBtn} onPress={stopRest} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.restLabel, { color: colors.textSecondary }]}>Rest</Text>

            <View style={styles.restCircleContainer}>
              <Svg width={200} height={200} viewBox="0 0 200 200">
                <Circle
                  cx={100} cy={100} r={85}
                  stroke={colors.border}
                  strokeWidth={10}
                  fill="none"
                />
                <Circle
                  cx={100} cy={100} r={85}
                  stroke={restPaused ? colors.textSecondary : colors.accent}
                  strokeWidth={10}
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 85}`}
                  strokeDashoffset={`${2 * Math.PI * 85 * (1 - progress)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 100 100)"
                />
              </Svg>
              <View style={styles.restTimeCenter}>
                <Text style={[styles.restCountdown, { color: colors.textPrimary }]}>
                  {fmtCountdown(restRemaining)}
                </Text>
              </View>
            </View>

            <View style={styles.restControls}>
              <TouchableOpacity
                style={[styles.restAdjBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setRestRemaining(r => Math.max(5, r - 30))}
              >
                <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>−30s</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.restPauseBtn, { backgroundColor: colors.accent }]}
                onPress={restPaused ? resumeRest : pauseRest}
              >
                <Ionicons name={restPaused ? 'play' : 'pause'} size={26} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.restAdjBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setRestRemaining(r => r + 30)}
              >
                <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>+30s</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Exercise 3-dot menu — rendered as Modal so it floats above DraggableFlatList */}
      <Modal
        visible={openMenuIdx !== null}
        transparent
        animationType="none"
        onRequestClose={() => setOpenMenuIdx(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setOpenMenuIdx(null)}
        />
        {openMenuIdx !== null && (
          <View style={[styles.exMenu, { top: menuPosition.top, right: menuPosition.right, backgroundColor: colors.background, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.exMenuItem} onPress={() => openAddNotes(openMenuIdx!)}>
              <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Add Notes</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => {
              const idx = openMenuIdx;
              setOpenMenuIdx(null);
              onViewExerciseHistory?.(exercises[idx].name, exercises[idx].exercise_template_id);
            }}>
              <Ionicons name="bar-chart-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>View History</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => startReplaceExercise(openMenuIdx!)}>
              <Ionicons name="swap-horizontal-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Replace Exercise</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.exMenuItem, { opacity: 0.4 }]}>
              <Ionicons name="git-branch-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Superset</Text>
              <Text style={[styles.exMenuSoon, { color: colors.accent }]}>Soon</Text>
            </View>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => deleteEx(openMenuIdx!)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[styles.exMenuText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            {focusedInput && (
              <View style={styles.keyboardAdjRow}>
                <TouchableOpacity
                  style={styles.keyboardAdjBtn}
                  onPress={() => adjustNumericField(focusedInput.exIdx, focusedInput.setIdx, focusedInput.field, focusedInput.field === 'weight' ? -weightDelta : -1)}
                >
                  <Text style={styles.keyboardAdjText}>
                    {focusedInput.field === 'weight' ? `-${weightDelta}` : '−1 rep'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.keyboardAdjBtn}
                  onPress={() => adjustNumericField(focusedInput.exIdx, focusedInput.setIdx, focusedInput.field, focusedInput.field === 'weight' ? weightDelta : 1)}
                >
                  <Text style={styles.keyboardAdjText}>
                    {focusedInput.field === 'weight' ? `+${weightDelta}` : '+1 rep'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.keyboardDismissBtn}>
              <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {Platform.OS === 'android' && focusedInput && (
        <View style={[styles.keyboardAccessory, styles.androidKeyboardBar]}>
          <View style={styles.keyboardAdjRow}>
            <TouchableOpacity
              style={styles.keyboardAdjBtn}
              onPress={() => adjustNumericField(focusedInput.exIdx, focusedInput.setIdx, focusedInput.field, focusedInput.field === 'weight' ? -weightDelta : -1)}
            >
              <Text style={styles.keyboardAdjText}>
                {focusedInput.field === 'weight' ? `-${weightDelta}` : '−1 rep'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.keyboardAdjBtn}
              onPress={() => adjustNumericField(focusedInput.exIdx, focusedInput.setIdx, focusedInput.field, focusedInput.field === 'weight' ? weightDelta : 1)}
            >
              <Text style={styles.keyboardAdjText}>
                {focusedInput.field === 'weight' ? `+${weightDelta}` : '+1 rep'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.keyboardDismissBtn}>
            <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* RPE Picker Modal */}
      <Modal
        visible={rpePickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRpePickerTarget(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setRpePickerTarget(null)}
        />
        <View style={[styles.rpeModal, { backgroundColor: colors.surface }]}>
          <View style={[styles.rpeModalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.rpeModalHeader}>
            <Text style={[styles.rpeModalTitle, { color: colors.textPrimary }]}>Rate of Perceived Exertion</Text>
            <TouchableOpacity onPress={() => setRpePickerTarget(null)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rpeScroll}
          >
            {RPE_LABELS.map(({ value, desc }) => {
              const currentRpe = rpePickerTarget
                ? exercises[rpePickerTarget.exIdx]?.sets[rpePickerTarget.setIdx]?.rpe
                : undefined;
              const selected = currentRpe === String(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.rpeItem,
                    { borderColor: colors.border },
                    selected && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => {
                    if (!rpePickerTarget) return;
                    setExercises(prev => prev.map((ex, i) => {
                      if (i !== rpePickerTarget.exIdx) return ex;
                      return {
                        ...ex,
                        sets: ex.sets.map((s, j) =>
                          j === rpePickerTarget.setIdx ? { ...s, rpe: String(value) } : s
                        ),
                      };
                    }));
                    setRpePickerTarget(null);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.rpeItemNum, { color: selected ? '#fff' : colors.textPrimary }]}>
                    {value}
                  </Text>
                  <Text style={[styles.rpeItemDesc, { color: selected ? 'rgba(255,255,255,0.85)' : colors.textSecondary }]}>
                    {desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* PR banner — slides down from top, auto-dismisses */}
      {prBannerText && (
        <Animated.View
          style={[
            styles.prBanner,
            {
              top: insets.top + 8,
              opacity: prAnim,
              transform: [{ translateY: prAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="trophy" size={22} color="#FFD700" />
          <View style={styles.prBannerText}>
            <Text style={styles.prBannerTitle}>Personal Record!</Text>
            <Text style={styles.prBannerExercise} numberOfLines={1}>{prBannerText}</Text>
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── CardioSetRow ─────────────────────────────────────────────────────────────

type CardioSetRowProps = {
  set: WorkoutSet;
  setIndex: number;
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
  onChangeField: (field: string, value: string) => void;
  onDelete: () => void;
};

function CardioSetRow({ set, setIndex, colors, styles, onChangeField, onDelete }: CardioSetRowProps) {
  const [running, setRunning] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const fmtWatch = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startWatch = () => {
    startRef.current = Date.now() - elapsedSecs * 1000;
    timerRef.current = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    setRunning(true);
  };

  const stopWatch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    onChangeField('cardio_duration', (elapsedSecs / 60).toFixed(2));
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <Swipeable renderRightActions={() => (
      <TouchableOpacity style={styles.swipeDelete} onPress={onDelete}>
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </TouchableOpacity>
    )}>
      <View style={styles.cardioSetBlock}>
        <Text style={[styles.setTypeBadgeNum, { color: colors.textSecondary, width: 20, textAlign: 'center' }]}>
          {setIndex + 1}
        </Text>
        <View style={{ flex: 1, gap: 6 }}>
          {/* Row 1: Duration + stopwatch */}
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="min"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={running ? fmtWatch(elapsedSecs) : (set.cardio_duration || '')}
              onChangeText={val => !running && onChangeField('cardio_duration', val)}
              editable={!running}
            />
            <TouchableOpacity
              style={[styles.cardioTimerBtn, { borderColor: running ? colors.danger : colors.save }]}
              onPress={running ? stopWatch : startWatch}
            >
              <Ionicons
                name={running ? 'stop' : 'play'}
                size={14}
                color={running ? colors.danger : colors.save}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: running ? colors.danger : colors.save }}>
                {running ? fmtWatch(elapsedSecs) : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Row 2: Distance + unit toggle + pace */}
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="dist"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={set.distance || ''}
              onChangeText={val => onChangeField('distance', val)}
            />
            <View style={styles.cardioUnitToggle}>
              {['km', 'mi'].map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.cardioUnitBtn, (set.distance_unit || 'km') === u && { backgroundColor: colors.accent }]}
                  onPress={() => onChangeField('distance_unit', u)}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: (set.distance_unit || 'km') === u ? '#fff' : colors.textSecondary }}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.setInput, { width: 64 }]}
              placeholder="pace"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={set.intensity || ''}
              onChangeText={val => onChangeField('intensity', val)}
            />
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { paddingBottom: spacing.xl * 2 },
  formSection: { paddingHorizontal: spacing.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 60 },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  saveText: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.save, textAlign: 'right' },

  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    marginBottom: 2,
  },
  notesInput: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    minHeight: 32,
  },

  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  timerLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, flex: 1 },
  timerValue: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  timerResetText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  dateSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingsGearBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  addExBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.md },

  discardBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  discardBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },

  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  exerciseBlock: {
    backgroundColor: colors.surface,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'visible',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  exerciseBlockActive: {
    backgroundColor: colors.surface,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'visible',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    opacity: 0.9,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  exHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  exDiagramBtn: {
    marginRight: spacing.sm,
  },
  exDiagram: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: spacing.sm,
  },
  exDiagramPlaceholder: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  exerciseEquipment: { fontSize: typography.fontSize.sm, marginTop: 1 },
  exIconBtn: { padding: 4 },

  // Exercise 3-dot popup menu
  exMenu: {
    position: 'absolute',
    width: 180,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  exMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  exMenuText: { fontSize: 14, fontWeight: '500', flex: 1 },
  exMenuSoon: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  exMenuDivider: { height: 1, marginHorizontal: 0 },

  exNotesInput: {
    borderWidth: 1,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    minHeight: 36,
  },

  colSetType: { width: 40 },
  colPrev: { flex: 1 },
  colInput: { flex: 1, marginHorizontal: 4 },
  colRpe: { width: 44, marginHorizontal: 4, textAlign: 'center' },
  colCheck: { width: 48 },

  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: spacing.xs,
  },
  setRowDone: { backgroundColor: 'rgba(52,199,89,0.08)' },

  setTypeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  setTypeBadgeNum: { fontSize: 12, fontWeight: '700', lineHeight: 14 },
  setTypeBadgeLabel: { fontSize: 10, fontWeight: '600', lineHeight: 12 },

  prevCellText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginHorizontal: 4,
  },

  setInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    height: 44,
  },
  setInputDone: { opacity: 0.5 },

  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addSetText: { fontSize: typography.fontSize.sm, color: colors.save, fontWeight: '600' },

  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  swipeDeleteText: { color: '#fff', fontWeight: '700' },

  restOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  restModal: {
    borderRadius: 24,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    width: 280,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  restCloseBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  restLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  restCircleContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  restTimeCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restCountdown: {
    fontSize: 48,
    fontWeight: '700',
  },
  restControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restAdjBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restAdjText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },

  keyboardAccessory: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  androidKeyboardBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  keyboardAdjRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keyboardAdjBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyboardAdjText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  keyboardDismissBtn: { padding: spacing.xs },

  rpeTouchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeValueText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  rpeModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl * 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  rpeModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  rpeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rpeModalTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
  },
  rpeScroll: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rpeItem: {
    width: 110,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  rpeItemNum: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  rpeItemDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },

  prBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: '#FFD700',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 10,
    zIndex: 100,
  },
  prBannerText: { flex: 1 },
  prBannerTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 0.4,
  },
  prBannerExercise: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: '#fff',
    marginTop: 1,
  },

  settingsPanel: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingsHint: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  cardioSetBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  cardioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardioTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 44,
  },
  cardioUnitToggle: {
    flexDirection: 'row',
    borderRadius: spacing.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardioUnitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
});
