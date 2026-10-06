import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS, type CustomerInfo, type PurchasesOfferings, type PurchasesPackage,
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { REVENUECAT_IOS_KEY, BETA_PREMIUM } from '../constants/purchaseConfig';
import { PAYWALL_PREVIEW } from '../constants/featureFlags';
import { PREVIEW_OFFERINGS } from '../constants/paywallPreview';
import { cancelTrialReminder } from '../utils/notifications';

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

/** What the user holds, for Account Settings. Null when premium comes from the build, or not at all. */
export type SubscriptionInfo = {
  productId: string;
  /** ISO date the current period ends; null for Lifetime */
  expiresAt: string | null;
  willRenew: boolean;
  /** Apple's manage/cancel page; null for a grant, which has nothing to manage */
  managementURL: string | null;
};

type PurchaseContextType = {
  isPremium: boolean;
  subscription: SubscriptionInfo | null;
  offerings: PurchasesOfferings | null;
  offeringsState: OfferingsState;
  reloadOfferings: () => Promise<void>;
  /** Which of these products the user can still start a free trial on */
  checkTrialEligibility: (productIds: string[]) => Promise<Record<string, boolean>>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<RestoreOutcome>;
  loading: boolean;
};

const PurchaseContext = createContext<PurchaseContextType>({
  isPremium: false,
  subscription: null,
  offerings: null,
  offeringsState: 'loading',
  reloadOfferings: async () => {},
  checkTrialEligibility: async () => ({}),
  purchasePackage: async () => 'failed',
  restorePurchases: async () => 'failed',
  loading: true,
});

const entitlementOf = (info: CustomerInfo | null | undefined) => info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];

const hasPremium = (info: CustomerInfo | null | undefined) => BETA_PREMIUM || !!entitlementOf(info);

function subscriptionOf(info: CustomerInfo | null | undefined): SubscriptionInfo | null {
  const ent = entitlementOf(info);
  if (!ent) return null;
  return {
    productId: ent.productIdentifier,
    expiresAt: ent.expirationDate ?? null,
    willRenew: !!ent.willRenew,
    managementURL: info?.managementURL ?? null,
  };
}

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
  // Dev only: a free account and sample plans, to see the paywall without a store
  const preview = !enabled && PAYWALL_PREVIEW;
  const [isPremium, setIsPremium] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsState, setOfferingsState] = useState<OfferingsState>('loading');
  const [loading, setLoading] = useState(true);
  // Whether RevenueCat currently holds one of our user ids rather than an anonymous one
  const identified = useRef(false);

  const applyInfo = useCallback((info: CustomerInfo | null) => {
    const premium = hasPremium(info);
    setIsPremium(premium);
    setSubscription(subscriptionOf(info));
    // A trial that was cancelled or lapsed has nothing left to be reminded about
    if (!premium) cancelTrialReminder();
  }, []);

  useEffect(() => {
    if (preview) {
      setOfferings(PREVIEW_OFFERINGS);
      setOfferingsState('ready');
      setLoading(false);
      return;
    }
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
    const onUpdate = (info: CustomerInfo) => { if (identified.current) applyInfo(info); };
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
      setSubscription(null);
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
        applyInfo(customerInfo);
      } catch (e) {
        console.error('[RC] logIn error:', e);
        if (!cancelled) applyInfo(null);
      }
      if (!cancelled) setLoading(false);
    })();
    reloadOfferings();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Apple honors an intro offer once per subscription group, so a trial is
  // only advertised to users StoreKit confirms can still take it
  const checkTrialEligibility = useCallback(async (productIds: string[]) => {
    if (preview) return Object.fromEntries(productIds.map(id => [id, true]));
    if (!enabled) return {};
    const res = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    return Object.fromEntries(Object.entries(res ?? {}).map(
      ([id, e]) => [id, e.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE],
    ));
  }, [enabled, preview]);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
    if (preview) {
      // Stands in for the App Store sheet so the success path can be seen
      await new Promise(resolve => setTimeout(resolve, 800));
      setIsPremium(true);
      return 'purchased';
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = !!entitlementOf(customerInfo);
      setIsPremium(active);
      setSubscription(subscriptionOf(customerInfo));
      return active ? 'purchased' : 'failed';
    } catch (e) {
      return purchaseFailure(e);
    }
  }, [preview]);

  const restorePurchases = useCallback(async (): Promise<RestoreOutcome> => {
    if (preview) return 'none';
    try {
      const info: CustomerInfo = await Purchases.restorePurchases();
      const active = !!entitlementOf(info);
      setIsPremium(active);
      setSubscription(subscriptionOf(info));
      return active ? 'restored' : 'none';
    } catch {
      return 'failed';
    }
  }, [preview]);

  return (
    <PurchaseContext.Provider
      value={{
        isPremium, subscription, offerings, offeringsState, reloadOfferings,
        checkTrialEligibility, purchasePackage, restorePurchases, loading,
      }}
    >
      {children}
    </PurchaseContext.Provider>
  );
}

export const usePurchase = () => useContext(PurchaseContext);
