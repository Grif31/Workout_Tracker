import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelLiveWorkoutNotification } from '../utils/notifications';

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
    AsyncStorage.getItem(SESSION_KEY).then(raw => {
      if (raw) {
        try { setSession(JSON.parse(raw)); } catch {}
      }
    });
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
