import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import GpsSettingsScreen from '../screens/ProfileTab/GpsSettingsScreen';

const nav = createMockNavigation();
const route = createMockRoute('GpsSettings');

describe('GpsSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    return AsyncStorage.clear();
  });

  it('has auto-pause on and keep screen on off until changed', async () => {
    const { getByLabelText } = render(<GpsSettingsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Auto-pause').props.value).toBe(true));
    expect(getByLabelText('Keep screen on during GPS activities').props.value).toBe(false);
  });

  it('stores each switch for this account', async () => {
    const { getByLabelText } = render(<GpsSettingsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Auto-pause').props.value).toBe(true));
    fireEvent(getByLabelText('Auto-pause'), 'valueChange', false);
    fireEvent(getByLabelText('Keep screen on during GPS activities'), 'valueChange', true);
    await waitFor(async () => expect(await AsyncStorage.getItem('gps_auto_pause_1')).toBe('false'));
    expect(await AsyncStorage.getItem('gps_keep_screen_on_1')).toBe('true');
  });

  it('shows what was stored', async () => {
    await AsyncStorage.multiSet([['gps_auto_pause_1', 'false'], ['gps_keep_screen_on_1', 'true']]);
    const { getByLabelText } = render(<GpsSettingsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Auto-pause').props.value).toBe(false));
    expect(getByLabelText('Keep screen on during GPS activities').props.value).toBe(true);
  });
});
