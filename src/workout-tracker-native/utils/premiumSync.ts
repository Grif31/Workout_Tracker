import { Alert } from 'react-native';
import { apiFetch } from './api';

/**
 * Tells the server to check this account's Premium with RevenueCat and record
 * it, so the AI routes that refuse a free account see a purchase, a restore, a
 * promotional grant or an expiry without waiting on the webhook. Best effort:
 * the app never waits on it or shows its failure.
 */
export async function syncServerPremium(): Promise<void> {
  try {
    await apiFetch('/api/premium/sync', { method: 'POST' });
  } catch {
    // Offline or signed out: the next change in status tries again
  }
}

/**
 * An AI route answered 402 while the store says Premium: the server hasn't
 * heard about the purchase yet. Tells it and asks the user to try again,
 * rather than showing "Premium required" to someone who has paid. True when
 * handled, so the caller stops there.
 */
export function handlePremiumRequired(res: Response, isPremium: boolean): boolean {
  if (res.status !== 402 || !isPremium) return false;
  syncServerPremium();
  Alert.alert('Almost There', 'Your Premium is still reaching our servers. Try again in a moment.');
  return true;
}
