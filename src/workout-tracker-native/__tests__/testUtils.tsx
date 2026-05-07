/**
 * Shared test helpers: mock values, navigation factories, and fetch stubs.
 * No jest.mock() calls here — keep this side-effect free so it can be
 * imported without surprising hoisting behaviour.
 */
import React from 'react';

// ── Mock user / auth context values ──────────────────────────────────────────

export const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  bio: null,
  bodyweight: 185,
  height: null,
  weight_unit: 'lbs',
  profile_pic_url: null,
  active_routine_id: null,
};

export const mockAuthContext = {
  user: mockUser,
  token: 'test-token',
  login: jest.fn(),
  logout: jest.fn(),
  updateUser: jest.fn(),
  loading: false,
};

export const mockThemeColors = {
  background: '#000000',
  surface: '#1C1C1E',
  border: '#3A3A3C',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB2',
  placeholder: '#636366',
  accent: '#30D158',
  accentText: '#000000',
  save: '#30D158',
  danger: '#FF453A',
};

export const mockThemeContext = {
  colors: mockThemeColors,
  scheme: 'dark' as const,
  mode: 'dark' as const,
  accent: { name: 'Green', value: '#30D158', text: '#000000' },
  accentPreset: { name: 'Green', value: '#30D158', text: '#000000' },
  setAccent: jest.fn(),
  toggleMode: jest.fn(),
  setAccentPreset: jest.fn(),
};

export const mockWorkoutSession = {
  session: null,
  saveSession: jest.fn(),
  clearSession: jest.fn(),
};

// ── Mock navigation ────────────────────────────────────────────────────────────

export function createMockNavigation(overrides = {}) {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    push: jest.fn(),
    pop: jest.fn(),
    replace: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    removeListener: jest.fn(),
    isFocused: jest.fn(() => true),
    ...overrides,
  };
}

export function createMockRoute(name: string, params: Record<string, any> = {}) {
  return { key: name, name, params };
}

// ── Fetch stub ────────────────────────────────────────────────────────────────

export function mockFetch(responseData: any, ok = true, status = 200) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(responseData),
    })
  );
}

export function mockFetchSequence(responses: Array<{ data: any; ok?: boolean }>) {
  let call = 0;
  (global.fetch as jest.Mock) = jest.fn(() => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return Promise.resolve({
      ok: r.ok !== false,
      status: r.ok === false ? 400 : 200,
      json: () => Promise.resolve(r.data),
    });
  });
}
