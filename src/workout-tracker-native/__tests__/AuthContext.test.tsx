/**
 * AuthContext is globally mocked in jest.setup.ts for every other test file
 * in the suite (so screens can assert "login() was called" without running
 * real auth logic). That means the REAL provider — session bootstrap, login,
 * logout's AsyncStorage cleanup, mid-session token-expiry handling — was
 * never exercised anywhere. This file unmocks it and tests the real thing.
 */
jest.mock('../utils/api', () => ({
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
  registerUnauthCallback: jest.fn(),
  apiFetch: jest.fn(),
}));
jest.mock('../utils/notifications', () => ({
  registerPushToken: jest.fn(),
  deregisterPushToken: jest.fn(),
}));
jest.mock('../context/ThemeContext', () => ({
  useTheme: jest.fn(),
  KEY_ACCENT: '@theme_accent',
}));
jest.unmock('../context/AuthContext');

import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { setTokens, clearTokens, registerUnauthCallback, apiFetch } from '../utils/api';
import { registerPushToken, deregisterPushToken } from '../utils/notifications';
import { useTheme } from '../context/ThemeContext';
import { appCache } from '../utils/appCache';

const mockApiFetch = apiFetch as jest.Mock;
const mockSetTokens = setTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;
const mockRegisterUnauthCallback = registerUnauthCallback as jest.Mock;
const mockRegisterPushToken = registerPushToken as jest.Mock;
const mockDeregisterPushToken = deregisterPushToken as jest.Mock;
const mockUseTheme = useTheme as jest.Mock;

const themeCtx = {
  accentPreset: { name: 'Green', value: '#30D158', text: '#000' },
  resetAccent: jest.fn(),
  loadAccentForUser: jest.fn(),
};

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe('AuthContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    appCache.clear();
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue(themeCtx);
    mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  });

  describe('mount / session restore', () => {
    it('finishes loading with no session when AsyncStorage has no saved token', async () => {
      const { result } = renderAuth();
      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('restores the session from /api/me when the saved token is still valid', async () => {
      await AsyncStorage.multiSet([['token', 'saved-access'], ['refresh_token', 'saved-refresh']]);
      mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 5, username: 'bob' }) });

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual({ id: 5, username: 'bob' });
      expect(result.current.token).toBe('saved-access');
      expect(mockSetTokens).toHaveBeenCalledWith('saved-access', 'saved-refresh');
      expect(await AsyncStorage.getItem('user')).toBe(JSON.stringify({ id: 5, username: 'bob' }));
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: '5' });
    });

    it('logs out fully when /api/me returns 401 (refresh already failed inside apiFetch)', async () => {
      await AsyncStorage.multiSet([
        ['token', 'saved-access'], ['refresh_token', 'saved-refresh'],
        ['user', JSON.stringify({ id: 5, username: 'bob' })],
      ]);
      mockApiFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(mockClearTokens).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('token')).toBeNull();
      expect(await AsyncStorage.getItem('user')).toBeNull();
    });

    it('falls back to the cached user on a network error instead of logging out', async () => {
      await AsyncStorage.multiSet([
        ['token', 'saved-access'], ['refresh_token', 'saved-refresh'],
        ['user', JSON.stringify({ id: 9, username: 'offline-bob' })],
      ]);
      mockApiFetch.mockRejectedValue(new Error('network down'));

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual({ id: 9, username: 'offline-bob' });
      expect(result.current.token).toBe('saved-access');
      expect(mockClearTokens).not.toHaveBeenCalled();
    });

    it('falls back to the cached user on a non-401 server error instead of logging out', async () => {
      await AsyncStorage.multiSet([
        ['token', 'saved-access'], ['refresh_token', 'saved-refresh'],
        ['user', JSON.stringify({ id: 9, username: 'offline-bob' })],
      ]);
      mockApiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.user).toEqual({ id: 9, username: 'offline-bob' });
      expect(mockClearTokens).not.toHaveBeenCalled();
    });

    it('clears user/token state when the registered unauth callback fires mid-session', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockRegisterUnauthCallback).toHaveBeenCalledWith(expect.any(Function));
      const unauthCb = mockRegisterUnauthCallback.mock.calls[0][0];

      await act(async () => {
        await result.current.login({ id: 1, username: 'bob' }, 'access-1', 'refresh-1');
      });
      expect(result.current.user).not.toBeNull();

      act(() => { unauthCb(); });
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
    });
  });

  describe('login', () => {
    it('persists tokens and user, and updates state', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login({ id: 3, username: 'alice' }, 'acc', 'ref');
      });

      expect(result.current.user).toEqual({ id: 3, username: 'alice' });
      expect(result.current.token).toBe('acc');
      expect(mockSetTokens).toHaveBeenCalledWith('acc', 'ref');
      expect(await AsyncStorage.getItem('token')).toBe('acc');
      expect(await AsyncStorage.getItem('refresh_token')).toBe('ref');
      expect(await AsyncStorage.getItem('user')).toBe(JSON.stringify({ id: 3, username: 'alice' }));
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: '3' });
      expect(mockRegisterPushToken).toHaveBeenCalled();
    });

    it("loads the incoming user's accent preset", async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login({ id: 3, username: 'alice' }, 'acc', 'ref');
      });

      expect(themeCtx.loadAccentForUser).toHaveBeenCalledWith(3);
    });

    it("clears the previous user's cache keys before starting the new session", async () => {
      await AsyncStorage.multiSet([
        ['greek_rank_cached', 'Old Rank'],
        ['coach_insights_cache', '{"stale":true}'],
      ]);
      appCache.set('some-key', 'stale-value');

      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.login({ id: 3, username: 'alice' }, 'acc', 'ref');
      });

      expect(await AsyncStorage.getItem('greek_rank_cached')).toBeNull();
      expect(await AsyncStorage.getItem('coach_insights_cache')).toBeNull();
      expect(appCache.get('some-key')).toBeNull();
    });
  });

  describe('logout', () => {
    it('saves the accent preference under the outgoing user id before resetting it', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.login({ id: 7, username: 'carl' }, 'acc', 'ref');
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(await AsyncStorage.getItem('@theme_accent_7')).toBe('Green');
      expect(themeCtx.resetAccent).toHaveBeenCalled();
    });

    it('clears React state, tokens, and every session AsyncStorage key it owns', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.login({ id: 7, username: 'carl' }, 'acc', 'ref');
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(mockClearTokens).toHaveBeenCalled();
      expect(mockDeregisterPushToken).toHaveBeenCalled();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);

      const clearedKeys = [
        'token', 'refresh_token', 'user',
        'greek_rank_cached', '@theme_accent',
        'coach_insights_cache', 'minimized_workout_session',
      ];
      for (const key of clearedKeys) {
        expect(await AsyncStorage.getItem(key)).toBeNull();
      }
    });

    it('does not throw when logging out with no active session', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.logout();
      })).resolves.not.toThrow();
      expect(result.current.user).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('merges partial fields into user state and persists the merge', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.login({ id: 4, username: 'dana', bio: null }, 'acc', 'ref');
      });

      await act(async () => {
        await result.current.updateUser({ bio: 'new bio' });
      });

      expect(result.current.user).toEqual({ id: 4, username: 'dana', bio: 'new bio' });
      expect(await AsyncStorage.getItem('user')).toBe(
        JSON.stringify({ id: 4, username: 'dana', bio: 'new bio' })
      );
    });
  });
});
