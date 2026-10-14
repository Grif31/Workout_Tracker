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
