/**
 * The Progress tab's two sections: Overview opens first, and Exercises
 * mounts on its first visit and then stays, so its search survives a switch.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import ProgressScreen from '../screens/ProgressTab/ProgressScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('react-native-gifted-charts', () => ({ BarChart: () => null }));

const urlsCalled = () => (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));

async function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<ProgressScreen navigation={nav as any} route={createMockRoute('ProgressHome') as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('ProgressScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    (global.fetch as jest.Mock) = jest.fn((url: string) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const body = path.startsWith('/api/exercises')
        ? [{ id: 1, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell' }]
        : null;
      return Promise.resolve({ ok: body != null, status: body == null ? 404 : 200, json: () => Promise.resolve(body ?? {}) });
    });
  });

  it('opens on Overview and leaves Exercises unloaded until it is picked', async () => {
    const r = await renderScreen();
    expect(r.getByText('Overview')).toBeTruthy();
    expect(r.getByText('Last week')).toBeTruthy();
    expect(r.queryByPlaceholderText('Search exercises...')).toBeNull();
    expect(urlsCalled().some(u => u.includes('/api/exercises'))).toBe(false);
  });

  it('shows the exercise list on Exercises, and keeps its search across a switch', async () => {
    const r = await renderScreen();
    fireEvent.press(r.getByText('Exercises'));
    await waitFor(() => expect(r.getByText('Bench Press')).toBeTruthy());
    fireEvent.changeText(r.getByPlaceholderText('Search exercises...'), 'bench');

    fireEvent.press(r.getByText('Overview'));
    fireEvent.press(r.getByText('Exercises'));
    expect(r.getByPlaceholderText('Search exercises...').props.value).toBe('bench');
  });
});
