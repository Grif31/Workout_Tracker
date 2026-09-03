import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, TouchableOpacity,
  Platform, Vibration, ScrollView,
  Keyboard, Modal, Dimensions,
  Animated, AppState, FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import {
  scheduleRestTimerAlert,
  cancelRestTimerAlert,
  postLiveWorkoutNotification,
  cancelLiveWorkoutNotification,
} from '../utils/notifications';
import NetInfo from '@react-native-community/netinfo';
import { enqueueWorkout } from '../utils/offlineQueue';
import { loadExerciseList } from '../utils/exerciseCache';
import { showToast } from '../utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { toLocalDateStr } from '../utils/date';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import ExerciseListModal from '../components/ExerciseList';
import NewExerciseForm from '../components/NewExerciseForm';
import { PrefillWorkoutData } from './WorkoutDetails';
import { muscleGroups } from 'constants/muscleGroups';
import { useWorkoutSession } from '../context/WorkoutSessionContext';
import { PR_GOLD } from '../constants/prColors';
import { nearPrHint } from '../utils/prFormat';

import {
  REST_TIMER_KEY,
  AUTO_REST_KEY,
  VIBRATE_KEY,
  RPE_KEY,
  WORKOUT_BACKUP_KEY,
  TIMER_CHECKPOINT_KEY,
  RPE_LABELS,
  SET_TYPES,
  type SetType,
  type WorkoutSet,
  type ExerciseEntry,
  makeUid,
  fmtElapsed,
  isBodyweight,
  isDuration,
  makeInitialSet,
  usesBodyweightForVolume,
  bodyweightLoadFactor,
} from './workout/types';
import WorkoutHeader from './workout/WorkoutHeader';
import ExerciseBlock from './workout/ExerciseBlock';
import DraggableList from './DraggableList';
import ExerciseReorderRow, { EXERCISE_REORDER_ROW_HEIGHT } from './workout/ExerciseReorderRow';
import RestTimer from './workout/RestTimer';
import PlateCalculatorModal from './PlateCalculatorModal';
import { syncWorkoutToHealthKit } from '../utils/healthKit';
import { syncWorkoutToHealthConnect } from '../utils/healthConnect';

type EditableSetField = 'reps' | 'weight';

const SET_TYPE_LABELS: Record<SetType, string> = { N: 'Normal', W: 'Warm-up', D: 'Drop Set', F: 'Failure' };

type Props = {
  prefill?: PrefillWorkoutData;
  editMode?: boolean;
  workoutId?: number;
  onSubmit?: (workoutId?: number, summary?: { workoutName: string; prs: any[]; totalVolume: number; totalReps: number; totalSets: number; muscles: string[]; isFirstWorkout: boolean; isBestVolume: boolean; isBestReps: boolean }) => void;
  onCancel?: () => void;
  onViewExerciseHistory?: (
    exerciseName: string,
    exerciseTemplateId?: number,
    meta?: { muscleGroup?: string; equipment?: string; imageUrl?: string },
  ) => void;
};

export default function WorkoutLog({ prefill, editMode, workoutId, onSubmit, onCancel, onViewExerciseHistory }: Props) {
  const { user } = useAuth();
  const uid = user?.id;
  const restTimerKey       = `${REST_TIMER_KEY}_${uid}`;
  const autoRestKey        = `${AUTO_REST_KEY}_${uid}`;
  const vibrateKey         = `${VIBRATE_KEY}_${uid}`;
  const rpeKey             = `${RPE_KEY}_${uid}`;
  const plateCalcKey       = `workout_show_plate_calc_${uid}`;
  const repeatLastSetKey   = `workout_repeat_last_set_${uid}`;
  const prefillPreviousKey = `workout_prefill_previous_sets_${uid}`;
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
  // Lets stable (useCallback'd) handlers read the latest exercises without
  // depending on `exercises` itself — depending on it would recreate the
  // handler (and blow the memoization of every ExerciseBlock) on every
  // keystroke, since exercises changes on every keystroke.
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
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
  // Computed here (not inside WorkoutHeader) so WorkoutHeader can be
  // React.memo'd on primitive totals instead of needing the whole
  // `exercises` array (which gets a new reference on every keystroke).
  const workoutTotals = useMemo(() => {
    const bw = user?.bodyweight ?? null;
    let volume = 0;
    let sets = 0;
    for (const ex of exercises) {
      const addsBodyweight = usesBodyweightForVolume(ex) && bw != null;
      const bwContribution = addsBodyweight ? bw! * bodyweightLoadFactor(ex) : 0;
      sets += ex.sets.length;
      for (const set of ex.sets) {
        const r = parseFloat(set.reps);
        const w = parseFloat(set.weight);
        if (isNaN(r) || isNaN(w)) continue;
        volume += r * (w + bwContribution);
      }
    }
    return { totalVolume: volume, totalSets: sets };
  }, [exercises, user?.bodyweight]);
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
  const [repeatLastSet, setRepeatLastSet] = useState(false);
  const [prefillPreviousSets, setPrefillPreviousSets] = useState(true);
  const [focusedInput, setFocusedInput] = useState<{ exIdx: number; setIdx: number; field: 'reps' | 'weight' } | null>(null);
  // Live TextInput refs keyed `${exIdx}:${setIdx}:${field}` — lets the
  // keyboard toolbar's Next button move focus between set inputs
  const inputRefs = useRef<Map<string, TextInput | null>>(new Map());
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // How far the keyboard overlaps THIS view (screen coords) — the toolbar's `bottom`
  const [kbOverlap, setKbOverlap] = useState(0);
  const rootViewRef = useRef<View>(null);
  const rootBottomRef = useRef(0);
  const [rpePickerTarget, setRpePickerTarget]     = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [setTypePickerTarget, setSetTypePickerTarget] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [plateCalcTarget, setPlateCalcTarget]     = useState<{ exIdx: number; setIdx: number } | null>(null);
  // Keep refs in sync with state so AppState/setInterval closures always read current values.
  const vibrateRef = useRef(true);
  vibrateRef.current = vibrateOnComplete;
  // Read inside async IIFEs below (last-session enrichment) instead of the
  // state directly — those closures are created before the AsyncStorage
  // settings load resolves, so the state value they'd otherwise capture can
  // be stale by the time the awaited fetch actually applies it.
  const prefillPreviousRef = useRef(true);
  prefillPreviousRef.current = prefillPreviousSets;
  const timerPausedRef = useRef(false);
  timerPausedRef.current = timerPaused;

  // Current max-weight PR per exercise template, fetched once on open —
  // powers the near-PR hint under the focused set row
  const [maxWeightPrs, setMaxWeightPrs] = useState<Record<number, number>>({});

  const [prBanner, setPrBanner] = useState<{ name: string; type: string } | null>(null);
  const prAnim = useRef(new Animated.Value(0)).current;
  const prTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputFocusedRef = useRef(false);
  const listRef = useRef<FlatList<ExerciseEntry>>(null);
  const scrollOffsetRef = useRef(0);
  const kbScreenYRef = useRef<number | null>(null);

  // automaticallyAdjustKeyboardInsets adds scroll space but doesn't reliably
  // scroll the focused input into view on the New Architecture — do it manually
  const scrollFocusedInputAboveKeyboard = (kbTop: number) => {
    const input: any = (TextInput as any).State?.currentlyFocusedInput?.();
    if (!input?.measureInWindow) return;
    input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const clearance = 56 + spacing.md; // floating +/- toolbar sits above the keyboard
      const overshoot = y + h + clearance - kbTop;
      if (overshoot > 0) {
        listRef.current?.scrollToOffset({
          offset: scrollOffsetRef.current + overshoot,
          animated: true,
        });
      }
    });
  };

  const [exerciseList, setExerciseList] = useState<{ id: number; name: string; muscle_group: string; equipment?: string; image_url?: string; exercise_type?: string; is_custom?: boolean }[]>([]);
  const [recentExercises, setRecentExercises] = useState<{ name: string; exercise_template_id: number | null }[]>([]);
  const [templates, setTemplates] = useState<{ id: number; name: string; exercises: { id: number; name: string; muscle_group?: string; equipment?: string; image_url?: string; exercise_type?: string; bodyweight_load_factor?: number | null }[] }[]>([]);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);
  const [replacingExIndex, setReplacingExIndex] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Which exercise's 3-dot menu is open. menuRendered lags openMenuIdx by
  // one animation — the Modal has to stay mounted a beat longer than
  // "closed" so the close animation has something to play against.
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [menuRendered, setMenuRendered] = useState(false);
  // Which exercise the menu belongs to, for rendering — mirrors openMenuIdx
  // but holds its last value through the close animation, since openMenuIdx
  // itself goes null immediately (before the fade-out has played).
  const [renderedMenuIdx, setRenderedMenuIdx] = useState<number | null>(null);
  const exMenuAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (openMenuIdx !== null) {
      setRenderedMenuIdx(openMenuIdx);
      setMenuRendered(true);
      Animated.spring(exMenuAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 16 }).start();
    } else {
      Animated.timing(exMenuAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      // Unmount on a timer, not the animation's completion callback — a
      // native-driver animation interrupted by a background/foreground can
      // resolve with finished:false, which would leave this Modal (and its
      // full-screen backdrop) mounted forever and swallow every tap.
      const t = setTimeout(() => { setMenuRendered(false); setRenderedMenuIdx(null); }, 160);
      return () => clearTimeout(t);
    }
  }, [openMenuIdx, exMenuAnim]);
  // Reorder Mode — a compact drag-to-reorder view swapped in for the normal
  // set-editing list, since ExerciseBlock rows are variable-height (set
  // count, notes, RPE) and DraggableList needs a uniform row height to do
  // its drag-slot math.
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDragging, setReorderDragging] = useState(false);

  useEffect(() => {
    setWorkoutOpen(true);
    return () => {
      setWorkoutOpen(false);
      // Deliberately NOT clearing WORKOUT_BACKUP_KEY here — every legitimate
      // "this workout is done" path (submit, offline save, discard) already
      // clears it at its own point of completion. Clearing it unconditionally
      // on every unmount meant an involuntary teardown (e.g. a forced logout
      // from a failed token refresh) wiped the one crash-recovery copy of an
      // in-progress workout moments before it was needed.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(restTimerKey),
      AsyncStorage.getItem(autoRestKey),
      AsyncStorage.getItem(vibrateKey),
      AsyncStorage.getItem(rpeKey),
      AsyncStorage.getItem(plateCalcKey),
      AsyncStorage.getItem(repeatLastSetKey),
      AsyncStorage.getItem(prefillPreviousKey),
    ]).then(([timerVal, autoRestVal, vibrateVal, rpeVal, plateCalcVal, repeatVal, prefillPrevVal]) => {
      const n = timerVal ? parseInt(timerVal, 10) : NaN;
      if (!isNaN(n)) { setDefaultRest(n); setRestRemaining(n); setRestTotal(n); }
      if (autoRestVal !== null) setAutoStartRest(autoRestVal === 'true');
      if (vibrateVal !== null) setVibrateOnComplete(vibrateVal !== 'false');
      if (rpeVal !== null) setShowRpe(rpeVal === 'true');
      if (plateCalcVal !== null) setShowPlateCalc(plateCalcVal !== 'false');
      if (repeatVal !== null) setRepeatLastSet(repeatVal === 'true');
      if (prefillPrevVal !== null) setPrefillPreviousSets(prefillPrevVal !== 'false');
    });
  }, []);

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
      kbScreenYRef.current = e.endCoordinates.screenY;
      // Wait a frame so the keyboard metrics and layout settle before measuring
      requestAnimationFrame(() => scrollFocusedInputAboveKeyboard(e.endCoordinates.screenY));
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      kbScreenYRef.current = null;
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

  const resetTimer = useCallback(() => {
    baseRef.current = 0;
    startRef.current = new Date();
    setTimerPaused(false);
    setElapsed(0);
  }, []);

  const toggleTimer = useCallback(() => {
    if (timerPausedRef.current) {
      setTimerPaused(false);
    } else {
      // Equivalent to reading the current `elapsed` state (that's exactly how
      // the ticking effect computes it), but via refs so this stays stable
      // across renders instead of depending on `elapsed` (which changes every
      // second, and would recreate this callback — and break WorkoutHeader's
      // memoization — that often).
      baseRef.current = baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000);
      setTimerPaused(true);
    }
  }, []);

  // Wall-clock finish time of the running rest timer (null = not running or
  // paused). The setInterval is suspended while the app is backgrounded, so
  // this is the source of truth to resync from on foreground.
  const restEndsAtRef = useRef<number | null>(null);

  // Separated from startRest so resumeRest can restart the tick without resetting restRemaining.
  const _runRestInterval = useCallback(() => {
    restRef.current = setInterval(() => {
      setRestRemaining(prev => {
        if (prev <= 1) {
          clearInterval(restRef.current!);
          restEndsAtRef.current = null;
          setRestActive(false);
          setRestPaused(false);
          if (vibrateRef.current) Vibration.vibrate([0, 300, 100, 300]);
          // This branch only runs while the JS interval is alive, i.e. the app
          // is foregrounded — the scheduled OS notification (crash/background
          // insurance) is suppressed in that case, so show an in-app banner instead.
          showToast('Rest over. Time to lift! 💪');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // JS timers freeze during app suspension — recompute remaining from the
  // wall-clock finish time when the app returns to the foreground.
  const resyncRestTimer = () => {
    if (restEndsAtRef.current == null) return;
    if (restRef.current) clearInterval(restRef.current);
    const remaining = Math.ceil((restEndsAtRef.current - Date.now()) / 1000);
    if (remaining <= 0) {
      // Finished while backgrounded — the OS notification already alerted
      restEndsAtRef.current = null;
      setRestRemaining(0);
      setRestActive(false);
      setRestPaused(false);
    } else {
      setRestRemaining(remaining);
      _runRestInterval();
    }
  };

  const startRest = useCallback(async () => {
    if (restRef.current) clearInterval(restRef.current);
    const duration = defaultRest;
    setRestTotal(duration);
    setRestRemaining(duration);
    setRestActive(true);
    setRestPaused(false);
    restEndsAtRef.current = Date.now() + duration * 1000;
    _runRestInterval();
    const alertsOff = await AsyncStorage.getItem('rest_timer_alerts_enabled');
    if (alertsOff !== 'false') scheduleRestTimerAlert(duration);
  }, [defaultRest, _runRestInterval]);

  const pauseRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    restEndsAtRef.current = null;
    setRestPaused(true);
    // The OS alert would still fire at the original wall-clock time — cancel
    // while paused; resumeRest re-schedules from the frozen remaining.
    cancelRestTimerAlert();
  };

  const resumeRest = async () => {
    setRestPaused(false);
    restEndsAtRef.current = Date.now() + restRemaining * 1000;
    _runRestInterval();
    const alertsOff = await AsyncStorage.getItem('rest_timer_alerts_enabled');
    if (alertsOff !== 'false') scheduleRestTimerAlert(restRemaining);
  };

  const adjustRest = async (delta: number) => {
    const next = delta < 0 ? Math.max(5, restRemaining + delta) : restRemaining + delta;
    setRestRemaining(next);
    // Keep the ring's denominator in sync when time is added past the original
    // total, so progress never exceeds the full circle
    if (next > restTotal) setRestTotal(next);
    // Re-schedule the OS alert to the adjusted finish time (paused timers have
    // no alert scheduled; resumeRest handles them)
    if (!restPaused) {
      restEndsAtRef.current = Date.now() + next * 1000;
      const alertsOff = await AsyncStorage.getItem('rest_timer_alerts_enabled');
      if (alertsOff !== 'false') scheduleRestTimerAlert(next);
    }
  };

  const stopRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    restEndsAtRef.current = null;
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
        resyncRestTimer();
        // Deliberately NOT clearing WORKOUT_BACKUP_KEY here even though
        // exercises are still in memory right now — a token refresh triggered
        // by the next API call could still force a logout (e.g. a transient
        // network failure right after reconnecting), which unmounts this
        // screen a moment later. The backup gets overwritten wholesale next
        // time the app backgrounds, and is explicitly cleared by every real
        // completion path (submit, offline save, discard), so leaving it here
        // costs nothing and is the only thing that survives that scenario.
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, workoutName, editMode]);

  const showPRBanner = useCallback((exerciseName: string, prType: string) => {
    if (prTimerRef.current) clearTimeout(prTimerRef.current);
    setPrBanner({ name: exerciseName, type: prType });
    prAnim.setValue(0);
    Animated.spring(prAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 }).start();
    prTimerRef.current = setTimeout(() => {
      Animated.timing(prAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setPrBanner(null);
      });
    }, 3500);
  }, [prAnim]);

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
      const initialExercises: ExerciseEntry[] = prefill.exercises.map((ex: any) => ({
        uid: makeUid(),
        id: ex.id,
        exercise_template_id: ex.exercise_template_id,
        exercise_type: ex.exercise_type,
        name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        bodyweight_load_factor: ex.bodyweight_load_factor,
        notes: ex.notes ?? undefined,
        sets: ex.sets.map((s: any) => ({
          uid: makeUid(),
          id: s.id,
          reps: String(s.reps ?? ''),
          weight: isBodyweight(ex) ? '0' : String(s.weight ?? ''),
          set_type: s.set_type ?? 'N',
          rpe: s.rpe != null ? String(s.rpe) : '',
          // Duration exercises edit in seconds; the API stores minutes
          cardio_duration: s.cardio_duration != null
            ? (ex.exercise_type === 'duration'
                ? String(Math.round(parseFloat(String(s.cardio_duration)) * 60))
                : String(s.cardio_duration))
            : '',
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
                  prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps, max_duration: pr.max_duration };
                }
                if (lastRes.ok) {
                  const data = await lastRes.json();
                  if (data.sets?.length > 0) {
                    enriched[idx] = {
                      ...enriched[idx],
                      ...(prefillPreviousRef.current ? { sets: prevSetsToEditable(ex, data.sets) } : {}),
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
    await loadExerciseList(uid, data => setExerciseList(data as typeof exerciseList));
  };

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch('/api/workout-templates');
      if (res.ok) setTemplates(await res.json());
    } catch {}
  };

  const addNewExercise = async (name: string, muscle: string, equipment: string, exerciseType?: string) => {
    if (!name.trim()) return;
    // NewExerciseForm's 'distance' logging type is a friendlier label for what
    // the backend just calls 'cardio' — ExerciseTemplate.exercise_type only
    // recognizes 'strength' | 'cardio' | 'duration'.
    const backendExerciseType = exerciseType === 'distance' ? 'cardio' : (exerciseType ?? 'strength');
    try {
      const res = await apiFetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle, equipment, exercise_type: backendExerciseType }),
      });
      const data = await res.json();
      if (res.ok) { fetchExercises(); Alert.alert('Success', 'Exercise added'); }
      else Alert.alert('Error', data.message || 'Please try again');
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  const weightDelta = weightUnit === 'kg' ? 2.5 : 5;

  // Advance focus: reps → weight (same set) → reps of next set → … → next
  // strength exercise. Skips done sets (their inputs are not editable).
  const focusNextInput = () => {
    if (!focusedInput) return;
    const { exIdx, setIdx, field } = focusedInput;
    const candidates: [number, number, EditableSetField][] = [];
    const pushSet = (e: number, s: number) => {
      const ex = exercises[e];
      if (!ex || ex.sets[s]?.done) return;
      candidates.push([e, s, 'reps']);
      if (!isBodyweight(ex)) candidates.push([e, s, 'weight']);
    };
    // From reps, weight of the same set comes first
    if (field === 'reps' && !isBodyweight(exercises[exIdx] ?? {}) && !exercises[exIdx]?.sets[setIdx]?.done) {
      candidates.push([exIdx, setIdx, 'weight']);
    }
    // Remaining sets of this exercise
    for (let s = setIdx + 1; s < (exercises[exIdx]?.sets.length ?? 0); s++) pushSet(exIdx, s);
    // Following strength exercises
    for (let e = exIdx + 1; e < exercises.length; e++) {
      const ex = exercises[e];
      if (ex.exercise_type === 'cardio' || isDuration(ex)) continue;
      for (let s = 0; s < ex.sets.length; s++) pushSet(e, s);
    }
    for (const [e, s, f] of candidates) {
      const ref = inputRefs.current.get(`${e}:${s}:${f}`);
      if (ref) { ref.focus(); return; }
    }
    Keyboard.dismiss();
    setFocusedInput(null);
  };

  // Immutable, single-item replacement (not a full-array deep clone) so
  // ExerciseBlock's React.memo can skip re-rendering every OTHER exercise
  // when only one set field changes — sibling exercise objects keep their
  // exact prior reference.
  const updateSetField = useCallback((exIndex: number, setIndex: number, field: EditableSetField, value: string) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex || ex.sets[setIndex]?.done) return prev;
      const next = [...prev];
      next[exIndex] = { ...ex, sets: ex.sets.map((s, j) => j === setIndex ? { ...s, [field]: value } : s) };
      return next;
    });
  }, []);

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

  const applySetType = useCallback((exIndex: number, setIndex: number, type: SetType) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex || !ex.sets[setIndex]) return prev;
      const next = [...prev];
      next[exIndex] = { ...ex, sets: ex.sets.map((s, j) => j === setIndex ? { ...s, set_type: type } : s) };
      return next;
    });
  }, []);

  const toggleSetDone = useCallback((exIndex: number, setIndex: number) => {
    // Read via the ref (not `exercises` directly) so this callback doesn't
    // need `exercises` in its dependency array — depending on it would
    // recreate the callback (and defeat memoization) on every keystroke.
    const ex = exercisesRef.current[exIndex];
    const set = ex?.sets[setIndex];
    if (!ex || !set) return;
    if (!set.done) {
      if (isDuration(ex)) {
        if (!set.cardio_duration?.trim()) return;
      } else if (!set.reps.trim() || (!isBodyweight(ex) && !set.weight.trim())) {
        return;
      }
    }
    const nowDone = !set.done;
    setExercises(prev => {
      const target = prev[exIndex];
      if (!target) return prev;
      const next = [...prev];
      next[exIndex] = { ...target, sets: target.sets.map((s, j) => j === setIndex ? { ...s, done: nowDone } : s) };
      return next;
    });
    if (nowDone && autoStartRest && set.set_type !== 'W') startRest();
    if (nowDone && ex.currentPR && ex.exercise_type !== 'cardio' && !isDuration(ex)) {
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
        // Advance currentPR so subsequent sets in the same session don't re-trigger.
        // Match by exercise_template_id, not exIndex — the same exercise can appear
        // in more than one block (superset, repeated template entry, added twice),
        // and each block fetched its own currentPR snapshot on add. Without this,
        // a sibling block still holds the pre-PR snapshot and re-fires the banner
        // for a PR this workout already achieved a few sets earlier.
        setExercises(prev => prev.map(e => {
          if (e.exercise_template_id == null || e.exercise_template_id !== ex.exercise_template_id || !e.currentPR) return e;
          const updatedPR = { ...e.currentPR };
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
    if (nowDone && ex.currentPR && isDuration(ex)) {
      const secs = parseFloat(set.cardio_duration ?? '');
      const mins = secs / 60;
      const pr = ex.currentPR;
      if (!isNaN(secs) && secs > 0 && pr.max_duration != null && mins > pr.max_duration) {
        showPRBanner(ex.name, 'Longest Hold');
        // Advance currentPR so subsequent sets in the same session don't re-trigger (see above).
        setExercises(prev => prev.map(e =>
          (e.exercise_template_id != null && e.exercise_template_id === ex.exercise_template_id && e.currentPR)
            ? { ...e, currentPR: { ...e.currentPR, max_duration: mins } }
            : e
        ));
      }
    }
  }, [autoStartRest, startRest, showPRBanner]);

  const addSetToExercise = useCallback((exIndex: number) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex) return prev;
      const last = ex.sets[ex.sets.length - 1];
      const newSet = repeatLastSet && last && ex.exercise_type !== 'cardio'
        ? (isDuration(ex)
            ? { uid: makeUid(), reps: '', weight: '', set_type: 'N' as SetType, cardio_duration: last.cardio_duration ?? '' }
            : { uid: makeUid(), reps: last.reps, weight: last.weight, set_type: 'N' as SetType, rpe: last.rpe })
        : makeInitialSet(ex);
      const next = [...prev];
      next[exIndex] = { ...ex, sets: [...ex.sets, newSet] };
      return next;
    });
  }, [repeatLastSet]);

  const deleteSet = useCallback((exIndex: number, setIndex: number) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex) return prev;
      const next = [...prev];
      next[exIndex] = { ...ex, sets: ex.sets.filter((_, j) => j !== setIndex) };
      return next;
    });
  }, []);

  const deleteEx = (exIndex: number) => {
    setOpenMenuIdx(null);
    const ex = exercises[exIndex];
    const hasLoggedData = !!ex && ex.sets.some(s => s.done || s.reps || s.weight || s.cardio_duration || s.distance);
    Alert.alert(
      'Remove Exercise',
      `Remove ${ex?.name ?? 'this exercise'} and all its sets from this workout?${hasLoggedData ? ' Any sets you\'ve logged for it will be lost.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setExercises(prev => prev.filter((_, i) => i !== exIndex)),
        },
      ]
    );
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

  // Stable references for DraggableList (React.memo'd) — an inline function
  // here would give it a "new" prop on every WorkoutLog render, including the
  // once-a-second elapsed-timer tick, defeating the memo and recreating every
  // row's PanResponder mid-drag.
  const reorderKeyExtractor = useCallback((item: ExerciseEntry) => item.uid, []);
  const handleReorderExercises = useCallback((from: number, to: number) => {
    setExercises(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);
  const renderReorderRow = useCallback((item: ExerciseEntry) => (
    <ExerciseReorderRow
      name={item.name}
      muscleGroup={item.muscle_group}
      setCount={item.sets.length}
      exerciseType={item.exercise_type}
    />
  ), []);

  const toggleExMenu = useCallback((exIndex: number) => {
    setOpenMenuIdx(prev => (prev === exIndex ? null : exIndex));
  }, []);

  // The rest of these are stable (useCallback, no deps that change per-keystroke)
  // specifically so ExerciseBlock can be React.memo'd — passing the same
  // function reference to every exercise block on every render lets memo skip
  // re-rendering the exercises the user isn't currently editing.
  const updateExerciseNotes = useCallback((exIndex: number, val: string) => {
    setExercises(prev => prev.map((ex, i) => i === exIndex ? { ...ex, notes: val } : ex));
  }, []);

  const updateCardioField = useCallback((exIndex: number, setIndex: number, field: string, value: string) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex) return prev;
      const next = [...prev];
      next[exIndex] = { ...ex, sets: ex.sets.map((s, j) => j === setIndex ? { ...s, [field]: value } : s) };
      return next;
    });
  }, []);

  const onFocusSetInput = useCallback((exIndex: number, setIdx: number, field: 'reps' | 'weight') => {
    inputFocusedRef.current = true;
    setFocusedInput({ exIdx: exIndex, setIdx, field });
    // Keyboard already open (input-to-input focus change) — no keyboard
    // event will fire, so scroll from here
    if (kbScreenYRef.current != null) {
      const kbTop = kbScreenYRef.current;
      setTimeout(() => scrollFocusedInputAboveKeyboard(kbTop), 60);
    }
  }, []);

  const onBlurSetInput = useCallback(() => { inputFocusedRef.current = false; }, []);

  const onOpenRpePicker = useCallback((exIndex: number, setIdx: number) => {
    setRpePickerTarget({ exIdx: exIndex, setIdx });
  }, []);

  const onOpenSetTypePicker = useCallback((exIndex: number, setIdx: number) => {
    setSetTypePickerTarget({ exIdx: exIndex, setIdx });
  }, []);

  const onRegisterSetInput = useCallback((exIndex: number, setIdx: number, field: 'reps' | 'weight', ref: any) => {
    inputRefs.current.set(`${exIndex}:${setIdx}:${field}`, ref);
  }, []);

  const onOpenExerciseMenu = useCallback((exIndex: number, e: any) => {
    const { pageX, pageY } = e.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    setMenuPosition({ top: pageY + 12, right: screenWidth - pageX - 4 });
    toggleExMenu(exIndex);
  }, [toggleExMenu]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch('/api/personal-records');
        if (!res.ok || !alive) return;
        const rows: { pr_type: string; exercise_template_id?: number; value: number }[] = await res.json();
        const map: Record<number, number> = {};
        for (const r of rows) {
          if (r.pr_type === 'max_weight' && r.exercise_template_id) map[r.exercise_template_id] = r.value;
        }
        if (alive) setMaxWeightPrs(map);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // Hint for the focused set only — warm-ups and completed sets never earn
  // PRs, and bodyweight/cardio/duration exercises have no max_weight PR
  const prHint = useMemo(() => {
    if (!focusedInput) return null;
    const ex = exercises[focusedInput.exIdx];
    if (!ex?.exercise_template_id) return null;
    if (ex.exercise_type === 'cardio' || isDuration(ex) || isBodyweight(ex)) return null;
    const set = ex.sets[focusedInput.setIdx];
    if (!set || set.done || set.set_type === 'W') return null;
    const text = nearPrHint(set.weight, maxWeightPrs[ex.exercise_template_id], weightUnit);
    return text ? { setIdx: focusedInput.setIdx, exIdx: focusedInput.exIdx, text } : null;
  }, [focusedInput, exercises, maxWeightPrs, weightUnit]);

  // Every prop passed here is now a stable reference for a given
  // showRpe/weightUnit/theme combo, so this itself stays stable across
  // keystrokes — letting ExerciseBlock's React.memo actually skip
  // re-rendering the exercises the user isn't currently editing.
  const renderExercise = useCallback(({ item: exercise, index: exIndex }: { item: ExerciseEntry; index: number }) => (
    <ExerciseBlock
      exercise={exercise}
      exIndex={exIndex}
      collapsed={false}
      showRpe={showRpe}
      weightUnit={weightUnit}
      setTypeColors={SET_TYPE_COLORS}
      onUpdateNotes={updateExerciseNotes}
      autoFocusNotes={autoFocusNoteIdx === exIndex}
      onOpenSetTypePicker={onOpenSetTypePicker}
      onUpdateSetField={updateSetField}
      onFocusInput={onFocusSetInput}
      onBlurInput={onBlurSetInput}
      onToggleSetDone={toggleSetDone}
      onOpenRpePicker={onOpenRpePicker}
      onDeleteSet={deleteSet}
      onAddSet={addSetToExercise}
      onRegisterInput={onRegisterSetInput}
      onStartRest={startRest}
      onOpenMenu={onOpenExerciseMenu}
      onUpdateCardioField={updateCardioField}
      prHint={prHint && prHint.exIdx === exIndex ? prHint : null}
    />
  ), [
    showRpe, weightUnit, SET_TYPE_COLORS, updateExerciseNotes, autoFocusNoteIdx,
    onOpenSetTypePicker, updateSetField, onFocusSetInput, onBlurSetInput, toggleSetDone,
    onOpenRpePicker, deleteSet, addSetToExercise, onRegisterSetInput, startRest,
    onOpenExerciseMenu, updateCardioField, prHint,
  ]);

  // Stable so WorkoutHeader (React.memo'd) can skip re-rendering on
  // unrelated state changes (e.g. typing a set) instead of just on toggling
  // these specific settings.
  const onAutoStartRestChange = useCallback((val: boolean) => {
    setAutoStartRest(val);
    AsyncStorage.setItem(autoRestKey, String(val));
  }, [autoRestKey]);
  const onVibrateChange = useCallback((val: boolean) => {
    setVibrateOnComplete(val);
    AsyncStorage.setItem(vibrateKey, String(val));
  }, [vibrateKey]);
  const onShowRpeChange = useCallback((val: boolean) => {
    setShowRpe(val);
    AsyncStorage.setItem(rpeKey, String(val));
  }, [rpeKey]);
  const onShowPlateCalcChange = useCallback((val: boolean) => {
    setShowPlateCalc(val);
    AsyncStorage.setItem(plateCalcKey, String(val));
  }, [plateCalcKey]);
  const onRepeatLastSetChange = useCallback((val: boolean) => {
    setRepeatLastSet(val);
    AsyncStorage.setItem(repeatLastSetKey, String(val));
  }, [repeatLastSetKey]);
  const onPrefillPreviousSetsChange = useCallback((val: boolean) => {
    setPrefillPreviousSets(val);
    AsyncStorage.setItem(prefillPreviousKey, String(val));
  }, [prefillPreviousKey]);

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
    // Let the menu Modal fully unmount before presenting the picker — iOS
    // only shows one Modal at a time, and mounting the second while the
    // first animates out can leave the picker stuck behind it.
    setTimeout(() => setExerciseModalVisible(true), 180);
  };

  // Turn last-session sets into editable set state for this exercise's logging mode
  const prevSetsToEditable = (ex: { exercise_type?: string; equipment?: string }, sets: any[]): WorkoutSet[] =>
    sets.map((s: any) => isDuration(ex)
      ? {
          uid: makeUid(), reps: '', weight: '', set_type: s.set_type ?? 'N',
          cardio_duration: s.cardio_duration && parseFloat(s.cardio_duration) > 0
            ? String(Math.round(parseFloat(s.cardio_duration) * 60))
            : '',
        }
      : { uid: makeUid(), reps: String(s.reps ?? ''), weight: isBodyweight(ex) ? '0' : String(s.weight ?? ''), set_type: s.set_type ?? 'N' });

  // Merge a freshly-fetched PR snapshot with any more-advanced currentPR a
  // sibling block for the same exercise already holds. PRs achieved earlier
  // in this session aren't saved to the backend until Save, so fetching PR
  // data for a newly-added block always returns pre-PR data when the same
  // exercise was already logged once this workout — without this merge, that
  // new block would re-fire the "New PR!" banner for a PR already achieved.
  const mergeWithSessionPR = (
    templateId: number | undefined,
    fetched: ExerciseEntry['currentPR'],
    siblings: ExerciseEntry[],
  ): ExerciseEntry['currentPR'] => {
    if (templateId == null) return fetched;
    const sibling = siblings.find(e => e.exercise_template_id === templateId && e.currentPR);
    if (!sibling?.currentPR) return fetched;
    const s = sibling.currentPR;
    const merged: NonNullable<ExerciseEntry['currentPR']> = { ...fetched };
    if (s.max_weight != null && (merged.max_weight == null || s.max_weight > merged.max_weight)) merged.max_weight = s.max_weight;
    if (s.estimated_1rm != null && (merged.estimated_1rm == null || s.estimated_1rm > merged.estimated_1rm)) merged.estimated_1rm = s.estimated_1rm;
    if (s.max_duration != null && (merged.max_duration == null || s.max_duration > merged.max_duration)) merged.max_duration = s.max_duration;
    if (s.per_weight_reps) {
      const byWeight = new Map((merged.per_weight_reps ?? []).map(e => [e.weight, e]));
      for (const e of s.per_weight_reps) {
        const existing = byWeight.get(e.weight);
        if (!existing || e.max_reps > existing.max_reps) byWeight.set(e.weight, e);
      }
      merged.per_weight_reps = [...byWeight.values()];
    }
    return merged;
  };

  const addExToWorkout = async (exercise: { id: number; name: string; muscle_group?: string; equipment?: string; image_url?: string; exercise_type?: string; bodyweight_load_factor?: number | null }) => {
    const initialSet: WorkoutSet = makeInitialSet(exercise);

    if (replacingExIndex !== null) {
      const targetIdx = replacingExIndex;
      setExercises(prev => prev.map((ex, i) =>
        i === targetIdx
          ? { uid: ex.uid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], muscle_group: exercise.muscle_group, equipment: exercise.equipment, image_url: exercise.image_url, bodyweight_load_factor: exercise.bodyweight_load_factor, sets: [initialSet] }
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
          prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps, max_duration: pr.max_duration };
        }
        if (lastRes.ok) {
          const data = await lastRes.json();
          setExercises(prev => {
            const merged = mergeWithSessionPR(exercise.id, prData, prev);
            return prev.map((ex, i) => {
              if (i !== targetIdx || ex.name !== exercise.name) return ex;
              if (data.sets?.length > 0) {
                return {
                  ...ex,
                  ...(prefillPreviousRef.current ? { sets: prevSetsToEditable(exercise, data.sets) } : {}),
                  previousSets: data.sets,
                  currentPR: merged,
                };
              }
              return merged ? { ...ex, currentPR: merged } : ex;
            });
          });
        }
      } catch {}
      return;
    }

    const newUid = makeUid();
    setExercises(prev => [
      ...prev,
      { uid: newUid, name: exercise.name, exercise_template_id: exercise.id, exercise_type: exercise.exercise_type as ExerciseEntry['exercise_type'], muscle_group: exercise.muscle_group, equipment: exercise.equipment, image_url: exercise.image_url, bodyweight_load_factor: exercise.bodyweight_load_factor, sets: [initialSet] },
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
        prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps, max_duration: pr.max_duration };
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
              ...(prefillPreviousRef.current ? { sets: prevSetsToEditable(exercise, data.sets) } : {}),
              previousSets: data.sets,
              currentPR: mergeWithSessionPR(exercise.id, prData, prev),
            };
            return updated;
          });
        } else if (prData) {
          setExercises(prev => {
            const idx = prev.findIndex(ex => ex.uid === newUid);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], currentPR: mergeWithSessionPR(exercise.id, prData, prev) };
            return updated;
          });
        }
      }
    } catch {}
  };

  const applyTemplate = async (template: typeof templates[0]) => {
    setWorkoutName(template.name);
    const newExercises: ExerciseEntry[] = template.exercises.map(ex => {
      const initialSet: WorkoutSet = makeInitialSet(ex);
      return {
        uid: makeUid(),
        name: ex.name,
        exercise_template_id: ex.id,
        exercise_type: ex.exercise_type as ExerciseEntry['exercise_type'],
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        image_url: ex.image_url,
        bodyweight_load_factor: ex.bodyweight_load_factor,
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
            prData = { max_weight: pr.max_weight, estimated_1rm: pr.estimated_1rm, per_weight_reps: pr.per_weight_reps, max_duration: pr.max_duration };
          }
          if (lastRes.ok) {
            const data = await lastRes.json();
            if (data.sets?.length > 0) {
              enriched[idx] = {
                ...enriched[idx],
                ...(prefillPreviousRef.current ? { sets: prevSetsToEditable(ex, data.sets) } : {}),
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
    date: toLocalDateStr(selectedDate),
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
        if (isDuration(ex)) {
          // UI edits in seconds; stored unit is minutes (matches cardio)
          const secs = Number(s.cardio_duration);
          return {
            id: s.id,
            order: setIndex,
            set_type: s.set_type ?? 'N',
            reps: null,
            weight: null,
            cardio_duration: secs > 0 ? Math.round((secs / 60) * 10000) / 10000 : null,
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
    // Re-entry guard — repeated Save presses must not save twice
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await _doSubmitInner(exercisesToSave);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const _doSubmitInner = async (exercisesToSave: ExerciseEntry[]) => {
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
        showToast('Saved offline. Will sync when connected');
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
        syncWorkoutToHealthKit({ type: workoutType, startDate, endDate, userId: uid });
      } else if (Platform.OS === 'android') {
        syncWorkoutToHealthConnect({ type: workoutType, startDate, endDate, userId: uid });
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
          isBestVolume: data.is_best_volume ?? false,
          isBestReps: data.is_best_reps ?? false,
        }
      );
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  const submitWorkout = () => {
    if (savingRef.current) return;
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
    // The minimized session (SESSION_KEY) is now the single source of truth for
    // this in-progress workout — clear the crash-recovery backup so a stale,
    // pre-minimize snapshot can't outlive it. Every other exit path (submit,
    // offline save, discard, resume) already does this; minimize was the one
    // gap.
    AsyncStorage.removeItem(WORKOUT_BACKUP_KEY);
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
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
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
        <TouchableOpacity onPress={submitWorkout} style={styles.headerBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={colors.save} />
            : <Text style={styles.saveText}>{editMode ? 'Update' : 'Save'}</Text>
          }
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
        onSave={(name, muscle, equipment, exerciseType) => { addNewExercise(name, muscle, equipment, exerciseType); setNewExerciseFormVisible(false); }}
        muscleGroups={muscleGroups}
      />

      {/* Reorder Mode — compact drag-to-reorder view, swapped in for the
          normal set-editing list. See ExerciseReorderRow for why.
          Rendered as a plain absolutely-positioned overlay rather than a
          <Modal> — RN's Modal mounts its content in a separate native root,
          which broke DraggableList's PanResponder-based long-press-to-drag
          (it works fine as a normal in-tree view, e.g. TemplateDetailScreen). */}
      {reorderMode && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background, zIndex: 50 }]}>
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <View style={styles.headerBtn} />
            <Text style={styles.headerTitle}>Reorder Exercises</Text>
            <TouchableOpacity onPress={() => setReorderMode(false)} style={styles.headerBtn}>
              <Text style={styles.saveText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.reorderContent} scrollEnabled={!reorderDragging}>
            <DraggableList
              data={exercises}
              keyExtractor={reorderKeyExtractor}
              rowHeight={EXERCISE_REORDER_ROW_HEIGHT}
              gap={spacing.sm}
              onDragActiveChange={setReorderDragging}
              onReorder={handleReorderExercises}
              renderItem={renderReorderRow}
            />
          </ScrollView>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={exercises}
        keyExtractor={(item) => item.uid}
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        // iOS: automatically adjusts scroll space for the keyboard;
        // scrollFocusedInputAboveKeyboard does the actual scrolling. A static
        // contentInset used to add extra bottom clearance here too, but it
        // fights automaticallyAdjustKeyboardInsets for control of the same
        // native inset (both manage UIScrollView.contentInset) and could
        // leave the scroll view stuck past the end of content until the
        // screen remounted. styles.container's paddingBottom (spacing.xl*2 =
        // 64pt) already covers the clearance that contentInset was adding.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
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
            onAutoStartRestChange={onAutoStartRestChange}
            vibrateOnComplete={vibrateOnComplete}
            onVibrateChange={onVibrateChange}
            showRpe={showRpe}
            onShowRpeChange={onShowRpeChange}
            showPlateCalc={showPlateCalc}
            onShowPlateCalcChange={onShowPlateCalcChange}
            repeatLastSet={repeatLastSet}
            onRepeatLastSetChange={onRepeatLastSetChange}
            prefillPreviousSets={prefillPreviousSets}
            onPrefillPreviousSetsChange={onPrefillPreviousSetsChange}
            onReorderPress={() => setReorderMode(true)}
            exerciseCount={exercises.length}
            totalSets={workoutTotals.totalSets}
            totalVolume={workoutTotals.totalVolume}
            weightUnit={weightUnit}
            activeMuscles={activeMuscles}
          />
        )}
        ListFooterComponent={(
          <View style={[styles.formSection, exercises.length === 0 && { marginTop: spacing.xl }]}>
            <TouchableOpacity style={styles.addExBtn} onPress={() => setExerciseModalVisible(true)}>
              <Ionicons name="add" size={18} color={colors.accentText} />
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
        renderItem={renderExercise}
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
          onAdjust={adjustRest}
        />
      )}

      {/* Exercise 3-dot menu — rendered as Modal so it floats above the list.
          Scales/fades in from the tapped button's corner and reverses on close;
          menuRendered keeps the Modal mounted through the close animation
          (openMenuIdx itself goes null immediately). */}
      <Modal
        visible={menuRendered}
        transparent
        animationType="none"
        onRequestClose={() => setOpenMenuIdx(null)}
      >
        {/* Gated on openMenuIdx, not menuRendered — a Modal lingering through
            its close animation (or stuck) must never keep a full-screen
            touch-catcher over the screen. */}
        {openMenuIdx !== null && (
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setOpenMenuIdx(null)}
          />
        )}
        {renderedMenuIdx !== null && (
          <Animated.View
            style={[
              styles.exMenu,
              {
                top: menuPosition.top,
                right: menuPosition.right,
                backgroundColor: colors.background,
                borderColor: colors.border,
                opacity: exMenuAnim,
                transform: [{ scale: exMenuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                transformOrigin: 'top right',
              },
            ]}
          >
            <TouchableOpacity style={styles.exMenuItem} onPress={() => openAddNotes(renderedMenuIdx!)}>
              <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Add Notes</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => {
              const ex = exercises[renderedMenuIdx!];
              setOpenMenuIdx(null);
              onViewExerciseHistory?.(ex.name, ex.exercise_template_id, {
                muscleGroup: ex.muscle_group,
                equipment: ex.equipment,
                imageUrl: ex.image_url,
              });
            }}>
              <Ionicons name="bar-chart-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>View History</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => startReplaceExercise(renderedMenuIdx!)}>
              <Ionicons name="swap-horizontal-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Replace Exercise</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[styles.exMenuItem, renderedMenuIdx === 0 && { opacity: 0.35 }]}
              onPress={() => renderedMenuIdx! > 0 && moveExercise(renderedMenuIdx!, 'up')}
            >
              <Ionicons name="arrow-up-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Move Up</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[styles.exMenuItem, renderedMenuIdx === exercises.length - 1 && { opacity: 0.35 }]}
              onPress={() => renderedMenuIdx! < exercises.length - 1 && moveExercise(renderedMenuIdx!, 'down')}
            >
              <Ionicons name="arrow-down-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.exMenuText, { color: colors.textPrimary }]}>Move Down</Text>
            </TouchableOpacity>
            <View style={[styles.exMenuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.exMenuItem} onPress={() => deleteEx(renderedMenuIdx!)}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[styles.exMenuText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          </Animated.View>
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
                <Ionicons name="barbell-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.keyboardAdjText}>Plates</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.keyboardAdjBtn, styles.keyboardNextBtn]}
              onPress={focusNextInput}
              accessibilityLabel="Next field"
            >
              <Ionicons name="checkmark" size={20} color={colors.accentText} />
            </TouchableOpacity>
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
                  <Text style={[styles.rpeItemNum, { color: selected ? colors.accentText : colors.textPrimary }]}>
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

      {/* Set Type Picker Modal */}
      <Modal
        visible={setTypePickerTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSetTypePickerTarget(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setSetTypePickerTarget(null)}
        />
        <View style={[styles.rpeModal, { backgroundColor: colors.surface }]}>
          <View style={[styles.rpeModalHandle, { backgroundColor: colors.border }]} />
          <View style={styles.rpeModalHeader}>
            <Text style={[styles.rpeModalTitle, { color: colors.textPrimary }]}>Set Type</Text>
            <TouchableOpacity onPress={() => setSetTypePickerTarget(null)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.setTypeList}>
            {SET_TYPES.map(t => {
              const current = setTypePickerTarget
                ? ((exercises[setTypePickerTarget.exIdx]?.sets[setTypePickerTarget.setIdx]?.set_type as SetType) ?? 'N')
                : 'N';
              const selected = current === t;
              const tc = SET_TYPE_COLORS[t];
              return (
                <TouchableOpacity
                  key={t}
                  style={styles.setTypeRow}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (setTypePickerTarget) {
                      applySetType(setTypePickerTarget.exIdx, setTypePickerTarget.setIdx, t);
                    }
                    setSetTypePickerTarget(null);
                  }}
                >
                  <View style={[styles.setTypeBadge, { borderColor: tc }]}>
                    <Text style={[styles.setTypeBadgeText, { color: tc }]}>{t}</Text>
                  </View>
                  <Text style={[styles.setTypeLabel, { color: colors.textPrimary }]}>{SET_TYPE_LABELS[t]}</Text>
                  {selected && (
                    <Ionicons name="checkmark" size={20} color={colors.accent} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
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
          <Ionicons name="trophy" size={22} color={PR_GOLD} />
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
  reorderContent: { padding: spacing.md, paddingBottom: spacing.xl * 2 },

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
  addExBtnText: { color: colors.accentText, fontWeight: '600', fontSize: typography.fontSize.md },

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
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keyboardAdjBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyboardNextBtn: {
    flex: 0,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  keyboardAdjText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  keyboardDismissBtn: { padding: spacing.sm },

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

  setTypeList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  setTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  setTypeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTypeBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  setTypeLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
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
    borderColor: PR_GOLD,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    shadowColor: PR_GOLD,
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
    color: PR_GOLD,
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
