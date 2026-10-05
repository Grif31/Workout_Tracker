/**
 * The RevenueCat-enabled path of PurchaseContext: how premium status is read
 * and kept current. PurchaseContext.test.tsx can't reach it (no key in the
 * test env, see its header), so this file swaps in a config with a key and
 * beta premium off.
 */
jest.mock('../constants/purchaseConfig', () => ({ REVENUECAT_IOS_KEY: 'test-key', BETA_PREMIUM: false }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(() => Promise.resolve()),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn(() => ({ user: null })) }));
jest.unmock('../context/PurchaseContext');

import { AppState, Platform } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import { useAuth } from '../context/AuthContext';
import { PurchaseProvider, usePurchase } from '../context/PurchaseContext';

const rc = Purchases as unknown as Record<string, jest.Mock>;
const mockUseAuth = useAuth as jest.Mock;
const REAL_OS = Platform.OS;

const PREMIUM = { entitlements: { active: { premium: {} } } };
const FREE = { entitlements: { active: {} } };

const renderPurchase = () => renderHook(() => usePurchase(), { wrapper: PurchaseProvider });
const signIn = (id: number | null) => mockUseAuth.mockReturnValue({ user: id == null ? null : { id } });
// The listener the provider registered with the SDK
const sdkListener = () => rc.addCustomerInfoUpdateListener.mock.calls[0][0] as (info: any) => void;

describe('premium status with RevenueCat configured', () => {
  let appStateHandler: ((state: string) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, handler: any) => {
      appStateHandler = handler;
      return { remove: jest.fn() } as any;
    });
    rc.logIn.mockResolvedValue({ customerInfo: FREE });
    rc.getCustomerInfo.mockResolvedValue(FREE);
    rc.getOfferings.mockResolvedValue({ current: null, all: {} });
    signIn(null);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { (Platform as any).OS = REAL_OS; });

  it("reads premium from the sign-in's own answer, not a separate lookup that could race it", async () => {
    rc.logIn.mockResolvedValue({ customerInfo: PREMIUM });
    // A lookup racing the login would answer for the anonymous user
    rc.getCustomerInfo.mockResolvedValue(FREE);
    signIn(7);
    const { result } = renderPurchase();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rc.logIn).toHaveBeenCalledWith('7');
    expect(rc.logIn).toHaveBeenCalledTimes(1);
    expect(result.current.isPremium).toBe(true);
  });

  it('follows subscription changes the SDK reports, such as an expiry', async () => {
    rc.logIn.mockResolvedValue({ customerInfo: PREMIUM });
    signIn(7);
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.isPremium).toBe(true));

    act(() => sdkListener()(FREE));
    expect(result.current.isPremium).toBe(false);
    act(() => sdkListener()(PREMIUM));
    expect(result.current.isPremium).toBe(true);
  });

  it('ignores updates about the anonymous user before anyone is signed in', async () => {
    const { result } = renderPurchase();
    act(() => sdkListener()(PREMIUM));
    expect(result.current.isPremium).toBe(false);
  });

  it('rechecks when the app comes back to the foreground', async () => {
    signIn(7);
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPremium).toBe(false);

    // Bought on another device while this one was in the background
    rc.getCustomerInfo.mockResolvedValue(PREMIUM);
    await act(async () => { appStateHandler?.('active'); });
    await waitFor(() => expect(result.current.isPremium).toBe(true));
  });

  it("signs out of RevenueCat and drops premium on logout, so it can't carry to the next account", async () => {
    rc.logIn.mockResolvedValue({ customerInfo: PREMIUM });
    signIn(7);
    const { result, rerender } = renderPurchase();
    await waitFor(() => expect(result.current.isPremium).toBe(true));

    signIn(null);
    rerender({});
    await waitFor(() => expect(result.current.isPremium).toBe(false));
    expect(rc.logOut).toHaveBeenCalledTimes(1);

    // The next account's status check fails: still not premium
    rc.logIn.mockRejectedValue(new Error('offline'));
    signIn(8);
    rerender({});
    await waitFor(() => expect(rc.logIn).toHaveBeenCalledWith('8'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPremium).toBe(false);
  });

  it('reports plans that failed to load, and loads them on a retry', async () => {
    rc.getOfferings.mockRejectedValue(new Error('offline'));
    signIn(7);
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.offeringsState).toBe('failed'));

    const offerings = { current: { availablePackages: [] }, all: {} };
    rc.getOfferings.mockResolvedValue(offerings);
    await act(async () => { await result.current.reloadOfferings(); });
    expect(result.current.offeringsState).toBe('ready');
    expect(result.current.offerings).toBe(offerings);
  });
});
