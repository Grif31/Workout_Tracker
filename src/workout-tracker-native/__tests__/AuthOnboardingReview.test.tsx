import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import { needsOnboarding, markOnboardingComplete } from '../utils/onboarding';
import PreloadScreen, { PRELOAD_MAX_WAIT_MS } from '../screens/PreloadScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import ResetPasswordScreen from '../screens/Auth/ResetPasswordScreen';

jest.mock('../hooks/useSocialAuth', () => ({
  useSocialAuth: () => ({ handleApple: jest.fn(), handleGoogle: jest.fn(), handleFacebook: jest.fn() }),
}));
jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333', inputBg: '#1c1c1e', danger: '#FF453A' } }));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('needsOnboarding', () => {
  it('onboards a new account even when another account on this phone finished it', async () => {
    await markOnboardingComplete(1);
    expect(await needsOnboarding(1, [])).toBe(false);
    expect(await needsOnboarding(2, [])).toBe(true);
  });

  it('skips it for an existing account that has logged workouts, and remembers that', async () => {
    expect(await needsOnboarding(3, [{ id: 10 }])).toBe(false);
    expect(await AsyncStorage.getItem('onboarding_complete_3')).toBe('true');
  });

  it("hands an older build's phone-wide flag to the account signed in, once", async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    expect(await needsOnboarding(4, null)).toBe(false);
    expect(await AsyncStorage.getItem('onboarding_complete')).toBeNull();
    expect(await needsOnboarding(5, null)).toBe(true);
  });
});

describe('PreloadScreen', () => {
  afterEach(() => jest.useRealTimers());

  it('opens the app anyway when a request stalls', async () => {
    jest.useFakeTimers();
    // Every request hangs forever
    (global.fetch as jest.Mock) = jest.fn(() => new Promise(() => {}));
    const onComplete = jest.fn();
    render(<PreloadScreen onComplete={onComplete} />);

    await act(async () => { jest.advanceTimersByTime(PRELOAD_MAX_WAIT_MS - 100); });
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('SignupScreen checks', () => {
  const nav = createMockNavigation();
  const route = createMockRoute('Signup');
  const fill = (r: any, username: string, email: string) => {
    fireEvent.changeText(r.getByPlaceholderText('Username'), username);
    fireEvent.changeText(r.getByPlaceholderText('e.g. john@example.com'), email);
    fireEvent.changeText(r.getByPlaceholderText('Min. 6 characters'), 'secret1');
    fireEvent.changeText(r.getByPlaceholderText('Confirm password'), 'secret1');
  };
  const submit = (r: any) => {
    const buttons = r.getAllByText('Create Account');
    fireEvent.press(buttons[buttons.length - 1]);
  };

  it('catches a malformed email before asking the server', () => {
    mockFetch({});
    const r = render(<SignupScreen navigation={nav as any} route={route as any} />);
    fill(r, 'lifter', 'lifter@gmail');
    submit(r);
    expect(r.getByText('Enter a valid email address, like name@example.com.')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('catches a one-letter username', () => {
    mockFetch({});
    const r = render(<SignupScreen navigation={nav as any} route={route as any} />);
    fill(r, 'a', 'a@b.com');
    submit(r);
    expect(r.getByText('Usernames need 2 to 50 characters.')).toBeTruthy();
  });

  it("drops the field name from the server's validation message", async () => {
    mockFetch({ message: 'username: Username already taken.' }, false, 400);
    const r = render(<SignupScreen navigation={nav as any} route={route as any} />);
    fill(r, 'lifter', 'lifter@gmail.com');
    submit(r);
    expect(await r.findByText('Username already taken.')).toBeTruthy();
  });
});

describe('ResetPasswordScreen resend', () => {
  it("doesn't claim a new code was sent when the server refuses", async () => {
    mockFetch({ message: 'Too many requests. Try again later.' }, false, 429);
    const r = render(
      <ResetPasswordScreen
        navigation={createMockNavigation() as any}
        route={createMockRoute('ResetPassword', { email: 'test@example.com' }) as any}
      />,
    );
    fireEvent.press(r.getByText('Resend'));
    expect(await r.findByText('Too many requests. Try again later.')).toBeTruthy();
    expect(r.queryByText('Sent. Check your email')).toBeNull();
  });
});
