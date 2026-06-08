import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthContext';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const PREMIUM_ENTITLEMENT = 'premium';

type PurchaseContextType = {
  isPremium: boolean;
  offerings: PurchasesOfferings | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  loading: boolean;
};

const PurchaseContext = createContext<PurchaseContextType>({
  isPremium: false,
  offerings: null,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  loading: true,
});

export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!API_KEY || Platform.OS !== 'ios') {
      setIsPremium(true); // no key = dev build, unlock everything for testing
      setLoading(false);
      return;
    }
    Purchases.configure({ apiKey: API_KEY });
  }, []);

  useEffect(() => {
    if (!user?.id || !API_KEY || Platform.OS !== 'ios') {
      setLoading(false);
      return;
    }
    Purchases.logIn(String(user.id)).catch(() => {});
    loadCustomerInfo();
    loadOfferings();
  }, [user?.id]);

  const loadCustomerInfo = async () => {
    try {
      const info: CustomerInfo = await Purchases.getCustomerInfo();
      setIsPremium(!!info.entitlements.active[PREMIUM_ENTITLEMENT]);
    } catch {}
    setLoading(false);
  };

  const loadOfferings = async () => {
    try {
      const o = await Purchases.getOfferings();
      setOfferings(o);
    } catch {}
  };

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
      setIsPremium(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info: CustomerInfo = await Purchases.restorePurchases();
      const active = !!info.entitlements.active[PREMIUM_ENTITLEMENT];
      setIsPremium(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  return (
    <PurchaseContext.Provider value={{ isPremium, offerings, purchasePackage, restorePurchases, loading }}>
      {children}
    </PurchaseContext.Provider>
  );
}

export const usePurchase = () => useContext(PurchaseContext);
