import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import WorkoutSettingsScreen from '../screens/ProfileTab/WorkoutSettingsScreen';

const nav = createMockNavigation();
const route = createMockRoute('WorkoutSettings');
const renderScreen = () => render(<WorkoutSettingsScreen navigation={nav as any} route={route as any} />);

describe('WorkoutSettingsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("shows WorkoutLog's defaults when nothing is stored", async () => {
    const { getByLabelText, getByText } = renderScreen();
    await waitFor(() => expect(getByLabelText('Track RPE').props.value).toBe(false));
    expect(getByLabelText('Auto-start rest timer').props.value).toBe(true);
    expect(getByLabelText('Prefill previous sets').props.value).toBe(true);
    expect(getByLabelText('Repeat last set').props.value).toBe(false);
    expect(getByText('1:30')).toBeTruthy();
  });

  it('reads and writes the same per-user keys WorkoutLog uses', async () => {
    await AsyncStorage.multiSet([['workout_show_plate_calc_1', 'false'], ['default_rest_timer_1', '180']]);
    const { getByLabelText, getByText } = renderScreen();
    await waitFor(() => expect(getByLabelText('Show plate calculator').props.value).toBe(false));
    expect(getByText('3:00')).toBeTruthy();

    fireEvent(getByLabelText('Track RPE'), 'valueChange', true);
    await waitFor(async () => expect(await AsyncStorage.getItem('workout_show_rpe_1')).toBe('true'));
    expect(getByLabelText('Track RPE').props.value).toBe(true);
  });

  it('saves a new default rest time from the picker', async () => {
    const { getByLabelText, getByText } = renderScreen();
    fireEvent.press(getByLabelText('Default rest timer, 1:30'));
    fireEvent.press(getByText('2:30'));
    await waitFor(async () => expect(await AsyncStorage.getItem('default_rest_timer_1')).toBe('150'));
    expect(getByLabelText('Default rest timer, 2:30')).toBeTruthy();
  });
});
