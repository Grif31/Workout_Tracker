import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Vibration,
  InputAccessoryView, Keyboard, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { useActionSheet } from '@expo/react-native-action-sheet';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import ExerciseListModal from '../components/ExerciseList';
import NewExerciseForm from '../components/NewExerciseForm';
import { PrefillWorkoutData } from './WorkoutDetails';
import { muscleGroups } from 'constants/muscleGroups';

const REST_TIMER_KEY = 'default_rest_timer';
const AUTO_REST_KEY = 'workout_auto_rest';
const VIBRATE_KEY = 'workout_vibrate';
const NUMERIC_ACCESSORY_ID = 'workoutNumericDismiss';

const SET_TYPES = ['N', 'W', 'D', 'F'] as const;
type SetType = typeof SET_TYPES[number];

type WorkoutSet = {
  id?: number;
  reps: string;
  weight: string;
  set_type: SetType;
  done?: boolean;
};

type EditableSetField = 'reps' | 'weight';

type PreviousSet = { reps: string; weight: string; set_type: string };
type ExerciseEntry = {
  id?: string;
  name: string;
  exercise_template_id?: number;
  sets: WorkoutSet[];
  previousSets?: PreviousSet[];
};

type Props = {
  prefill?: PrefillWorkoutData;
  editMode?: boolean;
  workoutId?: number;
  onSubmit?: () => void;
  onCancel?: () => void;
};

// Formats seconds into a human-readable elapsed time (e.g. "42:05", "1h 3m")
function fmtElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60)}m`;
}

// Formats seconds as mm:ss for the rest countdown display
function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WorkoutLog({ prefill, editMode, workoutId, onSubmit, onCancel }: Props) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const SET_TYPE_COLORS = useMemo<Record<SetType, string>>(() => ({
    N: colors.textSecondary,
    W: '#FF9500',
    D: '#AF52DE',
    F: colors.danger,
  }), [colors]);
  const { showActionSheetWithOptions } = useActionSheet();
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const insets = useSafeAreaInsets();

  const [workoutName, setWorkoutName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Workout elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<Date>(new Date());
  const baseRef = useRef(0);

  // Rest timer
  const [defaultRest, setDefaultRest] = useState(90);
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(90);
  const [restTotal, setRestTotal] = useState(90);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session settings
  const [autoStartRest, setAutoStartRest] = useState(false);
  const [vibrateOnComplete, setVibrateOnComplete] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  // Ref so the rest-timer interval always reads the latest vibrate preference
  const vibrateRef = useRef(true);
  vibrateRef.current = vibrateOnComplete;

  // Exercise list & modals
  const [exerciseList, setExerciseList] = useState<{ id: number; name: string; muscle_group: string; equipment?: string; image_url?: string }[]>([]);
  const [recentExerciseNames, setRecentExerciseNames] = useState<string[]>([]);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_API_URL;

  // Load the user's saved rest timer duration and session settings on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(REST_TIMER_KEY),
      AsyncStorage.getItem(AUTO_REST_KEY),
      AsyncStorage.getItem(VIBRATE_KEY),
    ]).then(([timerVal, autoRestVal, vibrateVal]) => {
      const n = timerVal ? parseInt(timerVal, 10) : NaN;
      if (!isNaN(n)) { setDefaultRest(n); setRestRemaining(n); setRestTotal(n); }
      if (autoRestVal !== null) setAutoStartRest(autoRestVal === 'true');
      if (vibrateVal !== null) setVibrateOnComplete(vibrateVal !== 'false');
    });
  }, []);

  // Tick the elapsed workout timer every second (skipped in edit mode)
  useEffect(() => {
    if (editMode) return;
    startRef.current = new Date();
    const id = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [editMode]);

  // Resets the elapsed timer back to zero without stopping it
  const resetTimer = () => {
    baseRef.current = 0;
    startRef.current = new Date();
    setElapsed(0);
  };

  // Starts (or restarts) the rest countdown; vibrates when it reaches zero
  const startRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    const duration = defaultRest;
    setRestTotal(duration);
    setRestRemaining(duration);
    setRestActive(true);
    restRef.current = setInterval(() => {
      setRestRemaining(prev => {
        if (prev <= 1) {
          clearInterval(restRef.current!);
          setRestActive(false);
          if (vibrateRef.current) Vibration.vibrate([0, 300, 100, 300]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cancels the rest countdown early (Skip button)
  const stopRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    setRestActive(false);
  };

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  // Fetch the exercise library and the user's recently used exercises on mount
  useEffect(() => { fetchExercises(); fetchRecentExercises(); }, []);

  // When a prefill object is passed (edit or perform-again), hydrate the form fields
  useEffect(() => {
    if (prefill) {
      setWorkoutName(prefill.name);
      setNotes(prefill.notes);
      setExercises(
        prefill.exercises.map((ex: any) => ({
          id: ex.id,
          name: ex.name,
          sets: ex.sets.map((s: any) => ({
            id: s.id,
            reps: String(s.reps ?? ''),
            weight: String(s.weight ?? ''),
            set_type: s.set_type ?? 'N',
          })),
        }))
      );
    } else {
      setWorkoutName('');
      setNotes('');
      setExercises([]);
    }
  }, [prefill]);

  // Loads the 10 most recently used exercise names to surface them at the top of the picker
  const fetchRecentExercises = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/stats/recent-exercises`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRecentExerciseNames((await res.json()).recent ?? []);
    } catch {}
  };

  // Loads the full exercise library for the picker modal
  const fetchExercises = async () => {
    try {
      const res = await fetch(`${API_URL}/api/exercises`);
      if (res.ok) setExerciseList(await res.json());
    } catch {}
  };

  // Creates a new custom exercise in the library and refreshes the list
  const addNewExercise = async (name: string, muscle: string) => {
    if (!name.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, muscle_group: muscle }),
      });
      const data = await res.json();
      if (res.ok) { fetchExercises(); Alert.alert('Success', 'Exercise added'); }
      else Alert.alert('Error', data.message || 'Please try again');
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  // Updates a single reps or weight field on a set; no-ops if the set is already marked done
  const updateSetField = (exIndex: number, setIndex: number, field: EditableSetField, value: string) => {
    const updated = [...exercises];
    if (updated[exIndex].sets[setIndex].done) return;
    updated[exIndex].sets[setIndex][field] = value;
    setExercises(updated);
  };

  // Cycles the set type badge through N → W → D → F on tap
  const cycleSetType = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    const current = (updated[exIndex].sets[setIndex].set_type as SetType) ?? 'N';
    const next = SET_TYPES[(SET_TYPES.indexOf(current) + 1) % SET_TYPES.length];
    updated[exIndex].sets[setIndex].set_type = next;
    setExercises(updated);
  };

  // Marks a set as completed (locks inputs + green highlight); toggling again unlocks it
  // Requires both reps and weight to have a value before allowing check-off
  const toggleSetDone = (exIndex: number, setIndex: number) => {
    const set = exercises[exIndex].sets[setIndex];
    if (!set.done && (!set.reps.trim() || !set.weight.trim())) return;
    const nowDone = !set.done;
    const updated = [...exercises];
    updated[exIndex].sets[setIndex].done = nowDone;
    setExercises(updated);
    if (nowDone && autoStartRest) startRest();
  };

  // Appends a blank set row to an exercise
  const addSetToExercise = (exIndex: number) => {
    const updated = [...exercises];
    updated[exIndex].sets.push({ reps: '', weight: '', set_type: 'N' });
    setExercises(updated);
  };

  // Removes a single set row from an exercise
  const deleteSet = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    updated[exIndex].sets.splice(setIndex, 1);
    setExercises(updated);
  };

  // Removes an entire exercise block
  const deleteEx = (exIndex: number) => {
    const updated = [...exercises];
    updated.splice(exIndex, 1);
    setExercises(updated);
  };

  // Shows a 3-dot action sheet with a Remove option for the exercise
  const openExMenu = (exIndex: number) => {
    showActionSheetWithOptions(
      { options: ['Remove Exercise', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (i) => { if (i === 0) deleteEx(exIndex); }
    );
  };

  // Adds an exercise to the log immediately with one empty set, then fetches the last
  // session's sets in the background and pre-fills them if any exist
  const addExToWorkout = async (exercise: { id: number; name: string }) => {
    setExercises(prev => [
      ...prev,
      { name: exercise.name, exercise_template_id: exercise.id, sets: [{ reps: '', weight: '', set_type: 'N' }] },
    ]);
    setExerciseModalVisible(false);

    try {
      const res = await fetch(
        `${API_URL}/api/stats/exercise/last-session?name=${encodeURIComponent(exercise.name)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.sets?.length > 0) {
          setExercises(prev => {
            const updated = [...prev];
            let idx = -1;
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].name === exercise.name && updated[i].sets.length === 1 && updated[i].sets[0].reps === '') {
                idx = i;
                break;
              }
            }
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                sets: data.sets.map((s: any) => ({
                  reps: s.reps,
                  weight: s.weight,
                  set_type: s.set_type ?? 'N',
                })),
                previousSets: data.sets,
              };
            }
            return updated;
          });
        }
      }
    } catch {}
  };

  // Validates and POSTs (or PATCHes) the workout; shows a PR alert if any records were broken
  const submitWorkout = async () => {
    if (!token) return;
    const payload = {
      workoutName,
      notes,
      date: selectedDate.toISOString().split('T')[0],
      duration: editMode ? undefined : Math.floor(elapsed / 60),
      exercises: exercises.map((ex, exIndex) => ({
        id: ex.id,
        name: ex.name,
        exercise_template_id: ex.exercise_template_id,
        order: exIndex,
        sets: ex.sets.map((s, setIndex) => ({
          id: s.id,
          reps: Number(s.reps),
          weight: Number(s.weight),
          order: setIndex,
          set_type: s.set_type ?? 'N',
        })),
      })),
    };
    const isEditing = Boolean(editMode && workoutId);
    try {
      const res = await fetch(
        isEditing ? `${API_URL}/api/workouts/${workoutId}` : `${API_URL}/api/workouts`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.message || 'Please try again'); return; }
      if (!isEditing && data.new_prs?.length > 0) {
        const names = [...new Set<string>(data.new_prs.map((pr: any) => pr.exercise_name as string))];
        Alert.alert('New Personal Record! 🏆', names.map(n => `• ${n}`).join('\n'));
      }
      if (onSubmit) onSubmit();
    } catch { Alert.alert('Error', 'Something went wrong'); }
  };

  // Renders the red "Delete" action revealed when swiping a set left
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
        {onCancel ? (
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={styles.headerBtn} />}
        <Text style={styles.headerTitle}>{editMode ? 'Edit Workout' : 'Log Workout'}</Text>
        <TouchableOpacity onPress={submitWorkout} style={styles.headerBtn}>
          <Text style={styles.saveText}>{editMode ? 'Update' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

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

        {/* Date selector */}
        <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.dateText}>
            {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(_event: any, date?: Date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) setSelectedDate(date);
            }}
          />
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

        {/* Workout Settings */}
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => setSettingsExpanded(e => !e)}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.settingsRowLabel}>Workout Settings</Text>
          <Ionicons
            name={settingsExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

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
          </View>
        )}

        {/* Workout summary: exercise count + total volume */}
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

        <ExerciseListModal
          visible={exerciseModalVisible}
          onClose={() => setExerciseModalVisible(false)}
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

        {exercises.length > 0 && <Text style={styles.sectionLabel}>Exercises</Text>}

        {exercises.map((exercise, exIndex) => {
          return (
            <View key={exIndex} style={styles.exerciseBlock}>

                {/* Exercise header: name, rest timer, 3-dot menu */}
                <View style={styles.exHeaderRow}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity onPress={startRest} style={styles.exTimerBtn}>
                      <Ionicons name="timer-outline" size={20} color={colors.save} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openExMenu(exIndex)} style={styles.exTimerBtn}>
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <>
                    {/* Column headers */}
                    <View style={styles.setHeaderRow}>
                      <Text style={[styles.setHeaderCell, styles.colSetType]}>#</Text>
                      <Text style={[styles.setHeaderCell, styles.colPrev]}>Prev</Text>
                      <Text style={[styles.setHeaderCell, styles.colInput]}>Reps</Text>
                      <Text style={[styles.setHeaderCell, styles.colInput]}>{weightUnit}</Text>
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

                          {/* Combined set# / type badge */}
                          <TouchableOpacity
                            style={[styles.setTypeBadge, styles.colSetType, { borderColor: tc }]}
                            onPress={() => !isDone && cycleSetType(exIndex, setIndex)}
                          >
                            <Text style={[styles.setTypeBadgeNum, { color: tc }]}>{setIndex + 1}</Text>
                            {type !== 'N' && <Text style={[styles.setTypeBadgeLabel, { color: tc }]}>{type}</Text>}
                          </TouchableOpacity>

                          {/* Previous cell */}
                          <Text style={[styles.prevCellText, styles.colPrev]}>{prevText}</Text>

                          {/* Reps input */}
                          <TextInput
                            style={[styles.setInput, styles.colInput, isDone && styles.setInputDone]}
                            placeholder="—"
                            placeholderTextColor={colors.placeholder}
                            keyboardType="numeric"
                            inputAccessoryViewID={Platform.OS === 'ios' ? NUMERIC_ACCESSORY_ID : undefined}
                            editable={!isDone}
                            value={set.reps}
                            onChangeText={val => updateSetField(exIndex, setIndex, 'reps', val)}
                          />

                          {/* Weight input */}
                          <TextInput
                            style={[styles.setInput, styles.colInput, isDone && styles.setInputDone]}
                            placeholder="—"
                            placeholderTextColor={colors.placeholder}
                            keyboardType="numeric"
                            editable={!isDone}
                            value={set.weight}
                            onChangeText={val => updateSetField(exIndex, setIndex, 'weight', val)}
                          />

                          {/* Done checkbox */}
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
            </View>
          );
        })}

        <TouchableOpacity style={styles.addExBtn} onPress={() => setExerciseModalVisible(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addExBtnText}>Add Exercise</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rest timer overlay */}
      {restActive && (
        <View style={[styles.restOverlay, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>Rest</Text>
            <Text style={styles.restCountdown}>{fmtCountdown(restRemaining)}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <TouchableOpacity style={styles.restSkipBtn} onPress={stopRest}>
              <Text style={styles.restSkipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.keyboardAccessory}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.keyboardDismissBtn}>
              <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl * 2 },

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

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
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
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },

  exHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  exerciseName: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  exTimerBtn: { padding: 4 },

  exTabBar: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  exTab: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  exTabActive: { backgroundColor: colors.background },
  exTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  exTabTextActive: { color: colors.textPrimary },

  prevRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prevRowText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  noHistoryText: {
    fontSize: typography.fontSize.sm,
    color: colors.placeholder,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  colSetType: { width: 40 },
  colPrev: { flex: 1 },
  colInput: { flex: 1, marginHorizontal: 4 },
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
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
  },
  restCard: {
    backgroundColor: colors.textPrimary,
    borderRadius: spacing.md,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  restTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  restCountdown: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 4,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.save,
    borderRadius: 2,
  },
  restSkipBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  restSkipText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },

  keyboardAccessory: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'flex-end',
  },
  keyboardDismissBtn: { padding: spacing.xs },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsRowLabel: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
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
});
