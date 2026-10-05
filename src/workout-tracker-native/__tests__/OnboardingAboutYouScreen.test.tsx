import React from 'react';
import { Alert } from 'react-native';
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
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import OnboardingAboutYouScreen from '../screens/Auth/OnboardingAboutYouScreen';

const route = createMockRoute('OnboardingAboutYou');

function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<OnboardingAboutYouScreen navigation={nav as any} route={route as any} />);
  return { ...utils, nav };
}

const findCall = (pathRe: RegExp) =>
  (global.fetch as jest.Mock).mock.calls.find(([u]) => pathRe.test(String(u)));
const bodyOf = (pathRe: RegExp) => JSON.parse(findCall(pathRe)![1].body);

describe('OnboardingAboutYouScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockWeightUnit = 'lbs';
    await AsyncStorage.clear();
    mockFetch({ id: 1, username: 'testuser' });
  });

  it('Skip goes to the coach chat without saving anything', () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Skip'));
    expect(nav.navigate).toHaveBeenCalledWith('Onboarding');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('with nothing changed, Continue saves nothing to the server but still advances', async () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('gps_distance_unit_1')).toBe('mi');
  });

  it('sends units and profile in one PATCH and stores the distance unit locally', async () => {
    const { getByText, getByPlaceholderText, nav } = renderScreen();
    fireEvent.press(getByText('kg'));
    fireEvent.press(getByText('km'));
    fireEvent.changeText(getByPlaceholderText('Your name'), '  Griffin  ');
    fireEvent.press(getByText('Female'));
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
    expect(bodyOf(/\/api\/me$/)).toEqual({ weight_unit: 'kg', name: 'Griffin', gender: 'female' });
    expect(await AsyncStorage.getItem('gps_distance_unit_1')).toBe('km');
  });

  it('measures height in ft/in for lbs and cm once kg is picked', async () => {
    const { getByText, queryByText, getAllByText } = renderScreen();
    expect(getAllByText('ft').length).toBeGreaterThan(0);
    fireEvent.press(getByText('kg'));
    expect(queryByText('ft')).toBeNull();
    expect(getByText('cm')).toBeTruthy();
  });

  it('converts a cm height to inches', async () => {
    mockWeightUnit = 'kg';
    const { getByText, getByTestId, nav } = renderScreen();
    fireEvent.changeText(getByTestId('height-cm-input'), '177.8'); // 70 in
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalled());
    expect(bodyOf(/\/api\/me$/).height).toBeCloseTo(70, 5);
  });

  it('POSTs bodyweight with a local date string', async () => {
    const { getByText, getByTestId } = renderScreen();
    fireEvent.changeText(getByTestId('bodyweight-input'), '183.5');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(findCall(/\/api\/bodyweight$/)).toBeDefined());
    const body = bodyOf(/\/api\/bodyweight$/);
    expect(body.weight).toBe(183.5);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockUpdateUser).toHaveBeenCalledWith({ bodyweight: 183.5 });
  });

  it('keeps the old unit, says so, and stores the bodyweight in it when the unit change is refused', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (global.fetch as jest.Mock) = jest.fn((url: string) =>
      Promise.resolve(String(url).endsWith('/api/me')
        ? { ok: false, status: 500, json: () => Promise.resolve({}) }
        : { ok: true, status: 200, json: () => Promise.resolve({ id: 9 }) }),
    );
    const { getByText, getByTestId, nav } = renderScreen();
    fireEvent.press(getByText('kg'));
    fireEvent.changeText(getByTestId('bodyweight-input'), '80');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
    expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Your Units", expect.stringContaining('lbs'));
    // 80 kg typed, but the server still stores lbs
    expect(bodyOf(/\/api\/bodyweight$/).weight).toBeCloseTo(176.4, 1);
    expect(mockUpdateUser).not.toHaveBeenCalledWith(expect.objectContaining({ weight_unit: 'kg' }));
    alertSpy.mockRestore();
  });

  it('starts on the saved distance unit', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    const { getByText, getByRole } = renderScreen();
    await waitFor(() => expect(getByRole('button', { name: 'km' }).props.accessibilityState.selected).toBe(true));
    expect(getByRole('button', { name: 'mi' }).props.accessibilityState.selected).toBe(false);
    fireEvent.press(getByText('Continue'));
    await waitFor(async () => expect(await AsyncStorage.getItem('gps_distance_unit_1')).toBe('km'));
  });
});
