import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export const SUPPORT_EMAIL = 'support@aretefitnessapp.com';
export const PRIVACY_URL = 'https://aretefitnessapp.com/privacy';
export const TERMS_URL = 'https://aretefitnessapp.com/terms';
// Opens the App Store listing straight on the write-a-review sheet. The native
// prompt may not appear (Apple caps it), so a button can't rely on it
export const APP_STORE_REVIEW_URL = 'https://apps.apple.com/app/id6771064342?action=write-review';

// Reads the live app.config.js version so this never drifts out of sync again.
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// An over-the-air update runs a different bundle under the same version, so a
// bug report has to say which one
export function appVersionLabel(): string {
  const updateId = !Updates.isEmbeddedLaunch && Updates.updateId ? Updates.updateId.slice(0, 8) : null;
  return updateId ? `${APP_VERSION} (${updateId})` : APP_VERSION;
}

export function supportEmailUrl(): string {
  return `mailto:${SUPPORT_EMAIL}`;
}

export function bugReportUrl(userId?: number | null): string {
  const body = [
    'What happened?',
    '',
    '',
    'What did you expect to happen?',
    '',
    '',
    'Steps to make it happen again (if you know them):',
    '',
    '',
    '----',
    `App: ${appVersionLabel()}`,
    `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
    ...(userId != null ? [`Account: ${userId}`] : []),
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bug report')}&body=${encodeURIComponent(body)}`;
}

// With no mail app set up the link is refused, and the address is still what they need
export async function openSupportEmail(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Email Us', `Send your message to ${SUPPORT_EMAIL} and we'll get back to you.`);
  }
}
