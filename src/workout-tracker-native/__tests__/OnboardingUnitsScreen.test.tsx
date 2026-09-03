import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';

// Re-mock AuthContext locally so we can assert on updateUser / vary weight_unit.
const mockUpdateUser = jest.fn();
let mockWeightUnit = 'lbs';
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', weight_unit: mockWeightUnit },
    token: 'test-token',
    updateUser: mockUpdateUser,
    login: jest.fn(),
    logout: jest.fn(),
    loading: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));

import OnboardingUnitsScreen from '../screens/Auth/OnboardingUnitsScreen';

const route = createMockRoute('OnboardingUnits');

function renderScreen(nav = createMockNavigation()) {
  const utils = render(<OnboardingUnitsScreen navigation={nav as any} route={route as any} />);
  return { ...utils, nav };
}

describe('OnboardingUnitsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockWeightUnit = 'lbs';
    await AsyncStorage.clear();
    mockFetch({ message: 'ok' });
  });

  it('renders the units heading', () => {
    const { getByText } = renderScreen();
    expect(getByText('Set Your Units')).toBeTruthy();
  });

  it('defaults to lbs + mi and PATCHes weight_unit lbs on continue', async () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/api\/me$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ weight_unit: 'lbs' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ weight_unit: 'lbs' });
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingPersonalInfo'));
  });

  it('sends weight_unit kg when the weight switch is toggled on', async () => {
    const { getByText, UNSAFE_getAllByType } = renderScreen();
    const RNSwitch = require('react-native').Switch;
    const [weightSwitch] = UNSAFE_getAllByType(RNSwitch);
    fireEvent(weightSwitch, 'valueChange', true);
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ weight_unit: 'kg' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ weight_unit: 'kg' });
  });

  it('persists the distance unit per-user (km) when toggled off mi', async () => {
    const { getByText, UNSAFE_getAllByType } = renderScreen();
    const RNSwitch = require('react-native').Switch;
    const switches = UNSAFE_getAllByType(RNSwitch);
    const distanceSwitch = switches[1];
    fireEvent(distanceSwitch, 'valueChange', false); // mi -> km
    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('gps_distance_unit_1', 'km'),
    );
  });

  it('defaults distance to mi (stores mi) when left untouched', async () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('gps_distance_unit_1', 'mi'),
    );
  });

  it('still advances to the next step when the API call fails', async () => {
    (global.fetch as jest.Mock) = jest.fn(() => Promise.reject(new Error('offline')));
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingPersonalInfo'));
  });

  it('pre-selects km when the stored distance unit is km', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('gps_distance_unit_1', 'km'),
    );
  });
});
