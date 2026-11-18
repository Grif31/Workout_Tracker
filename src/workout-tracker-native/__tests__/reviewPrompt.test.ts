import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  REVIEW_PROMPT_KEY, canAskForReview, maybeRequestReview, recordWorkoutSaved, type ReviewPromptState,
} from '../utils/reviewPrompt';

jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));
jest.mock('../utils/support', () => ({ APP_VERSION: '1.2.4' }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 18);
const ready = (over: Partial<ReviewPromptState> = {}): ReviewPromptState => ({
  firstSeenAt: NOW - 30 * DAY, savedCount: 5, lastAskedAt: null, lastAskedVersion: null, ...over,
});

describe('canAskForReview', () => {
  it('asks on a good moment once there are 3 saves over a week', () => {
    expect(canAskForReview(ready(), 'pr', NOW, '1.2.4')).toBe(true);
    expect(canAskForReview(ready({ savedCount: 2 }), 'pr', NOW, '1.2.4')).toBe(false);
    expect(canAskForReview(ready({ firstSeenAt: NOW - 6 * DAY }), 'rank_up', NOW, '1.2.4')).toBe(false);
  });

  it('waits 90 days between asks and asks once per version', () => {
    expect(canAskForReview(ready({ lastAskedAt: NOW - 89 * DAY, lastAskedVersion: '1.2.3' }), 'pr', NOW, '1.2.4')).toBe(false);
    expect(canAskForReview(ready({ lastAskedAt: NOW - 91 * DAY, lastAskedVersion: '1.2.3' }), 'pr', NOW, '1.2.4')).toBe(true);
    expect(canAskForReview(ready({ lastAskedAt: NOW - 200 * DAY, lastAskedVersion: '1.2.4' }), 'pr', NOW, '1.2.4')).toBe(false);
  });

  it('asks on a plain save only at a milestone count', () => {
    expect(canAskForReview(ready({ savedCount: 9 }), 'saved', NOW, '1.2.4')).toBe(false);
    expect(canAskForReview(ready({ savedCount: 10 }), 'saved', NOW, '1.2.4')).toBe(true);
    expect(canAskForReview(ready({ savedCount: 25 }), 'saved', NOW, '1.2.4')).toBe(true);
  });
});

describe('maybeRequestReview', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('starts the clock on the first save, so a new user is not asked', async () => {
    for (let i = 0; i < 5; i++) await recordWorkoutSaved(NOW);
    expect(await maybeRequestReview('pr', NOW)).toBe(false);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('asks, records the ask, and does not ask again in the same version', async () => {
    await AsyncStorage.setItem(REVIEW_PROMPT_KEY, JSON.stringify(ready()));
    expect(await maybeRequestReview('achievement', NOW)).toBe(true);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    const stored = JSON.parse((await AsyncStorage.getItem(REVIEW_PROMPT_KEY))!);
    expect(stored).toMatchObject({ lastAskedAt: NOW, lastAskedVersion: '1.2.4', savedCount: 5 });

    expect(await maybeRequestReview('pr', NOW + 100 * DAY)).toBe(false);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the store cannot show the prompt', async () => {
    (StoreReview.hasAction as jest.Mock).mockResolvedValueOnce(false);
    await AsyncStorage.setItem(REVIEW_PROMPT_KEY, JSON.stringify(ready()));
    expect(await maybeRequestReview('pr', NOW)).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(REVIEW_PROMPT_KEY))!).lastAskedAt).toBeNull();
  });
});
