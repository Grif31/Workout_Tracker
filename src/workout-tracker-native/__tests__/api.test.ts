import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  apiFetch, setTokens, clearTokens, registerUnauthCallback, isNetworkError,
} from '../utils/api';

jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
const { showToast } = require('../utils/toast');

type Resp = { status: number; body?: any } | Error;

function res(status: number, body: any = {}) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function queueFetch(...responses: Resp[]) {
  const fetchMock = jest.fn();
  responses.forEach(r => {
    if (r instanceof Error) fetchMock.mockImplementationOnce(() => Promise.reject(r));
    else fetchMock.mockImplementationOnce(() => Promise.resolve(res(r.status, r.body)));
  });
  (global.fetch as jest.Mock) = fetchMock;
  return fetchMock;
}

function authHeader(call: any[]) {
  return (call[1].headers as Headers).get('Authorization');
}

describe('apiFetch', () => {
  const onUnauth = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setTokens('old-access', 'old-refresh');
    registerUnauthCallback(onUnauth);
  });

  afterAll(() => clearTokens());

  it('attaches the access token', async () => {
    const fetchMock = queueFetch({ status: 200 });
    const r = await apiFetch('/api/workouts');
    expect(r.status).toBe(200);
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer old-access');
  });

  it('refreshes on 401 and retries once with the new token', async () => {
    await AsyncStorage.setItem('user', '{"id":1}');
    const fetchMock = queueFetch(
      { status: 401 },
      { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh' } },
      { status: 200, body: { ok: true } },
    );

    const r = await apiFetch('/api/workouts', { method: 'POST', body: '{}' });

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(refreshUrl).toMatch(/\/api\/refresh$/);
    expect(refreshInit.headers.Authorization).toBe('Bearer old-refresh');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
    expect(authHeader(fetchMock.mock.calls[2])).toBe('Bearer new-access');
    expect(await AsyncStorage.getItem('token')).toBe('new-access');
    expect(await AsyncStorage.getItem('refresh_token')).toBe('new-refresh');
    expect(onUnauth).not.toHaveBeenCalled();

    // The rotated refresh token is used for the next refresh.
    const next = queueFetch({ status: 401 }, { status: 200, body: { access_token: 'a3' } }, { status: 200 });
    await apiFetch('/api/workouts');
    expect(next.mock.calls[1][1].headers.Authorization).toBe('Bearer new-refresh');
  });

  it('does not retry more than once if the retry is also a 401', async () => {
    const fetchMock = queueFetch(
      { status: 401 },
      { status: 200, body: { access_token: 'new-access' } },
      { status: 401 },
    );
    const r = await apiFetch('/api/workouts');
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 422])('logs out when the refresh token is rejected with %i', async status => {
    await AsyncStorage.multiSet([['token', 'old-access'], ['refresh_token', 'old-refresh'], ['user', '{"id":1}']]);
    queueFetch({ status: 401 }, { status });

    const r = await apiFetch('/api/workouts');

    expect(r.status).toBe(401);
    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.multiGet(['token', 'refresh_token', 'user'])).toEqual([
      ['token', null], ['refresh_token', null], ['user', null],
    ]);
    // Tokens were wiped in memory too: the next request goes out without auth.
    const after = queueFetch({ status: 200 });
    await apiFetch('/api/workouts');
    expect(authHeader(after.mock.calls[0])).toBeNull();
  });

  it.each([
    ['a server error', { status: 503 }],
    ['a network failure', new TypeError('Network request failed')],
  ])('keeps the session when refresh fails with %s', async (_label, refreshResult) => {
    await AsyncStorage.multiSet([['token', 'old-access'], ['refresh_token', 'old-refresh']]);
    queueFetch({ status: 401 }, refreshResult as Resp);

    const r = await apiFetch('/api/workouts');

    expect(r.status).toBe(401);
    expect(onUnauth).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('refresh_token')).toBe('old-refresh');
    const after = queueFetch({ status: 200 });
    await apiFetch('/api/workouts');
    expect(authHeader(after.mock.calls[0])).toBe('Bearer old-access');
  });

  it('keeps the session when the refresh response body is unreadable', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad json')) });
    (global.fetch as jest.Mock) = fetchMock;

    const r = await apiFetch('/api/workouts');
    expect(r.status).toBe(401);
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it('does not try to refresh without a refresh token', async () => {
    setTokens('old-access', '');
    const fetchMock = queueFetch({ status: 401 });
    const r = await apiFetch('/api/workouts');
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it('passes through non-401 errors without refreshing', async () => {
    const fetchMock = queueFetch({ status: 500 });
    const r = await apiFetch('/api/workouts');
    expect(r.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a NetworkError and shows a toast when the request cannot be sent', async () => {
    queueFetch(new TypeError('Network request failed'));
    const err = await apiFetch('/api/workouts').catch(e => e);
    expect(isNetworkError(err)).toBe(true);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('throws a NetworkError when the retry after refresh cannot be sent', async () => {
    queueFetch(
      { status: 401 },
      { status: 200, body: { access_token: 'new-access' } },
      new TypeError('Network request failed'),
    );
    const err = await apiFetch('/api/workouts').catch(e => e);
    expect(isNetworkError(err)).toBe(true);
    expect(onUnauth).not.toHaveBeenCalled();
  });

  it('isNetworkError is false for ordinary errors', () => {
    expect(isNetworkError(new Error('nope'))).toBe(false);
    expect(isNetworkError('NetworkError')).toBe(false);
  });
});
