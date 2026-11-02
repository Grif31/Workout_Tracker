import { apiFetch } from './api';
import type { PurchaseOutcome, RestoreOutcome } from '../context/PurchaseContext';

export type PaywallPlan = 'annual' | 'monthly' | 'lifetime';

export type PaywallEvent =
  | { event: 'upsell_shown'; source: string }
  | { event: 'paywall_viewed'; source?: string }
  | { event: 'plan_selected'; source?: string; plan: PaywallPlan }
  | { event: 'purchase_started'; source?: string; plan: PaywallPlan; trial: boolean }
  | { event: 'purchase'; source?: string; plan: PaywallPlan; trial: boolean; outcome: PurchaseOutcome }
  | { event: 'restore'; source?: string; outcome: RestoreOutcome };

/** RevenueCat's packageType ('ANNUAL') as the server's plan name */
export function planOf(packageType?: string): PaywallPlan | null {
  const plan = packageType?.toLowerCase();
  return plan === 'annual' || plan === 'monthly' || plan === 'lifetime' ? plan : null;
}

/**
 * One step toward Premium, for the admin's Paywall page. Fire and forget: a
 * purchase must never wait on it or fail because of it.
 */
export async function trackPaywall(e: PaywallEvent): Promise<void> {
  try {
    await apiFetch('/api/paywall/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(e),
    });
  } catch {
    // Offline or signed out: one lost step only blurs the funnel
  }
}

// A teaser re-renders on every visit to its screen; the page counts people,
// so once per source per launch is plenty
const shownThisLaunch = new Set<string>();

export function trackUpsellShown(source: string): void {
  if (shownThisLaunch.has(source)) return;
  shownThisLaunch.add(source);
  trackPaywall({ event: 'upsell_shown', source });
}

/** Tests only */
export function resetUpsellsShown(): void {
  shownThisLaunch.clear();
}
