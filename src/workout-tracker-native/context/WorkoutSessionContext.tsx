import React, { createContext, useCallback, useContext, useState } from 'react';

export type SessionSet = {
  id?: number;
  reps: string;
  weight: string;
  set_type: string;
  done?: boolean;
};

export type SessionExercise = {
  uid: string;
  id?: string;
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

type WorkoutSessionCtx = {
  session: MinimizedSession | null;
  saveSession: (s: MinimizedSession) => void;
  clearSession: () => void;
};

const WorkoutSessionContext = createContext<WorkoutSessionCtx>({
  session: null,
  saveSession: () => {},
  clearSession: () => {},
});

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<MinimizedSession | null>(null);
  const saveSession = useCallback((s: MinimizedSession) => setSession(s), []);
  const clearSession = useCallback(() => setSession(null), []);
  return (
    <WorkoutSessionContext.Provider value={{ session, saveSession, clearSession }}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export const useWorkoutSession = () => useContext(WorkoutSessionContext);
