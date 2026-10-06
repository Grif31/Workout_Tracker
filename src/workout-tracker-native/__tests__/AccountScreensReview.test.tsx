/**
 * Edit Profile and Change Password after their review: height in the user's
 * own unit and never "5 ft 12", an untouched height left alone, the discard
 * guard, and a first password for an Apple/Google account.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { usePreventRemove } from '@react-navigation/native';
import { createMockNavigation, createMockRoute } from './testUtils';
import EditProfileScreen from '../screens/ProfileTab/EditProfileScreen';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';
import { inchesToFtIn } from '../utils/height';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const mockUpdateUser = jest.fn();
const mockLogout = jest.fn();
let mockUser: Record<string, any>;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser, logout: mockLogout }),
}));

const BASE_USER = {
  id: 1, email: 'test@example.com', name: 'Test User', bio: null, profile_pic_url: null,
  weight_unit: 'lbs', height: null, gender: 'male', birth_date: null, is_social_only: false,
};

// Answers by URL fragment, recording every call
function serve(routes: Record<string, { ok?: boolean; body?: any }>) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const hit = Object.entries(routes).find(([p]) => String(url).includes(p));
    const r = hit?.[1] ?? { ok: false };
    return Promise.resolve({ ok: r.ok !== false, status: r.ok === false ? 400 : 200, json: () => Promise.resolve(r.body ?? {}) });
  });
}
const callTo = (fragment: string) =>
  (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes(fragment));
const bodyOf = (fragment: string) => JSON.parse(callTo(fragment)![1].body);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { ...BASE_USER };
  serve({ '/api/me': { body: { id: 1 } } });
});

describe('height', () => {
  it('never reads as 12 inches', () => {
    expect(inchesToFtIn(71.6)).toEqual({ ft: 6, inch: 0 });
    expect(inchesToFtIn(70)).toEqual({ ft: 5, inch: 10 });
  });
});

describe('EditProfileScreen', () => {
  const renderScreen = () => {
    const nav = createMockNavigation();
    return { ...render(<EditProfileScreen navigation={nav as any} route={createMockRoute('EditProfile') as any} />), nav };
  };

  it('shows a kg user their height in cm, and saves it back as inches', async () => {
    mockUser = { ...BASE_USER, weight_unit: 'kg', height: 70 };
    const r = renderScreen();
    expect(r.getByDisplayValue('178')).toBeTruthy();
    expect(r.queryByPlaceholderText('ft')).toBeNull();

    fireEvent.changeText(r.getByDisplayValue('178'), '180');
    fireEvent.press(r.getByText('Save Changes'));
    await waitFor(() => expect(callTo('/api/me')).toBeTruthy());
    expect(bodyOf('/api/me').height).toBeCloseTo(180 / 2.54, 5);
  });

  it("leaves the stored height alone when it wasn't edited", async () => {
    // 69.685 in (177 cm) shows as 5 ft 10; saving a new name must not store 70
    mockUser = { ...BASE_USER, height: 69.685 };
    const r = renderScreen();
    fireEvent.changeText(r.getByDisplayValue('Test User'), 'New Name');
    fireEvent.press(r.getByText('Save Changes'));
    await waitFor(() => expect(callTo('/api/me')).toBeTruthy());
    const body = bodyOf('/api/me');
    expect(body).not.toHaveProperty('height');
    expect(body.name).toBe('New Name');
  });

  it('saves with no height at all, sending nothing for it', async () => {
    const r = renderScreen();
    fireEvent.changeText(r.getByDisplayValue('Test User'), '  Griffin  ');
    fireEvent.press(r.getByText('Save Changes'));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(bodyOf('/api/me')).toMatchObject({ name: 'Griffin', gender: 'male' });
    expect(bodyOf('/api/me')).not.toHaveProperty('height');
  });

  it('clears gender with "Rather not say", and warns what that turns off', async () => {
    const r = renderScreen();
    fireEvent.press(r.getByText('Rather not say'));
    expect(r.getByText(/Strength Score and Endurance Score need this/)).toBeTruthy();
    fireEvent.press(r.getByText('Save Changes'));
    await waitFor(() => expect(callTo('/api/me')).toBeTruthy());
    expect(bodyOf('/api/me').gender).toBeNull();
  });

  it('asks before unsaved edits are dropped, and not before', () => {
    const r = renderScreen();
    const blocking = () => (usePreventRemove as jest.Mock).mock.calls.at(-1)[0];
    expect(blocking()).toBe(false);
    fireEvent.changeText(r.getByDisplayValue('Test User'), 'Someone Else');
    expect(blocking()).toBe(true);
  });

  it('caps the name at what the server stores', () => {
    const r = renderScreen();
    expect(r.getByDisplayValue('Test User').props.maxLength).toBe(100);
  });
});

describe('ChangePasswordScreen for an Apple or Google account', () => {
  const renderScreen = () => {
    const nav = createMockNavigation();
    return { ...render(<ChangePasswordScreen navigation={nav as any} route={createMockRoute('ChangePassword') as any} />), nav };
  };

  beforeEach(() => { mockUser = { ...BASE_USER, is_social_only: true }; });

  it('offers to set a first password instead of asking for a current one', () => {
    const r = renderScreen();
    expect(r.getByText('Set a Password')).toBeTruthy();
    expect(r.queryByPlaceholderText('Current password')).toBeNull();
    expect(r.getByText('Email Me a Code')).toBeTruthy();
  });

  it('sets the password with the emailed code and keeps the user signed in', async () => {
    serve({
      '/api/forgot-password': {},
      '/api/reset-password': {},
      '/api/login': { body: { access_token: 'new-access', refresh_token: 'new-refresh' } },
    });
    const r = renderScreen();
    fireEvent.press(r.getByText('Email Me a Code'));
    await waitFor(() => expect(r.getByPlaceholderText('6-digit code')).toBeTruthy());
    expect(bodyOf('/api/forgot-password')).toEqual({ email: 'test@example.com' });

    fireEvent.changeText(r.getByPlaceholderText('6-digit code'), '123456');
    fireEvent.changeText(r.getByPlaceholderText('New password (min 6 chars)'), 'hunter22');
    fireEvent.changeText(r.getByPlaceholderText('Confirm new password'), 'hunter22');
    fireEvent.press(r.getByText('Set Password'));

    await waitFor(() => expect(r.nav.goBack).toHaveBeenCalled());
    expect(bodyOf('/api/reset-password')).toEqual({ email: 'test@example.com', otp: '123456', new_password: 'hunter22' });
    // The reset signs every session out, so it signs straight back in
    expect(bodyOf('/api/login')).toEqual({ identifier: 'test@example.com', password: 'hunter22' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ is_social_only: false });
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('shows the server message for a wrong code and sets nothing', async () => {
    serve({ '/api/forgot-password': {}, '/api/reset-password': { ok: false, body: { message: 'Invalid or expired code.' } } });
    const r = renderScreen();
    fireEvent.press(r.getByText('Email Me a Code'));
    await waitFor(() => expect(r.getByPlaceholderText('6-digit code')).toBeTruthy());
    fireEvent.changeText(r.getByPlaceholderText('6-digit code'), '000000');
    fireEvent.changeText(r.getByPlaceholderText('New password (min 6 chars)'), 'hunter22');
    fireEvent.changeText(r.getByPlaceholderText('Confirm new password'), 'hunter22');
    fireEvent.press(r.getByText('Set Password'));

    expect(await r.findByText('Invalid or expired code.')).toBeTruthy();
    expect(callTo('/api/login')).toBeUndefined();
    expect(r.nav.goBack).not.toHaveBeenCalled();
  });

  it('a password account still gets the normal change form', () => {
    mockUser = { ...BASE_USER, is_social_only: false };
    const r = renderScreen();
    expect(r.getByText('Change Password')).toBeTruthy();
    expect(r.getByPlaceholderText('Current password')).toBeTruthy();
    expect(r.queryByText(/Facebook/)).toBeNull();
  });
});
