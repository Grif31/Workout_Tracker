import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, TouchableOpacity,
  Platform, Vibration, ScrollView,
  Keyboard, Modal, Dimensions,
  Animated, AppState, FlatList,
} from 'react-native';
import {
  scheduleRestTimerAlert,
  cancelRestTimerAlert,
  postLiveWorkoutNotification,
  cancelLiveWorkoutNotification,
} from '../utils/notifications';
import NetInfo from '@react-native-community/netinfo';
import { enqueueWorkout } from '../utils/offlineQueue';
import { getExerciseCache, setExerciseCache } from '../utils/exerciseCache';
import { showToast } from '../utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import ExerciseListModal from '../components/ExerciseList';
import NewExerciseForm from '../components/NewExerciseForm';
import { PrefillWorkoutData } from './WorkoutDetails';
import { muscleGroups } from 'constants/muscleGroups';
import { useWorkoutSession } from '../context/WorkoutSessionContext';

import {
  REST_TIMER_KEY,
  AUTO_REST_KEY,
  VIBRATE_KEY,
  RPE_KEY,
  RPE_LABELS,
  SET_TYPES,
  type SetType,
  type WorkoutSet,
  type ExerciseEntry,
  makeUid,
  fmtElapsed,
  isBodyweight,
} from './workout/types';
import WorkoutHeader from './workout/WorkoutHeader';
import ExerciseBlock from './workout/ExerciseBlock';
import RestTimer from './workout/RestTimer';
import PlateCalculatorModal from './PlateCalculatorModal';
import { syncWorkoutToHealthKit } from '../utils/healthKit';
import { syncWorkoutToHealthConnect } from '../utils/healthConnect';

type EditableSetField = 'reps' | 'weight';

type Props = {
  prefill?: PrefillWorkoutData;
  editMode?: boolean;
  workoutId?: number;
  onSubmit?: (workoutId?: number, summary?: { workoutName: string; prs: any[]; totalVolume: number; totalReps: number; totalSets: number; muscles: string[]; isFirstWorkout: boolean }) => void;
  onCancel?: () => void;
  onViewExerciseHistory?: (exerciseName: string, exerciseTemplateId?: number) => void;
};

export default function WorkoutLog({ prefill, editMode, workoutId, onSubmit, onCancel, onViewExerciseHistory }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SET_TYPE_COLORS = useMemo<Record<SetType, string>>(() => ({
    N: colors.textSecondary,
    W: colors.warmup,
    D: colors.dropset,
    F: colors.danger,
  }), [colors]);
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const insets = useSafeAreaInsets();
  const { session, saveSession, clearSession, setWorkoutOpen } = useWorkoutSession();

  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const activeMuscles = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ex of exercises) {
      if (!ex.muscle_group) continue;
      for (const m of ex.muscle_group.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!seen.has(m)) { seen.add(m); out.push(m); }
      }
    }
    return out;
  }, [exercises]);
  const [autoFocusNoteIdx, setAutoFocusNoteIdx] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [elapsed, setElapsed] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  // startRef = wall-clock moment the current segment began; baseRef = seconds accumulated before this segment.
  // elapsed = baseRef + (now - startRef), so the timer survives minimize/resume without resetting.
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
  const [showPlateCalc, setShowPlateCalc] = useState(true);
  const [focusedInput, setFocusedInput] = useState<{ exIdx: number; setIdx: number; field: 'reps' | 'weight' } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // How far the keyboard overlaps THIS view (screen coords) — the toolbar's `bottom`
  const [kbOverlap, setKbOverlap] = useState(0);
  const rootViewRef = useRef<View>(null);
  const rootBottomRef = useRef(0);
  const [rpePickerTarget, setRpePickerTarget]     = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [plateCalcTarget, setPlateCalcTarget]     = useState<{ exIdx: number; setIdx: number } | null>(null);
  // Keep refs in sync with state so AppState/setInterval closures always read current values.
  const vibrateRef = useRef(true);
  vibrateRef.current = vibrateOnComplete;
  const timerPausedRef = useRef(false);
  timerPausedRef.current = timerPaused;

  const [prBanner, setPrBanner] = useState<{ name: string; type: string } | null>(null);
  const prAnim = useRef(new Animated.Value(0)).current;
  const prTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputFocusedRef = useRef(false);

  const [exerciseList, setExerciseList] = useState<{ id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string }[]>([]);
  const [recentExercises, setRecentExercises] = useState<{ name: string; exercise_template_id: number | null }[]>([]);
  const [templates, setTemplates] = useState<{ id: number; name: string; exercises: { id: number; name: string; equipment?: string; image_url?: string; exercise_type?: string }[] }[]>([]);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);
  const [replacingExIndex, setReplacingExIndex] = useState<number | null>(null);

  // Which exercise's 3-dot menu is open
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    setWorkoutOpen(true);
    return () => {
      setWorkoutOpen(false);
      AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(REST_TIMER_KEY),
      AsyncStorage.getItem(AUTO_REST_KEY),
      AsyncStorage.getItem(VIBRATE_KEY),
      AsyncStorage.getItem(RPE_KEY),
      AsyncStorage.getItem('workout_show_plate_calc'),
    ]).then(([timerVal, autoRestVal, vibrateVal, rpeVal, plateCalcVal]) => {
      const n = timerVal ? parseInt(timerVal, 10) : NaN;
      if (!isNaN(n)) { setDefaultRest(n); setRestRemaining(n); setRestTotal(n); }
      if (autoRestVal !== null) setAutoStartRest(autoRestVal === 'true');
      if (vibrateVal !== null) setVibrateOnComplete(vibrateVal !== 'false');
      if (rpeVal !== null) setShowRpe(rpeVal === 'true');
      if (plateCalcVal !== null) setShowPlateCalc(plateCalcVal !== 'false');
    });
  }, []);

  const TIMER_CHECKPOINT_KEY = '@workout_timer_checkpoint';
  const WORKOUT_BACKUP_KEY   = '@workout_open_backup';

  // Keep refs in sync so the AppState closure always reads current values.
  const notesRef        = useRef(notes);
  notesRef.current      = notes;
  const selectedDateRef        = useRef(selectedDate);
  selectedDateRef.current      = selectedDate;

  const restoreTimerCheckpoint = async () => {
    try {
      const raw = await AsyncStorage.getItem(TIMER_CHECKPOINT_KEY);
      if (!raw) return;
      const cp = JSON.parse(raw) as { base: number; savedAt: number; paused: boolean };
      if (cp.paused) {
        baseRef.current = cp.base;
        setTimerPaused(true);
      } else {
        baseRef.current = cp.base + Math.floor((Date.now() - cp.savedAt) / 1000);
        startRef.current = new Date();
      }
      await AsyncStorage.removeItem(TIMER_CHECKPOINT_KEY);
    } catch {}
  };

  // Restore from minimized session if no prefill
  useEffect(() => {
    if (!prefill && !editMode && session) {
      setWorkoutName(session.workoutName);
      setNotes(session.notes);
      setExercises(session.exercises as ExerciseEntry[]);
      setSelectedDate(session.selectedDate);
      // Add the time that passed while minimized to baseRef so the timer continues from where it left off.
      baseRef.current = session.baseElapsed + Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      startRef.current = new Date();
      clearSession();
      AsyncStorage.removeItem(TIMER_CHECKPOINT_KEY);
      AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
    } else if (!prefill && !editMode && !session) {
      // App may have been killed while workout was open without minimizing.
      // Restore both the exercises backup and the timer checkpoint.
      (async () => {
        const raw = await AsyncStorage.getItem(WORKOUT_BACKUP_KEY);
        if (raw) {
          try {
            const backup = JSON.parse(raw);
            setWorkoutName(backup.workoutName ?? '');
            setNotes(backup.notes ?? '');
            setExercises((backup.exercises as ExerciseEntry[]) ?? []);
            const d = new Date(backup.selectedDate);
            if (!isNaN(d.getTime())) setSelectedDate(d);
          } catch {}
          await AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
        }
        restoreTimerCheckpoint();
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // iOS gets the will-events so the bar appears before the keyboard
    // finishes animating; Android only emits the did-events.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, e => {
      if (Platform.OS === 'ios') {
        // Pure screen-coordinate math: keyboard top vs this view's bottom.
        // Independent of navigators, tab bars, or KeyboardAvoidingView quirks.
        setKbOverlap(Math.max(0, rootBottomRef.current - e.endCoordinates.screenY));
      }
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      // Delay so onFocus on the next input can fire first when switching inputs.
      // If an input gained focus within this window, inputFocusedRef will be true and we skip the clear.
      setTimeout(() => {
        if (!inputFocusedRef.current) setFocusedInput(null);
      }, 50);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (editMode || timerPaused) return;
    startRef.current = new Date();
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [editMode, timerPaused]);

  const resetTimer = () => {
    baseRef.current = 0;
    startRef.current = new Date();
    setTimerPaused(false);
    setElapsed(0);
  };

  const toggleTimer = () => {
    if (timerPaused) {
      setTimerPaused(false);
    } else {
      baseRef.current = elapsed;
      setTimerPaused(true);
    }
  };

  // Separated from startRest so resumeRest can restart the tick without resetting restRemaining.
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
        // Persist timer so it survives app suspension or kill without minimize.
        const elapsedSecs = timerPausedRef.current
          ? baseRef.current
          : baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000);
        await AsyncStorage.setItem(TIMER_CHECKPOINT_KEY, JSON.stringify({
          base: elapsedSecs,
          savedAt: Date.now(),
          paused: timerPausedRef.current,
        }));

        // Save full workout state in case iOS kills the app while it's backgrounded.
        // On a normal foreground return this is cleared in the 'active' handler below.
        await AsyncStorage.setItem(WORKOUT_BACKUP_KEY, JSON.stringify({
          workoutName,
          notes: notesRef.current,
          exercises,
          selectedDate: selectedDateRef.current.toISOString(),
        }));

        const liveOff = await AsyncStorage.getItem('live_workout_notif_enabled');
        if (liveOff === 'false') return;
        const setsDone = exercises.flatMap(e => e.sets).filter(s => s.done).length;
        const setsTotal = exercises.flatMap(e => e.sets).length;
        const currentExercise = (
          exercises.find(e => e.sets.some(s => !s.done)) ?? exercises[exercises.length - 1]
        )?.name;
        postLiveWorkoutNotification({
          workoutName: workoutName || 'Workout',
          elapsed: fmtElapsed(elapsedSecs),
          setsDone,
          setsTotal,
          currentExercise,
        });
      } else if (nextState === 'active') {
        cancelLiveWorkoutNotification();
        // App resumed from background — update timer refs from checkpoint if JS was suspended.
        await restoreTimerCheckpoint();
        // Exercises are still in memory; discard the insurance backup.
        await AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, workoutName, editMode]);

  const showPRBanner = (exerciseName: string, prType: string) => {
    if (prTimerRef.current) clearTimeout(prTimerRef.current);
    setPrBanner({ name: exerciseName, type: prType });
    prAnim.setValue(0);
    Animated.spring(prAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 }).start();
    prTimerRef.current = setTimeout(() => {
      Animated.timing(prAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setPrBanner(null);
      });
    }, 3500);
  };

  useEffect(() => () => { if (prTimerRef.current) clearTimeout(prTimerRef.current); }, []);

  useEffect(() => { fetchExercises(); fetchRecentExercises(); fetchTemplates(); }, []);

  useEffect(() => {
    if (prefill) {
      setWorkoutName(prefill.name);
      setNotes(prefill.notes);
      // Keep the workout's original date when editing (defaults to today otherwise)
      if (prefill.date) {
        const d = new Date(prefill.date);
        if (!isNaN(d.getTime())) setSelectedDate(d);
      }
      const initialExercises = prefill.exercises.map((ex: any) => ({
        uid: makeUid(),
        id: ex.id,
        exercise_template_id: ex.exercise_template_id,
        exercise_type: ex.exercise_type,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        notes: ex.notes ?? undefined,
        sets: ex.sets.map((s: any) => ({
          id: s.id,
          reps: String(s.reps ?? ''),
          weight: isBodyweight(ex) ? '0' : String(s.weight ?? ''),
          set_type: s.set_type ?? 'N',
          rpe: s.rpe != null ? String(s.rpe) : '',
          cardio_duration: s.cardio_duration != null ? String(s.cardio_duration) : '',
          distance: s.distance != null ? String(s.distance) : '',
          distance_unit: s.distance_unit ?? 'km',
          intensity: s.intensity != null ? String(s.intensity) : '',
        })),
      }));
      setExercises(initialExercises);

      if (!editMode) {
        (async () => {
          const enriched = [...initialExercises];
          await Promise.all(
            initialExercises.map(async (ex, idx) => {
              try {
                const params = new URLSearchParams({ name: ex.name });
                if (ex.exercise_template_id) params.set('exercise_template_id', String(ex.exercise_template_id));
                const fetches: Promise<Response>[] = [apiFetch(`/api/stats/exercise/last-session?${params}`)];
                if (ex.exercise_template_id) fetches.push(apiFetch(`/api/personal-records/${ex.exercise_template_id}`));
                const [lastRes, prRes] = await Promise.all(fetches);
                let prData: ExerciseEntry['currentPR'] | undefined;
                if (prRes?.ok) {
                  const pr = await prRes.json();
                  prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps };
                }
                if (lastRes.ok) {
                  const data = await lastRes.json();
                  if (data.sets?.length > 0) {
                    enriched[idx] = {
                      ...enriched[idx],
                      sets: data.sets.map((s: any) => ({ reps: String(s.reps ?? ''), weight: isBodyweight(ex) ? '0' : String(s.weight ?? ''), set_type: s.set_type ?? 'N' })),
                      previousSets: data.sets,
                      currentPR: prData,
                    };
                  } else if (prData) {
                    enriched[idx] = { ...enriched[idx], currentPR: prData };
                  }
                }
              } catch {}
            })
          );
          setExercises([...enriched]);
        })();
      }
    } else if (!session) {
      setWorkoutName('');
      setNotes('');
      setExercises([]);
    }
  }, [prefill]);

  const fetchRecentExercises = async () => {
    try {
      const res = await apiFetch('/api/stats/recent-exercises');
      if (res.ok) setRecentExercises((await res.json()).recent ?? []);
    } catch {}
  };

  const fetchExercises = async () => {
    try {
      const res = await apiFetch('/api/exercises');
      if (res.ok) {
        const data = await res.json();
        setExerciseList(data);
        setExerciseCache(data);
      }
    } catch {
      const cached = await getExerciseCache();
      if (cached) setExerciseList(cached as typeof exerciseList);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (res.ok) setTemplates(await res.json());
    } catch {}
  };

  const addNewExercise = async (name: string, muscle: string, equipment: string) => {
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle, equipment }),
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
    if (!set.done && (!set.reps.trim() || (!isBodyweight(ex) && !set.weight.trim()))) return;
    const nowDone = !set.done;
    const updated = [...exercises];
    updated[exIndex].sets[setIndex].done = nowDone;
    setExercises(updated);
    if (nowDone && autoStartRest && set.set_type !== 'W') startRest();
    if (nowDone && ex.currentPR && ex.exercise_type !== 'cardio') {
      const w = parseFloat(set.weight);
      const r = parseFloat(set.reps);
      const e1rm = r <= 15 ? w * (1 + r / 30) : 0;
      const pr = ex.currentPR;
      const perWeightEntry = pr.per_weight_reps?.find(e => Math.abs(e.weight - w) < 0.01);
      const isNewRepsPR =
        !isNaN(r) && !isNaN(w) &&
        pr.per_weight_reps != null &&
        r > (perWeightEntry?.max_reps ?? 0);
      const isNewPR =
        (!isNaN(w) && pr.max_weight != null && w > pr.max_weight) ||
        (r <= 15 && e1rm > 0 && pr.estimated_1rm != null && e1rm > pr.estimated_1rm) ||
        isNewRepsPR;
      if (isNewPR) {
        const prType = (!isNaN(w) && pr.max_weight != null && w > pr.max_weight)
          ? 'Max Weight'
          : isNewRepsPR
            ? 'Most Reps at Weight'
            : 'New Strength Record';
        showPRBanner(ex.name, prType);
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
      updated[exIndex].sets.push({ reps: '', weight: isBodyweight(ex) ? '0' : '', set_type: 'N' });
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

  const moveExercise = (exIndex: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? exIndex - 1 : exIndex + 1;
    setExercises(prev => {
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[exIndex], next[swapIdx]] = [next[swapIdx], next[exIndex]];
      return next;
    });
    setOpenMenuIdx(null);
  };

  const toggleExMenu = (exIndex: number) => {
    setOpenMenuIdx(prev => (prev === exIndex ? null : exIndex));
  };

  const openAddNotes = (exIndex: number) => {
    setOpenMenuIdx(null);
    setAutoFocusNoteIdx(exIndex);
    setExercises(prev => prev.map((ex, i) =>
      i === exIndex && ex.notes === undefined ? { ...ex, notes: '' } : ex
    ));
  };

  const startReplaceExercise = (exIndex: number) => {
    setOpenMenuIdx(null);
    setReplacingExIndex(exIndex);
    setExerciseModalVisible(true);
  };

  const addExToWorkout = async (exercise: { id: number; name: string; muscle_group?: string; equipment?: string; image_url?: string; exercise_type?: string }) => {
    const isCardio = exercise.exercise_type === 'cardio';
    const bw = isBodyweight(exercise);
    const initialSet: WorkoutSet = isCardio
      ? { reps: '', weight: '', set_type: 'N', cardio_duration: '', distance: '', distance_unit: 'km', intensity: '' }
      : { reps: '', weight: bw ? '0' : '', set_type: 'N' };

    if (replacingExIndex !== null) {
      const targetIdx = replacingExIndex;
      setExercises(prev => prev.map((ex, i) =>
        i === targetIdx
          ? { uid: ex.uid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], muscle_group: exercise.muscle_group, equipment: exercise.equipment, image_url: exercise.image_url, sets: [initialSet] }
          : ex
      ));
      setReplacingExIndex(null);
      setExerciseModalVisible(false);

      // Fetch previous session + PR for the replacement exercise after state settles.
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
                sets: data.sets.map((s: any) => ({ reps: String(s.reps ?? ''), weight: bw ? '0' : String(s.weight ?? ''), set_type: s.set_type ?? 'N' })),
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
      { uid: newUid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], muscle_group: exercise.muscle_group, equipment: exercise.equipment, image_url: exercise.image_url, sets: [initialSet] },
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
                reps: String(s.reps ?? ''), weight: bw ? '0' : String(s.weight ?? ''), set_type: s.set_type ?? 'N',
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

  const applyTemplate = async (template: typeof templates[0]) => {
    setWorkoutName(template.name);
    const newExercises: ExerciseEntry[] = template.exercises.map(ex => {
      const isCardio = ex.exercise_type === 'cardio';
      const initialSet: WorkoutSet = isCardio
        ? { reps: '', weight: '', set_type: 'N', cardio_duration: '', distance: '', distance_unit: 'km', intensity: '' }
        : { reps: '', weight: isBodyweight(ex) ? '0' : '', set_type: 'N' };
      return {
        uid: makeUid(),
        name: ex.name,
        exercise_template_id: ex.id,
        exercise_type: ex.exercise_type as ExerciseEntry['exercise_type'],
        equipment: ex.equipment,
        image_url: ex.image_url,
        sets: [initialSet],
      };
    });
    setExercises(newExercises);

    // Enrich with previous sets + PRs in parallel
    const enriched = [...newExercises];
    await Promise.all(
      newExercises.map(async (ex, idx) => {
        try {
          const params = new URLSearchParams({ name: ex.name });
          if (ex.exercise_template_id) params.set('exercise_template_id', String(ex.exercise_template_id));
          const fetches: Promise<Response>[] = [apiFetch(`/api/stats/exercise/last-session?${params}`)];
          if (ex.exercise_template_id) fetches.push(apiFetch(`/api/personal-records/${ex.exercise_template_id}`));
          const [lastRes, prRes] = await Promise.all(fetches);
          let prData: ExerciseEntry['currentPR'] | undefined;
          if (prRes?.ok) {
            const pr = await prRes.json();
            prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps };
          }
          if (lastRes.ok) {
            const data = await lastRes.json();
            if (data.sets?.length > 0) {
              enriched[idx] = {
                ...enriched[idx],
                sets: data.sets.map((s: any) => ({ reps: String(s.reps ?? ''), weight: isBodyweight(ex) ? '0' : String(s.weight ?? ''), set_type: s.set_type ?? 'N' })),
                previousSets: data.sets,
                currentPR: prData,
              };
            } else if (prData) {
              enriched[idx] = { ...enriched[idx], currentPR: prData };
            }
          }
        } catch {}
      })
    );
    setExercises([...enriched]);
  };

  const buildPayload = (exercisesToSave: ExerciseEntry[]) => ({
    workoutName,
    notes,
    date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
    duration: editMode ? undefined : Math.floor(elapsed / 60),
    exercises: exercisesToSave.map((ex, exIndex) => ({
      id: ex.id,
      name: ex.name,
      exercise_template_id: ex.exercise_template_id,
      exercise_type: ex.exercise_type || 'strength',
      notes: ex.notes ?? null,
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
          weight: isBodyweight(ex) ? 0 : Number(s.weight),
          order: setIndex,
          set_type: s.set_type ?? 'N',
          rpe: s.rpe ? Number(s.rpe) : null,
        };
      }),
    })),
  });

  const doSubmit = async (exercisesToSave: ExerciseEntry[]) => {
    const payload = buildPayload(exercisesToSave);
    const isEditing = Boolean(editMode && workoutId);

    // Offline path: only applies to new workouts, not edits
    if (!isEditing) {
      const net = await NetInfo.fetch();
      const online = net.isConnected && net.isInternetReachable !== false;
      if (!online) {
        await enqueueWorkout(payload);
        cancelLiveWorkoutNotification();
        clearSession();
        AsyncStorage.removeItem(TIMER_CHECKPOINT_KEY);
        AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
        showToast('Saved offline — will sync when connected');
        onCancel?.();
        return;
      }
    }

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
      AsyncStorage.removeItem(TIMER_CHECKPOINT_KEY);
      AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - elapsed * 1000);
      const workoutType = exercisesToSave.some(ex => (ex.exercise_type || 'strength') !== 'cardio') ? 'strength' : 'cardio';
      if (Platform.OS === 'ios') {
        syncWorkoutToHealthKit({ type: workoutType, startDate, endDate });
      } else if (Platform.OS === 'android') {
        syncWorkoutToHealthConnect({ type: workoutType, startDate, endDate });
      }
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
    if (!workoutName.trim()) {
      Alert.alert('Workout Name Required', 'Please add a name for your workout before saving.');
      return;
    }
    const hasUnchecked = exercises.some(
      ex => (ex.exercise_type || 'strength') !== 'cardio' && ex.sets.some(s => !s.done)
    );
    if (hasUnchecked) {
      Alert.alert(
        'Unchecked Sets',
        "Some sets haven't been checked off yet. What would you like to do?",
        [
          { text: 'Go Back', style: 'cancel' },
          {
            text: 'Save Completed Sets',
            onPress: () => {
              const doneOnly = exercises
                .map(ex => ({
                  ...ex,
                  sets: (ex.exercise_type || 'strength') === 'cardio'
                    ? ex.sets
                    : ex.sets.filter(s => s.done),
                }))
                .filter(ex => ex.sets.length > 0);
              doSubmit(doneOnly);
            },
          },
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

  return (
    <View
      ref={rootViewRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={() => {
        // Screen-coordinate of this view's bottom edge — used to convert the
        // keyboard's absolute position into a local `bottom` for the toolbar.
        rootViewRef.current?.measureInWindow((_x, y, _w, h) => {
          rootBottomRef.current = y + h;
        });
      }}
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
        recentExercises={recentExercises}
        onSelect={addExToWorkout}
        onAddExercise={addNewExercise}
        muscleGroups={muscleGroups}
        // Single-select when replacing an exercise; multi-select when adding new ones.
        multiSelect={replacingExIndex === null}
      />
      <NewExerciseForm
        visible={newExerciseFormVisible}
        onClose={() => setNewExerciseFormVisible(false)}
        onSave={(name, muscle, equipment) => { addNewExercise(name, muscle, equipment); setNewExerciseFormVisible(false); }}
        muscleGroups={muscleGroups}
      />

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.uid}
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        // iOS: native keyboard inset handling — scrolls the focused input into
        // view; the extra contentInset keeps it above the floating toolbar.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentInset={Platform.OS === 'ios' ? { bottom: 56 } : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => setOpenMenuIdx(null)}
        ListHeaderComponent={(
          <WorkoutHeader
            workoutName={workoutName}
            onWorkoutNameChange={setWorkoutName}
            notes={notes}
            onNotesChange={setNotes}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            elapsed={elapsed}
            timerPaused={timerPaused}
            onToggleTimer={toggleTimer}
            onResetTimer={resetTimer}
            editMode={editMode}
            autoStartRest={autoStartRest}
            onAutoStartRestChange={val => {
              setAutoStartRest(val);
              AsyncStorage.setItem(AUTO_REST_KEY, String(val));
            }}
            vibrateOnComplete={vibrateOnComplete}
            onVibrateChange={val => {
              setVibrateOnComplete(val);
              AsyncStorage.setItem(VIBRATE_KEY, String(val));
            }}
            showRpe={showRpe}
            onShowRpeChange={val => {
              setShowRpe(val);
              AsyncStorage.setItem(RPE_KEY, String(val));
            }}
            showPlateCalc={showPlateCalc}
            onShowPlateCalcChange={val => {
              setShowPlateCalc(val);
              AsyncStorage.setItem('workout_show_plate_calc', String(val));
            }}
            exercises={exercises}
            weightUnit={weightUnit}
            activeMuscles={activeMuscles}
          />
        )}
        ListFooterComponent={(
          <View style={[styles.formSection, exercises.length === 0 && { marginTop: spacing.xl }]}>
            <TouchableOpacity style={styles.addExBtn} onPress={() => setExerciseModalVisible(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addExBtnText}>Add Exercise</Text>
            </TouchableOpacity>

            {!editMode && exercises.length === 0 && templates.length > 0 && (
              <View style={styles.templateDividerSection}>
                <View style={styles.templateDividerLine} />
                <Text style={styles.templateDividerText}>Start from a template</Text>
                <View style={styles.templateDividerLine} />
              </View>
            )}
            {!editMode && exercises.length === 0 && templates.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateScrollContent}>
                {templates.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.templateChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => applyTemplate(t)}
                  >
                    <Text style={[styles.templateChipName, { color: colors.textPrimary }]} numberOfLines={1}>{t.name}</Text>
                    <Text style={[styles.templateChipSub, { color: colors.textSecondary }]}>
                      {t.exercises.length} {t.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.discardBtn}
              onPress={() => Alert.alert(
                'Discard Workout',
                'Are you sure you want to discard this workout?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => { clearSession(); AsyncStorage.removeItem(TIMER_CHECKPOINT_KEY); AsyncStorage.removeItem(WORKOUT_BACKUP_KEY); onCancel?.(); } },
                ]
              )}
            >
              <Text style={[styles.discardBtnText, { color: colors.danger }]}>Discard Workout</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item: exercise, index: exIndex }) => (
          <ExerciseBlock
            exercise={exercise}
            exIndex={exIndex}
            collapsed={false}
            showRpe={showRpe}
            weightUnit={weightUnit}
            setTypeColors={SET_TYPE_COLORS}
            onUpdateNotes={val => setExercises(prev => prev.map((ex, i) =>
              i === exIndex ? { ...ex, notes: val } : ex
            ))}
            autoFocusNotes={autoFocusNoteIdx === exIndex}
            onCycleSetType={setIdx => cycleSetType(exIndex, setIdx)}
            onUpdateSetField={(setIdx, field, val) => updateSetField(exIndex, setIdx, field, val)}
            onFocusInput={(setIdx, field) => {
              inputFocusedRef.current = true;
              setFocusedInput({ exIdx: exIndex, setIdx, field });
            }}
            onBlurInput={() => { inputFocusedRef.current = false; }}
            onToggleSetDone={setIdx => toggleSetDone(exIndex, setIdx)}
            onOpenRpePicker={setIdx => setRpePickerTarget({ exIdx: exIndex, setIdx })}
            onDeleteSet={setIdx => deleteSet(exIndex, setIdx)}
            onAddSet={() => addSetToExercise(exIndex)}
            onStartRest={startRest}
            onOpenMenu={(e) => {
              const { pageX, pageY } = e.nativeEvent;
              const screenWidth = Dimensions.get('window').width;
              setMenuPosition({ top: pageY + 12, right: screenWidth - pageX - 4 });
              toggleExMenu(exIndex);
            }}
            onUpdateCardioField={(setIdx, field, value) => {
              const updated = [...exercises];
              (updated[exIndex].sets[setIdx] as any)[field] = value;
              setExercises(updated);
            }}
          />
        )}
      />

      {/* Rest timer overlay */}
      {restActive && (
        <RestTimer
          restRemaining={restRemaining}
          restTotal={restTotal}
          restPaused={restPaused}
          onStop={stopRest}
          onPause={pauseRest}
          onResume={resumeRest}
          onAdjust={delta => setRestRemaining(r => delta < 0 ? Math.max(5, r + delta) : r + delta)}
        />
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
            <TouchableOpacity
              style={[styles.exMenuItem, openMenuIdx === 0 && { opacity: 0.35 }]}
              onPress={() => openMenuIdx! > 0 && moveExercise(openMenuIdx!, 'up')}
            >
              <Ionicons name="arrow-up-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Move Up</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[styles.exMenuItem, openMenuIdx === exercises.length - 1 && { opacity: 0.35 }]}
              onPress={() => openMenuIdx! < exercises.length - 1 && moveExercise(openMenuIdx!, 'down')}
            >
              <Ionicons name="arrow-down-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Move Down</Text>
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

      {/* Numeric keyboard toolbar — absolutely positioned at the measured
          keyboard overlap (native InputAccessoryView is broken on the New
          Architecture, and KeyboardAvoidingView mis-measures in nested
          navigators). Android's adjustResize shrinks the window, so 0 works. */}
      {keyboardVisible && focusedInput && (
        <View style={[styles.keyboardAccessory, styles.floatingKeyboardBar, { bottom: Platform.OS === 'ios' ? kbOverlap : 0 }]}>
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
            {focusedInput.field === 'weight' && showPlateCalc && (
              <TouchableOpacity
                style={styles.keyboardAdjBtn}
                onPress={() => { setPlateCalcTarget(focusedInput); Keyboard.dismiss(); }}
              >
                <Ionicons name="barbell-outline" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); setFocusedInput(null); }} style={styles.keyboardDismissBtn}>
            <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal
        visible={plateCalcTarget !== null}
        targetWeight={
          plateCalcTarget
            ? exercises[plateCalcTarget.exIdx]?.sets[plateCalcTarget.setIdx]?.weight ?? ''
            : ''
        }
        weightUnit={weightUnit}
        onClose={() => setPlateCalcTarget(null)}
      />

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
      {prBanner && (
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
            <Text style={styles.prBannerExercise} numberOfLines={1}>{prBanner.name}</Text>
            <Text style={styles.prBannerType}>{prBanner.type}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

import { type Colors } from '../context/ThemeContext';

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
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  exMenuText: { fontSize: typography.fontSize.sm, fontWeight: '500', flex: 1 },
  exMenuSoon: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  exMenuDivider: { height: 1, marginHorizontal: 0 },

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
  floatingKeyboardBar: {
    position: 'absolute',
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
    fontSize: typography.fontSize.xs,
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
    backgroundColor: colors.surface,
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
  prBannerType: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },

  templateDividerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  templateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  templateDividerText: {
    marginHorizontal: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  templateScrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  templateChip: {
    borderRadius: spacing.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 120,
    maxWidth: 180,
  },
  templateChipName: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  templateChipSub: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
});
