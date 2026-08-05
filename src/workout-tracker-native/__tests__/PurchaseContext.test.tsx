/**
 * PurchaseContext is globally mocked in jest.setup.ts for every other test
 * file (always returns isPremium: true) so screens can test their own logic
 * without touching RevenueCat. That means the real provider has never been
 * exercised anywhere. This file unmocks it and tests the real implementation.
 *
 * Two env facts about this repo constrain what's testable here:
 *  - EXPO_PUBLIC_REVENUECAT_IOS_KEY has no value in `.env` or ambient env,
 *    so `API_KEY` in PurchaseContext.tsx is always '' in this test run —
 *    the fail-closed branch (`!API_KEY || Platform.OS !== 'ios'`) always
 *    triggers, and Purchases.configure is never reachable here.
 *  - `.env` sets EXPO_PUBLIC_BETA_PREMIUM=true, and react-native-dotenv
 *    inlines that `process.env.*` read into a literal at babel-transform
 *    time — so BETA_PREMIUM is unconditionally `true` in this test run and
 *    cannot be varied at runtime (mutating process.env has no effect on an
 *    already-compiled constant, and re-requiring the module with a reset
 *    registry to force re-evaluation pulls in a second React instance,
 *    breaking hooks — not worth the fragility).
 * Both constants are frozen module-wide for this whole file as a result.
 * What IS still real and worth testing: the fail-closed gate firing as
 * expected given those frozen values, and — most importantly — the actual
 * money-path functions (purchasePackage/restorePurchases), which read the
 * SDK's returned entitlement directly and don't reference either constant.
 */
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

  describe('fail-closed gate (this build has no RevenueCat key configured)', () => {
    it('never calls Purchases.configure, on iOS or Android', async () => {
      (Platform as any).OS = 'ios';
      const { result: iosResult } = renderPurchase();
      await waitFor(() => expect(iosResult.current.loading).toBe(false));

      (Platform as any).OS = 'android';
      const { result: androidResult } = renderPurchase();
      await waitFor(() => expect(androidResult.current.loading).toBe(false));

      expect(mockPurchases.configure).not.toHaveBeenCalled();
    });

    it('the beta-premium build flag forces isPremium true regardless of platform or user', async () => {
      // Documents this repo's real current behavior — see file header.
      mockUseAuth.mockReturnValue({ user: { id: 42 } });
      const { result } = renderPurchase();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPremium).toBe(true);
    });
  });

  describe('purchasePackage', () => {
    it('sets isPremium true and returns true when the returned entitlement is active', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: { entitlements: { active: { premium: {} } } },
      });
      const { result } = renderPurchase();

      let purchaseResult: boolean | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe(true);
      expect(result.current.isPremium).toBe(true);
    });

    it('sets isPremium false and returns false when the returned entitlement is not active', async () => {
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });
      const { result } = renderPurchase();

      let purchaseResult: boolean | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });

    it('returns false and leaves isPremium unchanged when the purchase throws (e.g. user cancelled)', async () => {
      mockPurchases.purchasePackage.mockRejectedValue(new Error('user cancelled'));
      const { result } = renderPurchase();
      const before = result.current.isPremium;

      let purchaseResult: boolean | undefined;
      await act(async () => {
        purchaseResult = await result.current.purchasePackage({} as any);
      });

      expect(purchaseResult).toBe(false);
      expect(result.current.isPremium).toBe(before);
    });
  });

  describe('restorePurchases', () => {
    it('sets isPremium true and returns true when a restored entitlement is active', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({ entitlements: { active: { premium: {} } } });
      const { result } = renderPurchase();

      let restoreResult: boolean | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe(true);
      expect(result.current.isPremium).toBe(true);
    });

    it('sets isPremium false and returns false when there is no active entitlement to restore', async () => {
      mockPurchases.restorePurchases.mockResolvedValue({ entitlements: { active: {} } });
      const { result } = renderPurchase();

      let restoreResult: boolean | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });

    it('returns false and leaves isPremium unchanged when restore throws', async () => {
      mockPurchases.restorePurchases.mockRejectedValue(new Error('network error'));
      const { result } = renderPurchase();
      const before = result.current.isPremium;

      let restoreResult: boolean | undefined;
      await act(async () => {
        restoreResult = await result.current.restorePurchases();
      });

      expect(restoreResult).toBe(false);
      expect(result.current.isPremium).toBe(before);
    });
  });
});
