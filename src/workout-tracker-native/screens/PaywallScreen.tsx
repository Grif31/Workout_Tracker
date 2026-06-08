import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { type PurchasesPackage } from 'react-native-purchases';
import { useTheme, type Colors } from '../context/ThemeContext';
import { usePurchase } from '../context/PurchaseContext';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { showToast } from '../utils/toast';
import { type RootStackParamsList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamsList, 'Paywall'>;

const FEATURES: { icon: string; label: string }[] = [
  { icon: 'trophy-outline',   label: 'Strength Score & lifter ranking' },
  { icon: 'sparkles',         label: 'AI Coach — generate routines & templates' },
  { icon: 'list-outline',     label: 'Unlimited templates & routines' },
  { icon: 'apps-outline',     label: 'Custom app icons' },
];

export default function PaywallScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { offerings, purchasePackage, restorePurchases } = usePurchase();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const packages: PurchasesPackage[] = useMemo(() => {
    const all = offerings?.current?.availablePackages ?? [];
    const annual   = all.find(p => p.packageType === 'ANNUAL');
    const monthly  = all.find(p => p.packageType === 'MONTHLY');
    const lifetime = all.find(p => p.packageType === 'LIFETIME');
    return [annual, monthly, lifetime].filter(Boolean) as PurchasesPackage[];
  }, [offerings]);

  const TIER_LABELS  = ['Annual', 'Monthly', 'Lifetime'];
  const TIER_BADGES  = ['Best Value', '', 'One-time'];

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
      <SafeAreaView style={styles.safeTop}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={styles.badgeText}>PREMIUM</Text>
          </View>
          <Text style={styles.title}>Reach your peak</Text>
          <Text style={styles.subtitle}>Unlock every tool Aretē has to offer</Text>
        </View>

        {/* Feature list */}
        <View style={styles.featuresCard}>
          {FEATURES.map((f, i) => (
            <View
              key={i}
              style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureRowBorder]}
            >
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon as any} size={18} color={colors.accent} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Ionicons name="checkmark" size={16} color={colors.accent} />
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
                  <Text style={[styles.tierLabel, selected && { color: colors.textPrimary, fontWeight: '600' }]}>
                    {label}
                  </Text>
                  {pkg ? (
                    <Text style={styles.tierPrice}>{pkg.product.localizedPriceString}</Text>
                  ) : (
                    <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginTop: 2 }} />
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
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.ctaBtnText}>Get Premium</Text>
          }
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

function createStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeTop: {
      alignItems: 'flex-end',
    },
    closeBtn: {
      padding: spacing.md,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },

    // Header
    header: {
      alignItems: 'center',
      marginBottom: spacing.lg,
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
      color: colors.accent,
      letterSpacing: 1.2,
    },
    title: {
      fontSize: typography.fontSize.xxl,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    // Features
    featuresCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      marginBottom: spacing.lg,
      overflow: 'hidden',
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
      borderBottomColor: colors.border,
    },
    featureIconWrap: {
      width: 28,
      alignItems: 'center',
    },
    featureLabel: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      color: colors.textPrimary,
    },

    // Pricing tiers
    tierCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    tierCardSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent + '12',
    },
    tierLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: colors.accent,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.accent,
    },
    tierLabel: {
      fontSize: typography.fontSize.md,
      color: colors.textSecondary,
    },
    tierPrice: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      marginTop: 1,
    },
    tierBadge: {
      backgroundColor: colors.accent + '22',
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    tierBadgeText: {
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: colors.accent,
    },

    // CTA
    ctaBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    ctaBtnText: {
      color: '#fff',
      fontSize: typography.fontSize.md,
      fontWeight: '700',
    },
    restoreBtn: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    restoreBtnText: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
    },
    legalText: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
