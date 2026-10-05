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

  it("leaves the server alone when the weight unit isn't changed", async () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingPersonalInfo'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('keeps the old unit, and says so, when the server rejects the change', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    mockFetch({ message: 'boom' }, false, 500);
    const { getByText, UNSAFE_getAllByType, nav } = renderScreen();
    const [weightSwitch] = UNSAFE_getAllByType(require('react-native').Switch);
    fireEvent(weightSwitch, 'valueChange', true);
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingPersonalInfo'));
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Weight Unit", expect.stringContaining('lbs'));
    alertSpy.mockRestore();
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
    fireEvent(distanceSwitch, 'valueChange', true); // mi -> km
    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('gps_distance_unit_1', 'km'),
    );
  });

  it('puts lbs and mi on the same side of their toggles', async () => {
    const { UNSAFE_getAllByType } = renderScreen();
    const RNSwitch = require('react-native').Switch;
    const [weightSwitch, distanceSwitch] = UNSAFE_getAllByType(RNSwitch);
    // Both default to imperial, so both start off: lbs and mi share the left
    expect(weightSwitch.props.value).toBe(false);
    expect(distanceSwitch.props.value).toBe(false);
  });

  it('defaults distance to mi (stores mi) when left untouched', async () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('gps_distance_unit_1', 'mi'),
    );
  });

  it('still advances to the next step when the API call fails', async () => {
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    (global.fetch as jest.Mock) = jest.fn(() => Promise.reject(new Error('offline')));
    const { getByText, nav, UNSAFE_getAllByType } = renderScreen();
    fireEvent(UNSAFE_getAllByType(require('react-native').Switch)[0], 'valueChange', true);
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('OnboardingPersonalInfo'));
  });

  it('pre-selects km when the stored distance unit is km', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    const { getByText, UNSAFE_getAllByType } = renderScreen();
    await waitFor(() => expect(UNSAFE_getAllByType(require('react-native').Switch)[1].props.value).toBe(true));
    fireEvent.press(getByText('Continue'));
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('gps_distance_unit_1', 'km'),
    );
  });
});
