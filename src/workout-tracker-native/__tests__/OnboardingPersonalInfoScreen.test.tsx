import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mockFetch, mockFetchSequence, createMockNavigation, createMockRoute,
} from './testUtils';

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

import OnboardingPersonalInfoScreen from '../screens/Auth/OnboardingPersonalInfoScreen';

const route = createMockRoute('OnboardingPersonalInfo');

function renderScreen(nav = createMockNavigation()) {
  const utils = render(
    <OnboardingPersonalInfoScreen navigation={nav as any} route={route as any} />,
  );
  return { ...utils, nav };
}

function fetchCalls() {
  return (global.fetch as jest.Mock).mock.calls;
}
function findCall(pathRe: RegExp) {
  return fetchCalls().find(([url]) => pathRe.test(url));
}

describe('OnboardingPersonalInfoScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockWeightUnit = 'lbs';
    await AsyncStorage.clear();
    mockFetch({ id: 1, username: 'testuser' });
  });

  it('renders the heading', () => {
    const { getByText } = renderScreen();
    expect(getByText('Tell Us About Yourself')).toBeTruthy();
  });

  it('Skip advances to Onboarding without any API call', () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Skip'));
    expect(nav.navigate).toHaveBeenCalledWith('Onboarding');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('with nothing filled in, Continue makes no PATCH but still advances', async () => {
    const { getByText, nav } = renderScreen();
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
    expect(findCall(/\/api\/me$/)).toBeUndefined();
    expect(findCall(/\/api\/bodyweight$/)).toBeUndefined();
  });

  it('PATCHes name and imperial height (ft/in -> inches) on Continue', async () => {
    const { getByText, getByPlaceholderText, nav } = renderScreen();
    fireEvent.changeText(getByPlaceholderText('Your name'), '  Griffin  ');
    fireEvent.changeText(getByPlaceholderText('ft'), '5');
    fireEvent.changeText(getByPlaceholderText('in'), '10');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(findCall(/\/api\/me$/)).toBeDefined());
    const [, init] = findCall(/\/api\/me$/)!;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Griffin', height: 70 });
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
  });

  it('POSTs bodyweight with a local date string when a weight is entered', async () => {
    mockFetchSequence([
      { data: { id: 1 } },        // PATCH /api/me  (not sent here — no profile fields)
      { data: { id: 99 } },       // POST /api/bodyweight
    ]);
    const { getByText, getByPlaceholderText } = renderScreen();
    fireEvent.changeText(getByPlaceholderText('Your weight in lbs'), '183.5');
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(findCall(/\/api\/bodyweight$/)).toBeDefined());
    const [, init] = findCall(/\/api\/bodyweight$/)!;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.weight).toBe(183.5);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);   // local YYYY-MM-DD, never toISOString
    expect(mockUpdateUser).toHaveBeenCalledWith({ bodyweight: 183.5 });
  });

  it('ignores a non-positive weight', async () => {
    const { getByText, getByPlaceholderText, nav } = renderScreen();
    fireEvent.changeText(getByPlaceholderText('Your weight in lbs'), '0');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
    expect(findCall(/\/api\/bodyweight$/)).toBeUndefined();
  });

  it('uses a cm height field and converts to inches when the stored distance unit is km', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    const { getByText, getByPlaceholderText, queryByPlaceholderText } = renderScreen();

    await waitFor(() => expect(getByPlaceholderText('cm')).toBeTruthy());
    expect(queryByPlaceholderText('ft')).toBeNull();

    fireEvent.changeText(getByPlaceholderText('cm'), '177.8'); // 70 in
    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(findCall(/\/api\/me$/)).toBeDefined());
    const [, init] = findCall(/\/api\/me$/)!;
    expect(JSON.parse(init.body).height).toBeCloseTo(70, 5);
  });

  it('labels the weight field with the user\'s unit (kg)', () => {
    mockWeightUnit = 'kg';
    const { getByText, getByPlaceholderText } = renderScreen();
    expect(getByText('Weight (kg)')).toBeTruthy();
    expect(getByPlaceholderText('Your weight in kg')).toBeTruthy();
  });

  it('still advances to Onboarding when the API call throws', async () => {
    (global.fetch as jest.Mock) = jest.fn(() => Promise.reject(new Error('offline')));
    const { getByText, getByPlaceholderText, nav } = renderScreen();
    fireEvent.changeText(getByPlaceholderText('Your name'), 'Griffin');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Onboarding'));
  });
});
