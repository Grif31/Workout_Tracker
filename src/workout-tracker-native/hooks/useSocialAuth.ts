import { useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import * as Facebook from 'expo-auth-session/providers/facebook';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { apiFetch, isNetworkError } from '../utils/api';

WebBrowser.maybeCompleteAuthSession();

// Fallback prevents expo-auth-session from throwing during hook init
// when credentials aren't configured yet.
const FACEBOOK_ID   = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? 'not-configured';
const facebookReady = FACEBOOK_ID !== 'not-configured';

// Native Google sign-in (Google's own account sheet), lazy-loaded: the module
// only exists in builds made since it was added, never in Expo Go, and a
// static import would crash the sign-in screens there. Client IDs come from
// app.config.js's extra.googleSignIn, which picks the dev build's on its own.
let GoogleSignIn: typeof import('@react-native-google-signin/google-signin') | null = null;
try { GoogleSignIn = require('@react-native-google-signin/google-signin'); } catch {}
type GoogleConfig = {
  iosClientId?: string | null;
  iosClientIds?: { development?: string | null; production?: string | null };
  webClientId?: string | null;
};
const googleConfig: GoogleConfig = Constants.expoConfig?.extra?.googleSignIn ?? {};

/**
 * The dev build (bundle ID ending .dev) signs in with its own iOS client. Read
 * from the installed app, not the config's iosClientId: that one is computed
 * where Metro runs, and picks the production client unless APP_VARIANT happens
 * to be set there too.
 */
export function pickIosClientId(config: GoogleConfig, bundleId: string | null | undefined): string | null {
  const byBuild = config.iosClientIds;
  if (byBuild && bundleId) return (bundleId.endsWith('.dev') ? byBuild.development : byBuild.production) ?? null;
  return config.iosClientId ?? null;
}
const iosClientId = pickIosClientId(googleConfig, Application.applicationId);
/** Whether to offer Google: iOS signs in with its own client, Android with the Web client's ID. */
export const googleAvailable = !!GoogleSignIn
  && (Platform.OS === 'ios' ? !!iosClientId : !!googleConfig.webClientId);
let googleConfigured = false;

export function useSocialAuth() {
  const { login } = useAuth();

  const [, fbResponse, promptFbAsync] = Facebook.useAuthRequest({
    clientId: FACEBOOK_ID,
  });

  const socialLogin = async (provider: string, token: string) => {
    try {
      const res = await apiFetch('/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token }),
      });
      const data = await res.json();
      if (res.ok) {
        await login(data, data.access_token, data.refresh_token);
      } else {
        Alert.alert('Sign In Failed', data.message || 'Could not sign in with social account.');
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Sign In", 'Try again in a moment.');
    }
  };

  useEffect(() => {
    if (facebookReady && fbResponse?.type === 'success') {
      const token = fbResponse.authentication?.accessToken;
      if (token) socialLogin('facebook', token);
    }
  }, [fbResponse]);

  const handleApple = async () => {
    if (Platform.OS !== 'ios') return;
    try {
      const AppleAuthentication = await import('expo-apple-authentication');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await socialLogin('apple', credential.identityToken);
      }
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign In Failed', 'Could not complete Apple sign in.');
      }
    }
  };

  const handleGoogle = async () => {
    if (!GoogleSignIn || !googleAvailable) return;
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = GoogleSignIn;
    try {
      if (!googleConfigured) {
        GoogleSignin.configure({
          iosClientId: iosClientId ?? undefined,
          webClientId: googleConfig.webClientId ?? undefined,
        });
        googleConfigured = true;
      }
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // closed the account sheet
      // The backend verifies an access token's audience against GOOGLE_CLIENT_IDS
      const { accessToken } = await GoogleSignin.getTokens();
      await socialLogin('google', accessToken);
      // Aretē keeps its own session, so Google's isn't needed: signing out of
      // it means the next Google sign-in offers the account picker again
      GoogleSignin.signOut().catch(() => {});
    } catch (err) {
      if (isErrorWithCode(err) && (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS)) return;
      // The native module's code and message are the only way to tell a client
      // ID or URL scheme mix-up from a cancelled sheet, so dev builds show them
      const detail = __DEV__ ? `

${(err as any)?.code ?? 'no code'}: ${(err as any)?.message ?? err}` : '';
      Alert.alert('Google Sign In Failed', `Could not complete Google sign in.${detail}`);
    }
  };

  const handleFacebook = () => {
    if (!facebookReady) {
      Alert.alert('Coming Soon', 'Facebook Sign In requires configuration. See setup instructions.');
      return;
    }
    promptFbAsync();
  };

  return { handleApple, handleGoogle, handleFacebook, googleAvailable };
}
