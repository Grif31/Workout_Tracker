import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import ResetPasswordScreen from '../screens/Auth/ResetPasswordScreen';

jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333', inputBg: '#1c1c1e', danger: '#FF453A' } }));

const nav = createMockNavigation();
const route = createMockRoute('ResetPassword', { email: 'test@example.com' });

// Advances through step 1 into step 2 (real setTimeout(900) drives the transition).
async function getToStep2(getByText, getByPlaceholderText) {
  mockFetch({ message: 'Code verified.' }, true);
  fireEvent.changeText(getByPlaceholderText('6-digit code'), '123456');
  fireEvent.press(getByText('Verify Code'));
  await waitFor(() => expect(getByText('New Password')).toBeTruthy(), { timeout: 2000 });
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    render(<ResetPasswordScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the code-entry heading and the target email', () => {
    const { getByText } = render(<ResetPasswordScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Enter Your Code')).toBeTruthy();
    expect(getByText('test@example.com')).toBeTruthy();
  });

  describe('step 1 — verify code', () => {
    it('rejects a code that is not 6 digits without calling the API', () => {
      mockFetch({ message: 'should not be called' }, true);
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      fireEvent.changeText(getByPlaceholderText('6-digit code'), '123');
      fireEvent.press(getByText('Verify Code'));
      expect(getByText('Enter the 6-digit code from your email.')).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls verify-otp with the trimmed code and email on submit', async () => {
      mockFetch({ message: 'Code verified.' }, true);
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      fireEvent.changeText(getByPlaceholderText('6-digit code'), '123456');
      fireEvent.press(getByText('Verify Code'));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/verify-otp');
      expect(JSON.parse(init.body)).toEqual({ email: 'test@example.com', otp: '123456' });
    });

    it('shows the server-provided error on an invalid code', async () => {
      mockFetch({ message: 'Invalid or expired code.' }, false, 400);
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      fireEvent.changeText(getByPlaceholderText('6-digit code'), '000000');
      fireEvent.press(getByText('Verify Code'));
      await waitFor(() => expect(getByText('Invalid or expired code.')).toBeTruthy());
    });

    it('shows a connection error when the request throws', async () => {
      (global.fetch as jest.Mock) = jest.fn(() => Promise.reject(new Error('network down')));
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      fireEvent.changeText(getByPlaceholderText('6-digit code'), '123456');
      fireEvent.press(getByText('Verify Code'));
      await waitFor(() => expect(getByText('Could not connect. Please check your connection.')).toBeTruthy());
    });

    it('advances to the new-password step after a successful verify', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      expect(getByText('Choose a new password for your account.')).toBeTruthy();
    });

    it('resends the code and shows a confirmation', async () => {
      mockFetch({ message: 'ok' }, true);
      const { getByText } = render(<ResetPasswordScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText("Didn't receive a code? "));
      await waitFor(() => expect(getByText('Sent — check your email')).toBeTruthy());
      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/forgot-password');
    });

    it('shows a connection error if resend fails', async () => {
      (global.fetch as jest.Mock) = jest.fn(() => Promise.reject(new Error('down')));
      const { getByText } = render(<ResetPasswordScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText("Didn't receive a code? "));
      await waitFor(() => expect(getByText('Could not connect. Please check your connection.')).toBeTruthy());
    });

    it('going back from step 1 navigates away from the screen', () => {
      const { UNSAFE_getAllByType } = render(<ResetPasswordScreen navigation={nav as any} route={route as any} />);
      // The back arrow is the first TouchableOpacity rendered on step 1.
      fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);
      expect(nav.goBack).toHaveBeenCalled();
    });
  });

  describe('step 2 — new password', () => {
    it('rejects a password shorter than 6 characters without calling the API', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      jest.clearAllMocks();

      fireEvent.changeText(getByPlaceholderText('New password (min 6 chars)'), 'short');
      fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'short');
      fireEvent.press(getByText('Reset Password'));

      expect(getByText('Password must be at least 6 characters.')).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords without calling the API', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      jest.clearAllMocks();

      fireEvent.changeText(getByPlaceholderText('New password (min 6 chars)'), 'password123');
      fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'differentpw');
      fireEvent.press(getByText('Reset Password'));

      expect(getByText('Passwords do not match.')).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('submits the otp and new password, then shows the success screen', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      jest.clearAllMocks();
      mockFetch({ message: 'Password reset successfully.' }, true);

      fireEvent.changeText(getByPlaceholderText('New password (min 6 chars)'), 'newpassword456');
      fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newpassword456');
      fireEvent.press(getByText('Reset Password'));

      await waitFor(() => expect(getByText('Password Reset!')).toBeTruthy());
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/reset-password');
      expect(JSON.parse(init.body)).toEqual({
        email: 'test@example.com', otp: '123456', new_password: 'newpassword456',
      });
    });

    it('pressing "Back to Log In" on the success screen navigates to Login', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      mockFetch({ message: 'Password reset successfully.' }, true);
      fireEvent.changeText(getByPlaceholderText('New password (min 6 chars)'), 'newpassword456');
      fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newpassword456');
      fireEvent.press(getByText('Reset Password'));
      await waitFor(() => expect(getByText('Password Reset!')).toBeTruthy());

      fireEvent.press(getByText('Back to Log In'));
      expect(nav.navigate).toHaveBeenCalledWith('Login');
    });

    it('shows the server-provided error on a failed reset', async () => {
      const { getByText, getByPlaceholderText } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);
      mockFetch({ message: 'Invalid or expired code.' }, false, 400);

      fireEvent.changeText(getByPlaceholderText('New password (min 6 chars)'), 'newpassword456');
      fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newpassword456');
      fireEvent.press(getByText('Reset Password'));

      await waitFor(() => expect(getByText('Invalid or expired code.')).toBeTruthy());
    });

    it('going back from step 2 returns to the code-entry step', async () => {
      const { getByText, getByPlaceholderText, UNSAFE_getAllByType } = render(
        <ResetPasswordScreen navigation={nav as any} route={route as any} />
      );
      await getToStep2(getByText, getByPlaceholderText);

      fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);

      expect(getByText('Enter Your Code')).toBeTruthy();
    });
  });
});
