import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';
import { syncWorkoutToHealthKit } from './healthKit';
import { syncWorkoutToHealthConnect } from './healthConnect';

// Per-user queue: workouts queued offline by user A must never be posted with
// user B's token. Each user's queue is parked under their own key and only
// flushed while they are the logged-in user.
const LEGACY_QUEUE_KEY = 'offline_workout_queue';
const queueKey = (userId: number | string) => `offline_workout_queue_${userId}`;

type QueueItem = { id: string; payload: object; enqueuedAt: string; attempts?: number };

export type FlushResult = { synced: number; dropped: number };

// A 4xx (other than auth/rate-limit) means the server will never accept this
// payload — give it a few tries in case of a backend hotfix, then drop it so
// it doesn't retry forever and pin the pending badge.
const MAX_REJECTED_ATTEMPTS = 3;
const isPermanentRejection = (status: number) =>
  status >= 400 && status < 500 && status !== 401 && status !== 429;

// Module-level count + subscriber list — lets AppTabs react to changes without a new Context.
let _count = 0;
const _subs: Array<(n: number) => void> = [];

function _notify(n: number) {
  _count = n;
  _subs.forEach(s => s(n));
}

export function onPendingCountChange(cb: (n: number) => void): () => void {
  _subs.push(cb);
  return () => {
    const i = _subs.indexOf(cb);
    if (i >= 0) _subs.splice(i, 1);
  };
}

// Resolves the logged-in user's id from the persisted user object (the same
// record AuthContext restores sessions from). Null when logged out.
async function _currentUserId(): Promise<number | string | null> {
  try {
    const raw = await AsyncStorage.getItem('user');
    if (!raw) return null;
    const id = JSON.parse(raw)?.id;
    return id != null ? id : null;
  } catch {
    return null;
  }
}

async function _currentQueueKey(): Promise<string | null> {
  const id = await _currentUserId();
  return id != null ? queueKey(id) : null;
}

// The live save path syncs to Apple Health / Health Connect on success; do
// the same when a queued workout finally lands. The workout ended roughly
// when it was enqueued; the sync helpers no-op if the user's toggle is off.
function _syncToHealth(item: QueueItem, userId: number | string) {
  try {
    const p = item.payload as any;
    const endDate = new Date(item.enqueuedAt);
    const startDate = new Date(endDate.getTime() - (p.duration ?? 0) * 60000);
    const type: 'strength' | 'cardio' =
      (p.exercises ?? []).some((ex: any) => (ex.exercise_type || 'strength') !== 'cardio')
        ? 'strength' : 'cardio';
    if (Platform.OS === 'ios') syncWorkoutToHealthKit({ type, startDate, endDate, userId });
    else if (Platform.OS === 'android') syncWorkoutToHealthConnect({ type, startDate, endDate, userId });
  } catch {}
}

// Pre-per-user builds stored the queue under one device-level key. Fold any
// leftovers into the current user's queue — the device's logged-in user is
// the only sensible owner for them.
async function _migrateLegacy(key: string, q: QueueItem[]): Promise<QueueItem[]> {
  try {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (!legacyRaw) return q;
    const legacy: QueueItem[] = JSON.parse(legacyRaw);
    const merged = [...q, ...legacy.filter(l => !q.some(i => i.id === l.id))];
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
    return merged;
  } catch {
    return q;
  }
}

async function readQueue(key: string): Promise<QueueItem[]> {
  let q: QueueItem[];
  try {
    q = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
  } catch {
    q = [];
  }
  return _migrateLegacy(key, q);
}

async function writeQueue(key: string, q: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(q));
  _notify(q.length);
}

// Call on app start and login so the count reflects the current user's queue.
export async function initPendingCount(): Promise<void> {
  const key = await _currentQueueKey();
  _notify(key ? (await readQueue(key)).length : 0);
}

export async function enqueueWorkout(payload: object): Promise<void> {
  const key = await _currentQueueKey();
  if (!key) return; // logged out — nowhere safe to queue
  const q = await readQueue(key);
  // A double-tapped Save enqueues byte-identical payloads — one copy is enough
  const json = JSON.stringify(payload);
  if (q.some(item => JSON.stringify(item.payload) === json)) return;
  q.push({ id: Date.now().toString(36), payload, enqueuedAt: new Date().toISOString() });
  await writeQueue(key, q);
}

// NetInfo fires several events in quick succession on reconnect; overlapping
// flushes would each POST the full queue and duplicate every workout.
let _flushing = false;

// Attempts to POST each queued workout. Failed items stay in the queue for
// the next flush — except permanent rejections, which are dropped after
// MAX_REJECTED_ATTEMPTS. Only the logged-in user's queue is touched — other
// users' queues wait for them.
export async function flushQueue(): Promise<FlushResult> {
  const none: FlushResult = { synced: 0, dropped: 0 };
  if (_flushing) return none;
  _flushing = true;
  try {
    const userId = await _currentUserId();
    if (userId == null) return none;
    const key = queueKey(userId);
    const q = await readQueue(key);
    if (!q.length) return none;
    const remaining: QueueItem[] = [];
    let synced = 0;
    let dropped = 0;
    for (const item of q) {
      try {
        const res = await apiFetch('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          synced++;
          _syncToHealth(item, userId);
        } else if (isPermanentRejection(res.status)) {
          const attempts = (item.attempts ?? 0) + 1;
          if (attempts >= MAX_REJECTED_ATTEMPTS) dropped++;
          else remaining.push({ ...item, attempts });
        } else {
          // 5xx / auth hiccup — server-side or transient, retry untouched
          remaining.push(item);
        }
      } catch {
        remaining.push(item); // network — retry next flush
      }
    }
    await writeQueue(key, remaining);
    return { synced, dropped };
  } finally {
    _flushing = false;
  }
}
