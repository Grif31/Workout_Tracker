import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { APP_VERSION } from './support';

// Device-level, not per account: Apple caps the prompt per device, and a
// second account on the same phone shouldn't be asked again
export const REVIEW_PROMPT_KEY = 'review_prompt_state';

export type ReviewMoment = 'pr' | 'rank_up' | 'achievement' | 'saved';

export type ReviewPromptState = {
  firstSeenAt: number;
  savedCount: number;
  lastAskedAt: number | null;
  lastAskedVersion: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_SAVED_WORKOUTS = 3;
export const MIN_DAYS_SINCE_FIRST_SEEN = 7;
export const MIN_DAYS_BETWEEN_ASKS = 90;
// With no PR, rank-up or achievement, a steady user is asked on these saves
export const SAVED_MILESTONES = [10, 25, 50, 100];

async function readState(now: number): Promise<ReviewPromptState> {
  const raw = await AsyncStorage.getItem(REVIEW_PROMPT_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.firstSeenAt === 'number') return { lastAskedAt: null, lastAskedVersion: null, savedCount: 0, ...parsed };
    } catch {}
  }
  return { firstSeenAt: now, savedCount: 0, lastAskedAt: null, lastAskedVersion: null };
}

function writeState(state: ReviewPromptState) {
  return AsyncStorage.setItem(REVIEW_PROMPT_KEY, JSON.stringify(state));
}

// Called once per workout summary, so an imported history never counts
export async function recordWorkoutSaved(now = Date.now()): Promise<void> {
  try {
    const state = await readState(now);
    await writeState({ ...state, savedCount: state.savedCount + 1 });
  } catch {}
}

export function canAskForReview(state: ReviewPromptState, moment: ReviewMoment, now: number, version = APP_VERSION): boolean {
  if (state.savedCount < MIN_SAVED_WORKOUTS) return false;
  if (now - state.firstSeenAt < MIN_DAYS_SINCE_FIRST_SEEN * DAY_MS) return false;
  if (state.lastAskedAt != null && now - state.lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return false;
  if (state.lastAskedVersion === version) return false;
  return moment !== 'saved' || SAVED_MILESTONES.includes(state.savedCount);
}

// Apple decides whether the prompt actually shows, so an ask is recorded even
// when nothing appears: asking again sooner would only spend the yearly quota
export async function maybeRequestReview(moment: ReviewMoment, now = Date.now()): Promise<boolean> {
  try {
    const state = await readState(now);
    if (!canAskForReview(state, moment, now)) return false;
    if (!(await StoreReview.hasAction())) return false;
    await writeState({ ...state, lastAskedAt: now, lastAskedVersion: APP_VERSION });
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
