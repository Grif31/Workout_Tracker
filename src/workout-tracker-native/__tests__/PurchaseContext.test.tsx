/**
 * PurchaseContext is globally mocked in jest.setup.ts for every other test
 * file (always returns isPremium: true) so screens can test their own logic
 * without touching RevenueCat. That means the real provider has never been
 * exercised anywhere. This file unmocks it and tests the real implementation.
 *
 * This file pins the build with no RevenueCat key and beta premium on (the
 * dev and preview setup), whatever `.env` holds: the fail-closed gate, and
 * the money-path functions (purchasePackage/restorePurchases), which read
 * the SDK's returned entitlement directly. PurchaseEntitlement.test.tsx
 * covers the build with a key.
 */
jest.mock('../constants/purchaseConfig', () => ({ REVENUECAT_IOS_KEY: '', BETA_PREMIUM: true }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(() => Promise.resolve()),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
  },
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(() => ({ user: null })),
}));
jest.unmock('../context/PurchaseContext');

import { Platform } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import { useAuth } from '../context/AuthContext';
import { PurchaseProvider, usePurchase } from '../context/PurchaseContext';

const mockPurchases = Purchases as unknown as {
  configure: jest.Mock; logIn: jest.Mock; getCustomerInfo: jest.Mock;
  getOfferings: jest.Mock; purchasePackage: jest.Mock; restorePurchases: jest.Mock;
};
const mockUseAuth = useAuth as jest.Mock;
const REAL_PLATFORM_OS = Platform.OS;

function renderPurchase() {
  return renderHook(() => usePurchase(), { wrapper: PurchaseProvider });
}

describe('PurchaseContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
    (Platform as any).OS = REAL_PLATFORM_OS;
  });
  afterAll(() => {
    (Platform as any).OS = REAL_PLATFORM_OS;
  });

  describe('fail-closed gate (a build with no RevenueCat key)', () => {
    it('never calls Purchases.configure, on iOS or Android', async () => {
      (Platform as any).OS = 'ios';
      const { result: iosResult } = renderPurchase();
      await waitFor(() => expect(iosResult.current.loading).toBe(false));

      (Platform as any).OS = 'android';
      const { result: androidResult } = renderPurchase();
      await waitFor(() => expect(androidResult.current.loading).toBe(false));

      expect(mockPurchases.configure).not.toHaveBeenCalled();
    });

    it('reports that there are no plans to load, so the paywall does not wait for them', async () => {
      const { result } = renderPurchase();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.offeringsState).toBe('unavailable');
    });

    it('the beta-premium build flag forces isPremium true regardless of platform or user', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 42 } });
      const { result } = renderPurchase();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPremium).toBe(true);
    });
  });

  describe('purchasePackage', () => {
    it('sets isPremium true and reports purchased when the returned entitlement is active', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: { entitlements: { active: { premium: {} } } },
      });
      const { result } = renderPurchase();

      let purchaseResult: string | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe('purchased');
      expect(result.current.isPremium).toBe(true);
    });

    it('sets isPremium false and reports failed when the returned entitlement is not active', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });
      const { result } = renderPurchase();

      let purchaseResult: string | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe('failed');
      expect(result.current.isPremium).toBe(false);
    });

    it('reports failed and leaves isPremium unchanged when the purchase throws an unknown error', async () => {
      mockPurchases.purchasePackage.mockRejectedValue(new Error('user cancelled'));
      const { result } = renderPurchase();
      const before = result.current.isPremium;

      let purchaseResult: string | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe('failed');
      expect(result.current.isPremium).toBe(before);
    });
  });

  describe('purchase failures are told apart', () => {
    it.each([
      [{ userCancelled: true }, 'cancelled'],
      [{ code: '1' }, 'cancelled'],
      [{ code: '20' }, 'pending'],
      [{ code: '10' }, 'network'],
      [{ code: '35' }, 'network'],
      [{ code: '6' }, 'already_owned'],
      [{ code: '2' }, 'failed'],
    ])('%j reads as %s', async (error, outcome) => {
      mockPurchases.purchasePackage.mockRejectedValue(error);
      const { result } = renderPurchase();
      let purchaseResult: string | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });
      expect(purchaseResult).toBe(outcome);
    });
  });

  describe('restorePurchases', () => {
    it('sets isPremium true and reports restored when a restored entitlement is active', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({ entitlements: { active: { premium: {} } } });
      const { result } = renderPurchase();

      let restoreResult: string | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe('restored');
      expect(result.current.isPremium).toBe(true);
    });

    it('sets isPremium false and reports none when there is no active entitlement to restore', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({ entitlements: { active: {} } });
      const { result } = renderPurchase();

      let restoreResult: string | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe('none');
      expect(result.current.isPremium).toBe(false);
    });

    it('reports failed, not none, and leaves isPremium unchanged when restore throws', async () => {
      mockPurchases.restorePurchases.mockRejectedValue(new Error('network error'));
      const { result } = renderPurchase();
      const before = result.current.isPremium;

      let restoreResult: string | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe('failed');
      expect(result.current.isPremium).toBe(before);
    });
  });
});
