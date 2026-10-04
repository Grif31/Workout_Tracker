import React from 'react';
import { Appearance } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('../context/ThemeContext');
const { ThemeProvider, useTheme } = jest.requireActual('../context/ThemeContext');

const renderTheme = () =>
  renderHook(() => useTheme(), { wrapper: ({ children }: any) => <ThemeProvider>{children}</ThemeProvider> });

describe('theme preference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
  });
  afterEach(() => jest.restoreAllMocks());

  it('follows the system until a mode is picked', async () => {
    const { result } = renderTheme();
    await waitFor(() => expect(result.current.mode).toBe('dark'));
    expect(result.current.themePreference).toBe('system');

    act(() => result.current.setThemePreference('light'));
    expect(result.current.mode).toBe('light');
    expect(result.current.themePreference).toBe('light');
    await waitFor(async () => expect(await AsyncStorage.getItem('@theme_mode')).toBe('light'));
  });

  it('goes back to following the system after a mode was pinned', async () => {
    await AsyncStorage.setItem('@theme_mode', 'light');
    const { result } = renderTheme();
    await waitFor(() => expect(result.current.themePreference).toBe('light'));

    act(() => result.current.setThemePreference('system'));
    expect(result.current.mode).toBe('dark');
    expect(result.current.themePreference).toBe('system');
    await waitFor(async () => expect(await AsyncStorage.getItem('@theme_mode')).toBeNull());
  });
});
