import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';
import { apiFetch } from '../utils/api';
import { TOKEN_KEY, REFRESH_TOKEN_KEY } from '../constants/storageKeys';

const secure: Map<string, string> = require('expo-secure-store').__store;

jest.mock('navigation/types', () => ({}), { virtual: true });
// saveTokens stays real: the point is that the new pair reaches storage.
jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  apiFetch: jest.fn(),
}));

const nav = createMockNavigation();
const route = createMockRoute('ChangePassword');
const mockApiFetch = apiFetch as jest.Mock;

function fillAndSave(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'password123');
  fireEvent.changeText(screen.getByPlaceholderText('New password (min 6 chars)'), 'newpassword456');
  fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'newpassword456');
  fireEvent.press(screen.getByText('Save Password'));
}

describe('ChangePasswordScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    secure.clear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders without crashing', () => {
    render(<ChangePasswordScreen navigation={nav as any} route={route as any} />);
  });

  // The server revokes every token issued before a password change, this
  // device's included. If the replacement pair isn't stored, the next request
  // (or the next cold start) runs on a revoked token and signs the user out.
  it('stores the fresh token pair the server returns', async () => {
    secure.set(TOKEN_KEY, 'old-access');
    secure.set(REFRESH_TOKEN_KEY, 'old-refresh');
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok', access_token: 'new-access', refresh_token: 'new-refresh' }),
    });

    const screen = render(<ChangePasswordScreen navigation={nav as any} route={route as any} />);
    fillAndSave(screen);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(secure.get(TOKEN_KEY)).toBe('new-access');
    expect(secure.get(REFRESH_TOKEN_KEY)).toBe('new-refresh');
  });

  it('leaves stored tokens alone when the change fails', async () => {
    secure.set(TOKEN_KEY, 'old-access');
    secure.set(REFRESH_TOKEN_KEY, 'old-refresh');
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Current password is incorrect.' }),
    });

    const screen = render(<ChangePasswordScreen navigation={nav as any} route={route as any} />);
    fillAndSave(screen);

    await waitFor(() => expect(screen.getByText('Current password is incorrect.')).toBeTruthy());
    expect(secure.get(TOKEN_KEY)).toBe('old-access');
    expect(secure.get(REFRESH_TOKEN_KEY)).toBe('old-refresh');
  });
});
