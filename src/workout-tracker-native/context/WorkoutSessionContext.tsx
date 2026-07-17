import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelLiveWorkoutNotification } from '../utils/notifications';
import { WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY } from '../components/workout/types';

export type SessionSet = {
  id?: number;
  reps: string;
  weight: string;
  set_type: string;
  done?: boolean;
};

export type SessionExercise = {
  uid: string;
  id?: number;
  name: string;
  exercise_template_id?: number;
  sets: SessionSet[];
  previousSets?: { reps: string; weight: string; set_type: string }[];
  currentPR?: {
    max_weight?: number | null;
    estimated_1rm?: number | null;
    per_weight_reps?: { weight: number; max_reps: number }[];
    max_duration?: number | null;
  };
  notes?: string;
};

export type MinimizedSession = {
  workoutName: string;
  notes: string;
  exercises: SessionExercise[];
  selectedDate: Date;
  startedAt: Date;
  baseElapsed: number;
  editMode?: boolean;
  workoutId?: number;
};

const SESSION_KEY = 'minimized_workout_session';

type WorkoutSessionCtx = {
  session: MinimizedSession | null;
  saveSession: (s: MinimizedSession) => void;
  clearSession: () => void;
  isWorkoutOpen: boolean;
  setWorkoutOpen: (open: boolean) => void;
};

const WorkoutSessionContext = createContext<WorkoutSessionCtx>({
  session: null,
  saveSession: () => {},
  clearSession: () => {},
  isWorkoutOpen: false,
  setWorkoutOpen: () => {},
});

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MinimizedSession | null>(null);
  const [isWorkoutOpen, setWorkoutOpen] = useState(false);

  // Restore any session that survived an app kill
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // JSON serialisation turns Dates into strings — convert them back
          parsed.selectedDate = new Date(parsed.selectedDate);
          parsed.startedAt    = new Date(parsed.startedAt);
          setSession(parsed);
        } catch {}
        return;
      }
      // No minimized session — the app may have been killed while a workout
      // was OPEN (not minimized). Convert the open-workout crash backup into a
      // minimized session so the MiniWorkoutBar surfaces it immediately,
      // instead of it silently waiting until WorkoutLog next mounts.
      try {
        const [[, backupRaw], [, cpRaw]] = await AsyncStorage.multiGet([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
        if (!backupRaw) return;
        const backup = JSON.parse(backupRaw);
        const exercises = backup.exercises ?? [];
        if (exercises.length === 0 && !backup.workoutName) {
          // Nothing worth resurrecting
          await AsyncStorage.multiRemove([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
          return;
        }
        let baseElapsed = 0;
        let startedAt = new Date();
        if (cpRaw) {
          try {
            const cp = JSON.parse(cpRaw);
            baseElapsed = cp.base ?? 0;
            // A running timer keeps counting from when the checkpoint was
            // written; a paused one stays frozen at its base.
            if (!cp.paused && cp.savedAt) startedAt = new Date(cp.savedAt);
          } catch {}
        }
        const restored: MinimizedSession = {
          workoutName: backup.workoutName ?? '',
          notes: backup.notes ?? '',
          exercises,
          selectedDate: new Date(backup.selectedDate ?? Date.now()),
          startedAt,
          baseElapsed,
        };
        await AsyncStorage.multiRemove([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(restored));
        setSession(restored);
      } catch {}
    })();
  }, []);

  const saveSession = useCallback((s: MinimizedSession) => {
    setSession(s);
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }, []);

  const clearSession = useCallback(() => {
    cancelLiveWorkoutNotification();
    setSession(null);
    AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  return (
    <WorkoutSessionContext.Provider value={{ session, saveSession, clearSession, isWorkoutOpen, setWorkoutOpen }}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export const useWorkoutSession = () => useContext(WorkoutSessionContext);
