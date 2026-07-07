import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { type PurchasesPackage } from 'react-native-purchases';
import { usePurchase } from '../context/PurchaseContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { showToast } from '../utils/toast';
import { type RootStackParamsList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamsList, 'Paywall'>;

// Paywall brand palette — fixed premium look, independent of app theme
const GOLD        = '#FFD700';
const GOLD_LIGHT  = '#E8D5A3';
const GOLD_DIM    = '#7A6235';
const PW_BG       = '#0A0806';
const PW_CARD     = '#14100A';
const PW_BORDER   = '#2A1F08';

const FEATURES: { icon: string; label: string }[] = [
  { icon: 'trophy-outline', label: 'Strength Score & lifter ranking' },
  { icon: 'sparkles',       label: 'AI Coach — generate routines & templates' },
  { icon: 'list-outline',   label: 'Unlimited templates & routines' },
  { icon: 'apps-outline',   label: 'Custom app icons' },
];

const TIER_LABELS = ['Annual', 'Monthly', 'Lifetime'];
const TIER_BADGES = ['Best Value', '', 'One-time'];

export default function PaywallScreen({ navigation }: Props) {
  const { offerings, purchasePackage, restorePurchases } = usePurchase();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const packages: PurchasesPackage[] = useMemo(() => {
    const allOfferings = Object.values(offerings?.all ?? {});
    const offering =
      offerings?.current ??
      allOfferings.find(o => o.availablePackages.length > 0) ??
      null;
    const all = offering?.availablePackages ?? [];
    const annual   = all.find(p => p.packageType === 'ANNUAL');
    const monthly  = all.find(p => p.packageType === 'MONTHLY');
    const lifetime = all.find(p => p.packageType === 'LIFETIME');
    return [annual, monthly, lifetime].filter(Boolean) as PurchasesPackage[];
  }, [offerings]);

  const handlePurchase = async () => {
    const pkg = packages[selectedIndex];
    if (!pkg) return;
    setPurchasing(true);
    const success = await purchasePackage(pkg);
    setPurchasing(false);
    if (success) {
      showToast('Welcome to Premium!');
      navigation.goBack();
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const success = await restorePurchases();
    setRestoring(false);
    if (success) {
      showToast('Purchases restored!');
      navigation.goBack();
    } else {
      showToast('No purchases found');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topGoldLine} />

      <SafeAreaView style={styles.safeTop}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={GOLD_DIM} />
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient colors={['#1F1506', PW_BG]} style={styles.hero}>
          <View style={styles.badgeRow}>
            <Ionicons name="leaf-outline" size={12} color={GOLD} />
            <Text style={styles.badgeText}>ARETĒ PREMIUM</Text>
            <Ionicons name="leaf-outline" size={12} color={GOLD} style={styles.leafFlip} />
          </View>
          <Text style={styles.title}>Reach your peak</Text>
          <Text style={styles.subtitle}>Unlock every tool Aretē has to offer</Text>
        </LinearGradient>

        <View style={styles.goldDivider} />

        {/* Features */}
        <View style={styles.featuresCard}>
          {FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureRowBorder]}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon as any} size={18} color={GOLD} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Ionicons name="checkmark" size={16} color={GOLD} />
            </View>
          ))}
        </View>

        {/* Pricing tiers */}
        {TIER_LABELS.map((label, i) => {
          const pkg = packages[i];
          const selected = selectedIndex === i;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.tierCard, selected && styles.tierCardSelected]}
              onPress={() => setSelectedIndex(i)}
              activeOpacity={0.8}
            >
              <View style={styles.tierLeft}>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <View>
                  <Text style={[styles.tierLabel, selected && styles.tierLabelSelected]}>
                    {label}
                  </Text>
                  {pkg ? (
                    <Text style={styles.tierPrice}>{pkg.product.priceString}</Text>
                  ) : (
                    <ActivityIndicator size="small" color={GOLD_DIM} style={{ marginTop: 2 }} />
                  )}
                </View>
              </View>
              {TIER_BADGES[i] ? (
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>{TIER_BADGES[i]}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, (purchasing || packages.length === 0) && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={purchasing || packages.length === 0}
        >
          {purchasing
            ? <ActivityIndicator color={PW_BG} />
            : <Text style={styles.ctaBtnText}>Get Premium</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring}>
          <Text style={styles.restoreBtnText}>{restoring ? 'Restoring…' : 'Restore Purchases'}</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Payment charged to your Apple ID at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PW_BG },

  topGoldLine: { height: 2, backgroundColor: GOLD },

  safeTop: { alignItems: 'flex-end' },
  closeBtn: { padding: spacing.md },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 2,
  },
  leafFlip: { transform: [{ scaleX: -1 }] },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '700',
    color: GOLD_LIGHT,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: GOLD_DIM,
    textAlign: 'center',
  },

  goldDivider: {
    height: 1,
    backgroundColor: GOLD,
    opacity: 0.3,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.xl,
  },

  featuresCard: {
    backgroundColor: PW_CARD,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PW_BORDER,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PW_BORDER,
  },
  featureIconWrap: { width: 28, alignItems: 'center' },
  featureLabel: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: GOLD_LIGHT,
  },

  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PW_CARD,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: PW_BORDER,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  tierCardSelected: {
    borderColor: GOLD,
    backgroundColor: GOLD + '18',
  },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: PW_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: GOLD },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },
  tierLabel: { fontSize: typography.fontSize.md, color: GOLD_DIM },
  tierLabelSelected: { color: GOLD_LIGHT, fontWeight: '600' },
  tierPrice: { fontSize: typography.fontSize.sm, color: GOLD_DIM, marginTop: 1 },
  tierBadge: {
    backgroundColor: GOLD + '22',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GOLD + '55',
  },
  tierBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: GOLD },

  ctaBtn: {
    backgroundColor: GOLD,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  ctaBtnText: {
    color: PW_BG,
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  restoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  restoreBtnText: { fontSize: typography.fontSize.sm, color: GOLD_DIM },

  legalText: {
    fontSize: typography.fontSize.xs,
    color: GOLD_DIM,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 16,
  },
});
