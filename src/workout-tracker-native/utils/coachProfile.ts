import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

export type CoachProfile = {
  goal: string;
  experience: string;
  equipment: string;
  days_per_week: number;
  session_length_min: number;
  avoid: string[];
  notes: string;
};

export const COACH_PROFILE_KEY = 'coach_profile';

// The profile a user who has never saved one is treated as having.
// CoachScreen seeds its own state from the same object and sends it to the AI
// endpoints, so a second copy would mean generation defaults that depend on
// which screen started the request.
export const DEFAULT_PROFILE: CoachProfile = {
  goal: 'general',
  experience: 'beginner',
  equipment: 'full_gym',
  days_per_week: 3,
  session_length_min: 60,
  avoid: [],
  notes: '',
};

// The device copy carries whether the server has it. Copies written before the
// profile moved to the server have no flag, which reads as not uploaded: the
// device wins the first time, so nobody loses what they set.
type StoredProfile = CoachProfile & { synced?: boolean };

const keyFor = (userId: number | string) => `${COACH_PROFILE_KEY}_${userId}`;

const FIELDS = Object.keys(DEFAULT_PROFILE) as (keyof CoachProfile)[];

function pick(source: Partial<CoachProfile>): CoachProfile {
  const merged = { ...DEFAULT_PROFILE, ...source };
  return Object.fromEntries(FIELDS.map(k => [k, merged[k]])) as CoachProfile;
}

async function readStored(userId: number | string): Promise<StoredProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeStored(userId: number | string, profile: CoachProfile, synced: boolean) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify({ ...profile, synced }));
}

async function upload(userId: number | string, profile: CoachProfile): Promise<boolean> {
  try {
    const res = await apiFetch('/api/me/coach-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) return false;
    // Only if nothing newer was saved while the request was out
    const current = await readStored(userId);
    if (current && JSON.stringify(pick(current)) === JSON.stringify(profile)) await writeStored(userId, profile, true);
    return true;
  } catch {
    return false;
  }
}

// One upload at a time per account, in the order saved: two in flight could
// reach the server out of order and leave it holding the older profile.
const uploadQueue = new Map<string, Promise<boolean>>();

function queueUpload(userId: number | string, profile: CoachProfile): Promise<boolean> {
  const id = String(userId);
  const next = (uploadQueue.get(id) ?? Promise.resolve(true)).then(() => upload(id, profile));
  uploadQueue.set(id, next);
  next.finally(() => { if (uploadQueue.get(id) === next) uploadQueue.delete(id); });
  return next;
}

/** The profile on this device, or null when this account never set one here. */
export async function loadCoachProfile(userId: number | string | undefined): Promise<CoachProfile | null> {
  if (userId == null) return null;
  const stored = await readStored(userId);
  return stored ? pick(stored) : null;
}

/**
 * Saves on the device, so the Coach reads it straight away, and sends it to the
 * server without waiting. A failed upload leaves it marked unsynced, and the
 * next sync sends it rather than pulling the server's older copy over it.
 */
export async function saveCoachProfile(userId: number | string | undefined, profile: CoachProfile): Promise<void> {
  if (userId == null) return;
  const clean = pick(profile);
  await writeStored(userId, clean, false);
  queueUpload(userId, clean);
}

const inFlight = new Map<string, Promise<CoachProfile | null>>();

/**
 * Brings the device and the server together: an unsynced device copy is
 * uploaded; otherwise the server's copy is pulled, which is how a reinstall or
 * a second phone gets its profile back. Returns the profile to use, or null
 * when neither side has one. Offline, the device copy stands.
 */
export function syncCoachProfile(userId: number | string | undefined): Promise<CoachProfile | null> {
  if (userId == null) return Promise.resolve(null);
  const id = String(userId);
  const running = inFlight.get(id);
  if (running) return running;
  const run = (async () => {
    const stored = await readStored(id);
    if (stored && !stored.synced) {
      await queueUpload(id, pick(stored));
      return pick(stored);
    }
    try {
      const res = await apiFetch('/api/me/coach-profile');
      if (!res.ok) return stored ? pick(stored) : null;
      const data = await res.json();
      if (data.profile) {
        // Anything saved while the request was out is newer than this answer,
        // even if its own upload has already marked it synced
        const now = await readStored(id);
        if (JSON.stringify(now) !== JSON.stringify(stored)) return now ? pick(now) : null;
        const server = pick(data.profile);
        await writeStored(id, server, true);
        return server;
      }
      // The server lost it (or never had it) while the device says it was sent
      if (stored) await queueUpload(id, pick(stored));
      return stored ? pick(stored) : null;
    } catch {
      return stored ? pick(stored) : null;
    }
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, run);
  return run;
}
