import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

// The native Google sign-in, with the response shapes v16 returns
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(),
    getTokens: jest.fn(() => Promise.resolve({ accessToken: 'google-access-token', idToken: 'id' })),
    signOut: jest.fn(() => Promise.resolve(null)),
  },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
  isErrorWithCode: (e: any) => e != null && typeof e.code === 'string',
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { googleSignIn: { iosClientId: 'ios-client.apps.googleusercontent.com', webClientId: 'web-client.apps.googleusercontent.com' } } },
}));
jest.mock('expo-application', () => ({ applicationId: 'com.aretefitness.app.dev' }));
jest.mock('expo-auth-session/providers/facebook', () => ({ useAuthRequest: () => [null, null, jest.fn()] }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
const mockLogin = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
jest.mock('../utils/api', () => ({ apiFetch: jest.fn(), isNetworkError: () => false }));

const { GoogleSignin } = jest.requireMock('@react-native-google-signin/google-signin');
const { apiFetch } = jest.requireMock('../utils/api');
const { useSocialAuth, googleAvailable, pickIosClientId } = require('../hooks/useSocialAuth');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('Google sign-in', () => {
  it('is offered when this platform\'s client is configured', () => {
    expect(googleAvailable).toBe(true);
    expect(renderHook(() => useSocialAuth()).result.current.googleAvailable).toBe(true);
  });

  it('signs in with the access token Google returns, then drops Google\'s own session', async () => {
    GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: { user: { email: 'a@b.com' } } });
    apiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1, access_token: 'a', refresh_token: 'r' }) });
    const { result } = renderHook(() => useSocialAuth());
    await act(() => result.current.handleGoogle());

    expect(GoogleSignin.configure).toHaveBeenCalledWith({
      iosClientId: 'ios-client.apps.googleusercontent.com',
      webClientId: 'web-client.apps.googleusercontent.com',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/social', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ provider: 'google', token: 'google-access-token' }),
    }));
    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'a', 'r');
    expect(GoogleSignin.signOut).toHaveBeenCalled();
  });

  it('does nothing when the account sheet is closed', async () => {
    GoogleSignin.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    const { result } = renderHook(() => useSocialAuth());
    await act(() => result.current.handleGoogle());
    expect(apiFetch).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('says so when Google sign-in fails, but not when it was cancelled', async () => {
    const { result } = renderHook(() => useSocialAuth());
    GoogleSignin.signIn.mockRejectedValueOnce({ code: 'SIGN_IN_CANCELLED' });
    await act(() => result.current.handleGoogle());
    expect(Alert.alert).not.toHaveBeenCalled();

    GoogleSignin.signIn.mockRejectedValueOnce({ code: 'DEVELOPER_ERROR' });
    await act(() => result.current.handleGoogle());
    expect(Alert.alert).toHaveBeenCalledWith('Google Sign In Failed', expect.stringContaining('Could not complete Google sign in.'));
  });

  it('shows the backend\'s reason when it refuses the token', async () => {
    GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: {} });
    apiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ message: 'Google token was not issued for this app' }) });
    const { result } = renderHook(() => useSocialAuth());
    await act(() => result.current.handleGoogle());
    expect(Alert.alert).toHaveBeenCalledWith('Sign In Failed', 'Google token was not issued for this app');
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe('pickIosClientId', () => {
  const config = { iosClientId: 'from-config', iosClientIds: { development: 'dev-client', production: 'prod-client' } };

  it('uses the dev client for the dev build, whatever the config evaluated to', () => {
    expect(pickIosClientId(config, 'com.aretefitness.app.dev')).toBe('dev-client');
  });

  it('uses the production client for the App Store bundle', () => {
    expect(pickIosClientId(config, 'com.aretefitness.app')).toBe('prod-client');
  });

  it('falls back to the config client when the bundle ID or the pair is missing', () => {
    expect(pickIosClientId(config, null)).toBe('from-config');
    expect(pickIosClientId({ iosClientId: 'only' }, 'com.aretefitness.app.dev')).toBe('only');
    expect(pickIosClientId({}, 'com.aretefitness.app')).toBeNull();
  });
});
