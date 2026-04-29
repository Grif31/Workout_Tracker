import { useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

WebBrowser.maybeCompleteAuthSession();

// Fallback prevents expo-auth-session from throwing during hook init
// when credentials aren't configured yet.
const GOOGLE_ID  = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID  ?? 'not-configured';
const FACEBOOK_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID  ?? 'not-configured';
const googleReady  = GOOGLE_ID  !== 'not-configured';
const facebookReady = FACEBOOK_ID !== 'not-configured';

export function useSocialAuth() {
  const { login } = useAuth();

  // expo-auth-session requires platform-specific IDs on iOS/Android
  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    clientId:        GOOGLE_ID,
    iosClientId:     GOOGLE_ID,
    androidClientId: GOOGLE_ID,
  });

  const [, fbResponse, promptFbAsync] = Facebook.useAuthRequest({
    clientId: FACEBOOK_ID,
  });

  const socialLogin = async (provider: string, token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token }),
      });
      const data = await res.json();
      if (res.ok) {
        await login(data, data.access_token);
      } else {
        Alert.alert('Sign In Failed', data.message || 'Could not sign in with social account.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  useEffect(() => {
    if (googleReady && googleResponse?.type === 'success') {
      const token = googleResponse.authentication?.accessToken;
      if (token) socialLogin('google', token);
    }
  }, [googleResponse]);

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

  const handleGoogle = () => {
    if (!googleReady) {
      Alert.alert('Coming Soon', 'Google Sign In requires configuration. See setup instructions.');
      return;
    }
    promptGoogleAsync();
  };

  const handleFacebook = () => {
    if (!facebookReady) {
      Alert.alert('Coming Soon', 'Facebook Sign In requires configuration. See setup instructions.');
      return;
    }
    promptFbAsync();
  };

  return { handleApple, handleGoogle, handleFacebook };
}
