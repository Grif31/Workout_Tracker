import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelLiveWorkoutNotification } from '../utils/notifications';
import { endLiveActivity } from '../utils/liveActivity';
import { WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY } from '../components/workout/types';
import { SESSION_KEY, SESSION_KEY_FOR } from '../constants/storageKeys';
import { useAuth } from './AuthContext';

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
  // When baseElapsed was measured, not when the workout began.
  startedAt: Date;
  baseElapsed: number;
  timerPaused?: boolean;
  editMode?: boolean;
  workoutId?: number;
  // The workout's Workout.client_id, so a save retried after a resume is still
  // recognised as the same workout. Absent in sessions saved by older builds.
  clientId?: string;
  // The account it belongs to. Absent in sessions saved by older builds.
  ownerId?: number;
};

// JSON turns the Dates into strings
function reviveSession(parsed: any): MinimizedSession {
  parsed.selectedDate = new Date(parsed.selectedDate);
  parsed.startedAt    = new Date(parsed.startedAt);
  return parsed;
}

export function sessionElapsedSeconds(
  s: Pick<MinimizedSession, 'baseElapsed' | 'startedAt' | 'timerPaused'>,
  now: number = Date.now(),
): number {
  if (s.timerPaused) return s.baseElapsed;
  return s.baseElapsed + Math.floor((now - s.startedAt.getTime()) / 1000);
}

export { SESSION_KEY };

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
  const { user } = useAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const userIdRef = useRef<number | undefined>(user?.id);
  userIdRef.current = user?.id;

  // Cold launch with no workout to resume: a Live Activity still up from a
  // killed app (or a save that never reached its cleanup) has no owner
  useEffect(() => {
    AsyncStorage.multiGet([SESSION_KEY, WORKOUT_BACKUP_KEY]).then(([[, minimized], [, backup]]) => {
      if (!minimized && !backup) endLiveActivity();
    }).catch(() => {});
  }, []);

  // This provider outlives a sign-out, and an app relaunched signed out still
  // finds the last account's workout on disk. So nothing is restored until an
  // account signs in, and only its own workout: one stored for another account
  // moves to that account's key. A sign-out stashes the workout in memory
  // under its owner's key, as a GPS run does. Untagged copies (older builds)
  // go to whoever signs in.
  useEffect(() => {
    const ownerId = user?.id;
    if (ownerId == null) return;
    let cancelled = false;
    const show = (s: MinimizedSession) => {
      if (cancelled || sessionRef.current) return;
      setSession(s);
      AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)).catch(() => {});
    };
    (async () => {
      const [[, minimized], [, stashed]] = await AsyncStorage.multiGet([SESSION_KEY, SESSION_KEY_FOR(ownerId)]);
      for (const [key, raw] of [[SESSION_KEY, minimized], [SESSION_KEY_FOR(ownerId), stashed]] as const) {
        if (!raw) continue;
        let parsed: MinimizedSession;
        try { parsed = reviveSession(JSON.parse(raw)); } catch { continue; }
        await AsyncStorage.removeItem(key);
        if (parsed.ownerId != null && parsed.ownerId !== ownerId) {
          await AsyncStorage.setItem(SESSION_KEY_FOR(parsed.ownerId), raw);
          continue;
        }
        show({ ...parsed, ownerId });
        return;
      }
      // No minimized session: the app may have been killed while a workout was
      // OPEN. Turn its crash backup into a minimized session so the
      // MiniWorkoutBar shows it now, not whenever WorkoutLog next mounts.
      const [[, backupRaw], [, cpRaw]] = await AsyncStorage.multiGet([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
      if (!backupRaw) return;
      const backup = JSON.parse(backupRaw);
      const exercises = backup.exercises ?? [];
      if (exercises.length === 0 && !backup.workoutName) {
        await AsyncStorage.multiRemove([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
        endLiveActivity();
        return;
      }
      let baseElapsed = 0;
      let startedAt = new Date();
      let timerPaused = false;
      if (cpRaw) {
        try {
          const cp = JSON.parse(cpRaw);
          baseElapsed = cp.base ?? 0;
          timerPaused = !!cp.paused;
          // A running timer keeps counting from when the checkpoint was
          // written; a paused one stays frozen at its base.
          if (!cp.paused && cp.savedAt) startedAt = new Date(cp.savedAt);
        } catch {}
      }
      const backupOwner = typeof backup.ownerId === 'number' ? backup.ownerId : ownerId;
      const restored: MinimizedSession = {
        workoutName: backup.workoutName ?? '',
        notes: backup.notes ?? '',
        exercises,
        selectedDate: new Date(backup.selectedDate ?? Date.now()),
        startedAt,
        baseElapsed,
        timerPaused,
        clientId: typeof backup.clientId === 'string' ? backup.clientId : undefined,
        ownerId: backupOwner,
      };
      await AsyncStorage.multiRemove([WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY]);
      if (backupOwner !== ownerId) {
        await AsyncStorage.setItem(SESSION_KEY_FOR(backupOwner), JSON.stringify(restored));
        return;
      }
      show(restored);
    })().catch(() => {});
    return () => {
      cancelled = true;
      const held = sessionRef.current;
      if (!held) return;
      AsyncStorage.setItem(SESSION_KEY_FOR(ownerId), JSON.stringify({ ...held, ownerId })).catch(() => {});
      setSession(null);
    };
  }, [user?.id]);

  const saveSession = useCallback((s: MinimizedSession) => {
    setSession(s);
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, ownerId: userIdRef.current ?? s.ownerId }));
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
