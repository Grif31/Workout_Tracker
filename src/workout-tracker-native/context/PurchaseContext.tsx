import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { REVENUECAT_IOS_KEY, BETA_PREMIUM } from '../constants/purchaseConfig';

const PREMIUM_ENTITLEMENT = 'premium';

// RevenueCat's PURCHASES_ERROR_CODE values for the failures worth telling apart
const RC_CANCELLED = '1';
const RC_ALREADY_PURCHASED = '6';
const RC_NETWORK = '10';
const RC_PAYMENT_PENDING = '20';
const RC_OFFLINE = '35';

/** How a purchase ended. Only 'purchased' unlocks premium; 'cancelled' needs no message. */
export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'network' | 'already_owned' | 'failed';
/** 'none' is a completed restore that found nothing; 'failed' never reached the store. */
export type RestoreOutcome = 'restored' | 'none' | 'failed';
/** 'unavailable': this build or platform has no in-app purchases at all. */
export type OfferingsState = 'loading' | 'ready' | 'failed' | 'unavailable';

type PurchaseContextType = {
  isPremium: boolean;
  offerings: PurchasesOfferings | null;
  offeringsState: OfferingsState;
  reloadOfferings: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<RestoreOutcome>;
  loading: boolean;
};

const PurchaseContext = createContext<PurchaseContextType>({
  isPremium: false,
  offerings: null,
  offeringsState: 'loading',
  reloadOfferings: async () => {},
  purchasePackage: async () => 'failed',
  restorePurchases: async () => 'failed',
  loading: true,
});

const hasPremium = (info: CustomerInfo | null | undefined) =>
  BETA_PREMIUM || !!info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];

function purchaseFailure(e: any): PurchaseOutcome {
  const code = String(e?.code ?? '');
  if (e?.userCancelled || code === RC_CANCELLED) return 'cancelled';
  if (code === RC_PAYMENT_PENDING) return 'pending';
  if (code === RC_NETWORK || code === RC_OFFLINE) return 'network';
  if (code === RC_ALREADY_PURCHASED) return 'already_owned';
  return 'failed';
}

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Fail closed: with no key (or on Android, where IAP isn't configured)
  // RevenueCat is never touched and only dev/beta builds unlock premium. A
  // production build with a missing key must NOT hand out premium for free.
  const enabled = !!REVENUECAT_IOS_KEY && Platform.OS === 'ios';
  const [isPremium, setIsPremium] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsState, setOfferingsState] = useState<OfferingsState>('loading');
  const [loading, setLoading] = useState(true);
  // Whether RevenueCat currently holds one of our user ids rather than an anonymous one
  const identified = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsPremium(__DEV__ || BETA_PREMIUM);
      setOfferingsState('unavailable');
      setLoading(false);
      return;
    }
    Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
    // Expiry, renewal, a refund or a purchase on another device arrive here.
    // Updates for the anonymous user between accounts are ignored: they'd
    // read as "not premium" for whoever is signing in.
    const onUpdate = (info: CustomerInfo) => { if (identified.current) setIsPremium(hasPremium(info)); };
    Purchases.addCustomerInfoUpdateListener(onUpdate);
    // The SDK refreshes on foreground; asking for it makes the listener fire promptly
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && identified.current) Purchases.getCustomerInfo().then(onUpdate).catch(() => {});
    });
    return () => {
      Purchases.removeCustomerInfoUpdateListener(onUpdate);
      appState.remove();
    };
  }, []);

  const reloadOfferings = useCallback(async () => {
    if (!enabled) return;
    setOfferingsState('loading');
    try {
      setOfferings(await Purchases.getOfferings());
      setOfferingsState('ready');
    } catch (e) {
      console.error('[RC] getOfferings error:', e);
      setOfferingsState('failed');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!user?.id) {
      // Signed out: drop the last account's premium with it, so a failed
      // status check can't leave it on the next account
      if (identified.current) {
        identified.current = false;
        Purchases.logOut().catch(() => {});
      }
      setIsPremium(BETA_PREMIUM);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Premium is read from what logIn returns. Reading customer info
        // without waiting for it could answer for the anonymous user.
        const { customerInfo } = await Purchases.logIn(String(user.id));
        if (cancelled) return;
        identified.current = true;
        setIsPremium(hasPremium(customerInfo));
      } catch (e) {
        console.error('[RC] logIn error:', e);
        if (!cancelled) setIsPremium(BETA_PREMIUM);
      }
      if (!cancelled) setLoading(false);
    })();
    reloadOfferings();
    return () => { cancelled = true; };
  }, [user?.id]);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
      setIsPremium(active);
      return active ? 'purchased' : 'failed';
    } catch (e) {
      return purchaseFailure(e);
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<RestoreOutcome> => {
    try {
      const info: CustomerInfo = await Purchases.restorePurchases();
      const active = !!info.entitlements.active[PREMIUM_ENTITLEMENT];
      setIsPremium(active);
      return active ? 'restored' : 'none';
    } catch {
      return 'failed';
    }
  }, []);

  return (
    <PurchaseContext.Provider
      value={{ isPremium, offerings, offeringsState, reloadOfferings, purchasePackage, restorePurchases, loading }}
    >
      {children}
    </PurchaseContext.Provider>
  );
}

export const usePurchase = () => useContext(PurchaseContext);
