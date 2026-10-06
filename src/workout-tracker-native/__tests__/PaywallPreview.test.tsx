/**
 * PAYWALL_PREVIEW: a dev build with no store shows a free account and sample
 * plans, so the paywall can be reviewed. It must never apply once a real
 * RevenueCat key is present.
 */
jest.mock('../constants/purchaseConfig', () => ({ REVENUECAT_IOS_KEY: '', BETA_PREMIUM: false }));
jest.mock('../constants/featureFlags', () => ({
  ...jest.requireActual('../constants/featureFlags'),
  PAYWALL_PREVIEW: true,
}));
jest.mock('../utils/notifications', () => ({ cancelTrialReminder: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: { id: 1 } })) }));
jest.unmock('../context/PurchaseContext');

import { renderHook, waitFor, act } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import { PurchaseProvider, usePurchase } from '../context/PurchaseContext';

it('gives a free account sample plans, and "buying" one unlocks premium without the store', async () => {
  const { result } = renderHook(() => usePurchase(), { wrapper: PurchaseProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.isPremium).toBe(false);
  expect(result.current.offeringsState).toBe('ready');
  const packages = result.current.offerings!.current!.availablePackages;
  expect(packages.map(p => p.packageType)).toEqual(['ANNUAL', 'MONTHLY', 'LIFETIME']);
  expect(await result.current.checkTrialEligibility(['preview.annual'])).toEqual({ 'preview.annual': true });

  let outcome: string | undefined;
  await act(async () => { outcome = await result.current.purchasePackage(packages[0]); });
  expect(outcome).toBe('purchased');
  expect(result.current.isPremium).toBe(true);
  expect(Purchases.configure).not.toHaveBeenCalled();
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});
