import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_KEY } from '../constants/storageKeys';
import { SAVE_TIMEOUT_MS, apiFetch } from './api';
import { syncWorkoutToHealthKit } from './healthKit';
import { syncWorkoutToHealthConnect } from './healthConnect';
import { showToast } from './toast';

// Per-user queue: workouts queued offline by user A must never be posted with
// user B's token. Each user's queue is parked under their own key and only
// flushed while they are the logged-in user.
const LEGACY_QUEUE_KEY = 'offline_workout_queue';
const queueKey = (userId: number | string) => `offline_workout_queue_${userId}`;

// Why the server turned a workout away, kept once it is stuck
type Rejection = { status: number; message: string; at: string };

type QueueItem = { id: string; payload: object; enqueuedAt: string; attempts?: number; rejected?: Rejection };

/** A workout the server keeps refusing, kept on the phone for the user to retry or delete */
export type StuckWorkout = { id: string; name: string; date: string | null; reason: string; status: number };

export type FlushResult = { synced: number; stuck: number };

// Shared by every flush trigger (reconnect, login, the Home card's Try Now) so the wording matches.
export function announceFlushResult({ synced, stuck }: FlushResult) {
  if (synced > 0) showToast(`${synced} workout${synced > 1 ? 's' : ''} synced`);
  if (stuck > 0) showToast(`${stuck} workout${stuck > 1 ? 's' : ''} couldn't sync. ${stuck > 1 ? "They're" : "It's"} kept on Home to retry.`);
}

// A 4xx (other than auth/rate-limit) means the server won't take this payload
// as it is. After a few tries (in case of a backend hotfix) it stops being
// retried automatically, but it is never deleted: it is a workout someone did,
// and it waits on Home for them to retry or delete it (TODO.md section 22).
const MAX_REJECTED_ATTEMPTS = 3;
const isPermanentRejection = (status: number) =>
  status >= 400 && status < 500 && status !== 401 && status !== 429;

// Module-level count + subscriber list — lets AppTabs react to changes without a new Context.
// The count is every workout still on the phone, stuck ones included, so the
// tab's dot stays until each one is synced or deliberately deleted.
let _count = 0;
const _subs: Array<(n: number) => void> = [];
let _stuck = 0;
const _stuckSubs: Array<(n: number) => void> = [];

function _notify(q: QueueItem[]) {
  _count = q.length;
  _stuck = q.filter(i => i.rejected).length;
  _subs.forEach(s => s(_count));
  _stuckSubs.forEach(s => s(_stuck));
}

/** Workouts the server refused and that now wait for the user */
export function getStuckCount(): number {
  return _stuck;
}

export function onStuckCountChange(cb: (n: number) => void): () => void {
  _stuckSubs.push(cb);
  return () => {
    const i = _stuckSubs.indexOf(cb);
    if (i >= 0) _stuckSubs.splice(i, 1);
  };
}

export function getPendingCount(): number {
  return _count;
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
    const raw = await AsyncStorage.getItem(USER_KEY);
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
  _notify(q);
}

// Call on app start and login so the count reflects the current user's queue.
export async function initPendingCount(): Promise<void> {
  const key = await _currentQueueKey();
  _notify(key ? await readQueue(key) : []);
}

// The server's own words when it has some; a 4xx body is { message }
async function _rejectionMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.message === 'string' ? body.message : '';
  } catch {
    return '';
  }
}

const _stuckView = (item: QueueItem): StuckWorkout => {
  const p = item.payload as { workoutName?: string; date?: string };
  return {
    id: item.id,
    name: p.workoutName?.trim() || 'Workout',
    date: p.date ?? null,
    reason: item.rejected?.message ?? '',
    status: item.rejected?.status ?? 0,
  };
};

/** The logged-in user's stuck workouts, oldest first */
export async function getStuckWorkouts(): Promise<StuckWorkout[]> {
  const key = await _currentQueueKey();
  if (!key) return [];
  return (await readQueue(key)).filter(i => i.rejected).map(_stuckView);
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
// the next flush; one the server keeps refusing is marked stuck after
// MAX_REJECTED_ATTEMPTS and skipped from then on, but never removed. Only the
// logged-in user's queue is touched — other users' queues wait for them.
export async function flushQueue(): Promise<FlushResult> {
  const none: FlushResult = { synced: 0, stuck: 0 };
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
    let stuck = 0;
    for (const item of q) {
      // Waits for the user's Retry: sending it on every reconnect would only be refused again
      if (item.rejected) {
        remaining.push(item);
        continue;
      }
      try {
        const res = await apiFetch('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
          // A hung upload must not hold the rest of the queue
          timeoutMs: SAVE_TIMEOUT_MS,
        });
        if (res.ok) {
          synced++;
          _syncToHealth(item, userId);
        } else if (isPermanentRejection(res.status)) {
          const attempts = (item.attempts ?? 0) + 1;
          if (attempts >= MAX_REJECTED_ATTEMPTS) {
            stuck++;
            remaining.push({
              ...item,
              attempts,
              rejected: { status: res.status, message: await _rejectionMessage(res), at: new Date().toISOString() },
            });
          } else {
            remaining.push({ ...item, attempts });
          }
        } else {
          // 5xx / auth hiccup — server-side or transient, retry untouched
          remaining.push(item);
        }
      } catch {
        remaining.push(item); // network — retry next flush
      }
    }
    // `q` is a snapshot from before the POSTs. A workout saved offline while
    // they were in flight is already in storage and must not be overwritten.
    const latest = await readQueue(key);
    const addedDuringFlush = latest.filter(l => !q.some(i => i.id === l.id));
    await writeQueue(key, [...remaining, ...addedDuringFlush]);
    return { synced, stuck };
  } finally {
    _flushing = false;
  }
}

/**
 * One more try at a stuck workout, from its Retry button. Synced, it leaves the
 * queue; refused again, it stays stuck with the server's latest reason; with no
 * connection (or a flush already running) nothing changes.
 */
export async function retryStuckWorkout(id: string): Promise<'synced' | 'rejected' | 'offline'> {
  if (_flushing) return 'offline';
  _flushing = true;
  try {
    const userId = await _currentUserId();
    if (userId == null) return 'offline';
    const key = queueKey(userId);
    const item = (await readQueue(key)).find(i => i.id === id);
    if (!item) return 'synced';
    let res: Response;
    try {
      res = await apiFetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
        timeoutMs: SAVE_TIMEOUT_MS,
      });
    } catch {
      return 'offline';
    }
    const latest = await readQueue(key);
    if (res.ok) {
      _syncToHealth(item, userId);
      await writeQueue(key, latest.filter(i => i.id !== id));
      return 'synced';
    }
    if (isPermanentRejection(res.status)) {
      const rejected: Rejection = { status: res.status, message: await _rejectionMessage(res), at: new Date().toISOString() };
      await writeQueue(key, latest.map(i => (i.id === id ? { ...i, rejected } : i)));
      return 'rejected';
    }
    return 'offline';
  } finally {
    _flushing = false;
  }
}

/** Deletes a stuck workout for good. Only from its Delete button, after the user confirms. */
export async function discardStuckWorkout(id: string): Promise<void> {
  const key = await _currentQueueKey();
  if (!key) return;
  const q = await readQueue(key);
  await writeQueue(key, q.filter(i => i.id !== id || !i.rejected));
}
