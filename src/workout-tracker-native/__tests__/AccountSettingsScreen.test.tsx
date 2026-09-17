import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import AccountSettingsScreen from '../screens/ProfileTab/AccountSettingsScreen';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 } } }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const { logout } = require('../context/AuthContext').useAuth();
const nav = createMockNavigation();
const route = createMockRoute('AccountSettings');

type AlertButton = { text?: string; onPress?: () => void | Promise<void> };

// Plays through the two-step confirmation, pressing `choices` in order.
function answerAlerts(...choices: string[]) {
  const queue = [...choices];
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons?: AlertButton[]) => {
    const choice = queue.shift();
    if (!choice) return;
    buttons?.find(b => b.text === choice)?.onPress?.();
  });
}

function mockDeleteResponse(result: { status: number } | Error) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve({ ok: result.status < 300, status: result.status, json: () => Promise.resolve({}) }),
  );
}

const deleteCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => String(url).endsWith('/api/me') && init?.method === 'DELETE');

const renderScreen = () => render(<AccountSettingsScreen navigation={nav as any} route={route as any} />);

describe('AccountSettingsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteResponse({ status: 200 });
  });
  afterEach(() => alertSpy?.mockRestore());

  describe('Delete Account', () => {
    it('deletes the account and logs out after both confirmations', async () => {
      alertSpy = answerAlerts('Delete Account', 'Delete Forever');
      const { getByText } = renderScreen();

      fireEvent.press(getByText('Delete Account'));

      await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
      expect(deleteCalls()).toHaveLength(1);
      expect(alertSpy.mock.calls.map(c => c[0])).toEqual(['Delete Account', 'Are you sure?']);
    });

    it('names the account and does not ask for input it never collects', () => {
      alertSpy = answerAlerts('Delete Account');
      const { getByText } = renderScreen();
      fireEvent.press(getByText('Delete Account'));

      const confirm = alertSpy.mock.calls[1][1] as string;
      expect(confirm).toContain('test@example.com');
      expect(confirm).not.toMatch(/type/i);
    });

    it.each(['first', 'second'])('does nothing when cancelled at the %s confirmation', async step => {
      alertSpy = step === 'first' ? answerAlerts('Cancel') : answerAlerts('Delete Account', 'Cancel');
      const { getByText } = renderScreen();

      fireEvent.press(getByText('Delete Account'));
      await new Promise(r => setImmediate(r));

      expect(deleteCalls()).toHaveLength(0);
      expect(logout).not.toHaveBeenCalled();
    });

    it.each([400, 500, 503])('stays logged in and explains when the server returns %i', async status => {
      mockDeleteResponse({ status });
      alertSpy = answerAlerts('Delete Account', 'Delete Forever');
      const { getByText } = renderScreen();

      fireEvent.press(getByText('Delete Account'));

      await waitFor(() => expect(alertSpy.mock.calls.map(c => c[0])).toContain("Couldn't Delete Account"));
      expect(logout).not.toHaveBeenCalled();
    });

    it('stays logged in without a second alert on a network failure', async () => {
      mockDeleteResponse(new TypeError('Network request failed'));
      alertSpy = answerAlerts('Delete Account', 'Delete Forever');
      const { getByText } = renderScreen();

      fireEvent.press(getByText('Delete Account'));

      await waitFor(() => expect(deleteCalls()).toHaveLength(1));
      await new Promise(r => setImmediate(r));
      expect(logout).not.toHaveBeenCalled();
      expect(alertSpy.mock.calls.map(c => c[0])).toEqual(['Delete Account', 'Are you sure?']);
    });
  });

  describe('Log Out', () => {
    it('logs out after confirming', () => {
      alertSpy = answerAlerts('Log Out');
      const { getByText } = renderScreen();
      fireEvent.press(getByText('Log Out'));
      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('stays logged in when cancelled', () => {
      alertSpy = answerAlerts('Cancel');
      const { getByText } = renderScreen();
      fireEvent.press(getByText('Log Out'));
      expect(logout).not.toHaveBeenCalled();
    });
  });
});
