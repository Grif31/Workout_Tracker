import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

const QUEUE_KEY = 'offline_workout_queue';

type QueueItem = { id: string; payload: object; enqueuedAt: string };

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

async function readQueue(): Promise<QueueItem[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

async function writeQueue(q: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  _notify(q.length);
}

// Call once on app start so the module-level count reflects persisted storage.
export async function initPendingCount(): Promise<void> {
  _notify((await readQueue()).length);
}

export async function enqueueWorkout(payload: object): Promise<void> {
  const q = await readQueue();
  q.push({ id: Date.now().toString(36), payload, enqueuedAt: new Date().toISOString() });
  await writeQueue(q);
}

// Attempts to POST each queued workout. Returns the number successfully synced.
// Failed items stay in the queue for the next flush attempt.
export async function flushQueue(): Promise<number> {
  const q = await readQueue();
  if (!q.length) return 0;
  const failed: QueueItem[] = [];
  let synced = 0;
  for (const item of q) {
    try {
      const res = await apiFetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        synced++;
      } else {
        failed.push(item);
      }
    } catch {
      failed.push(item);
    }
  }
  await writeQueue(failed);
  return synced;
}
