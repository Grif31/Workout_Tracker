import { Linking } from 'react-native';
import { showToast } from './toast';

// Linking.openURL() rejects (e.g. restricted/managed devices with no
// browser available) — every call site used to leave that unhandled,
// which Sentry was capturing as a hard exception instead of the harmless
// "couldn't open the link" case it actually is.
export async function openExternalLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    showToast('Could not open link');
  }
}
