import { renderHook } from '@testing-library/react-native';
import {
  appCache, fetchStamp, isFresh, markDataChanged, useRefetchGate, FOCUS_REFETCH_TTL_MS,
} from '../utils/appCache';
import { apiFetch } from '../utils/api';

jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

function mockFetchStatus(status: number) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve({}) }),
  );
}

describe('isFresh', () => {
  afterEach(() => jest.restoreAllMocks());

  it('holds within the TTL when nothing was written', () => {
    expect(isFresh(fetchStamp())).toBe(true);
  });

  it('goes stale after any write', () => {
    const stamp = fetchStamp();
    markDataChanged();
    expect(isFresh(stamp)).toBe(false);
  });

  it('goes stale once the TTL passes', () => {
    const stamp = fetchStamp();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + FOCUS_REFETCH_TTL_MS);
    expect(isFresh(stamp)).toBe(false);
  });

  it('treats a missing stamp as stale', () => {
    expect(isFresh(null)).toBe(false);
    expect(isFresh(appCache.stampOf('never_set'))).toBe(false);
  });
});

describe('useRefetchGate', () => {
  it('skips a fresh key, and refetches after a write or when forced', async () => {
    const { result } = renderHook(() => useRefetchGate(() => ({})));
    const gate = result.current;
    const fetcher = jest.fn(() => Promise.resolve());

    await gate('k', fetcher);
    await gate('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    markDataChanged();
    await gate('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await gate('k', fetcher, true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('counts a preloaded cache entry as the first fetch', async () => {
    appCache.set('seeded', { x: 1 });
    const { result } = renderHook(() =>
      useRefetchGate(() => ({ seeded: appCache.stampOf('seeded') })),
    );
    const fetcher = jest.fn(() => Promise.resolve());
    await result.current('seeded', fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('apiFetch marks data changed', () => {
  it('after a successful write', async () => {
    const stamp = fetchStamp();
    mockFetchStatus(201);
    await apiFetch('/api/workouts', { method: 'POST' });
    expect(isFresh(stamp)).toBe(false);
  });

  it('not after a read', async () => {
    const stamp = fetchStamp();
    mockFetchStatus(200);
    await apiFetch('/api/workouts/recent');
    expect(isFresh(stamp)).toBe(true);
  });

  it('not after a rejected write', async () => {
    const stamp = fetchStamp();
    mockFetchStatus(400);
    await apiFetch('/api/workouts', { method: 'POST' });
    expect(isFresh(stamp)).toBe(true);
  });
});
