import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Animated as RNAnimated,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { type PurchasesPackage } from 'react-native-purchases';
import { usePurchase, type PurchaseOutcome } from '../context/PurchaseContext';
import PressableScale from '../components/PressableScale';
import { AUTH } from '../theme/authColors';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';
import { showToast } from '../utils/toast';
import { navigationRef } from '../navigation/navigationRef';
import { openExternalLink } from '../utils/links';
import { scheduleTrialReminder } from '../utils/notifications';
import { annualSavings, ctaLabel, featuresFor, headlineFor, trialOf, trialReminderDay } from '../utils/paywall';
import { type RootStackParamsList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamsList, 'Paywall'>;

// The paywall wears the onboarding look (always dark, brand green) rather than
// the app theme: it reads the same whatever accent or light mode the user picked
const ACCENT  = AUTH.accent;
const TEXT    = AUTH.text;
const SUBTEXT = AUTH.subtext;
const PW_BG     = AUTH.bg;
const PW_CARD   = AUTH.card;
const PW_BORDER = AUTH.border;
// Top of the hero's fade into the background
const HERO_TINT = '#0F2018';

const TIERS = [
  { type: 'ANNUAL',   label: 'Annual',   badge: 'Best Value' },
  { type: 'MONTHLY',  label: 'Monthly',  badge: '' },
  { type: 'LIFETIME', label: 'Lifetime', badge: 'Launch Promo' },
];

// What to tell the user when a purchase doesn't go through. Cancelling is
// their own choice and gets no message.
const PURCHASE_PROBLEMS: Partial<Record<PurchaseOutcome, [string, string]>> = {
  pending: ['Waiting for Approval', "Your purchase needs approval before it goes through. Premium unlocks as soon as it's approved."],
  network: ["Couldn't Reach the App Store", 'Check your connection and try again. You have not been charged.'],
  already_owned: ['Already Purchased', 'This Apple ID already owns this plan. Tap Restore Purchases to unlock it.'],
  failed: ["Purchase Didn't Go Through", 'You have not been charged. Try again in a moment.'],
};

// Where each thing that just unlocked lives, for the welcome screen
const UNLOCKED: { icon: string; label: string; detail: string; screen: string }[] = [
  { icon: 'trophy-outline', label: 'Strength Score', detail: 'See how every lift ranks', screen: 'StrengthScore' },
  { icon: 'speedometer-outline', label: 'Endurance Score', detail: 'See your rank at every distance', screen: 'EnduranceScore' },
  { icon: 'sparkles', label: 'AI Coach', detail: 'Insights, programs and volume zones', screen: 'TrainingHome' },
];

export default function PaywallScreen({ navigation, route }: Props) {
  const {
    isPremium, offerings, offeringsState, reloadOfferings, checkTrialEligibility,
    purchasePackage, restorePurchases,
  } = usePurchase();
  const insets = useSafeAreaInsets();
  const source = route.params?.source;
  const headline = headlineFor(source);
  const features = useMemo(() => featuresFor(source), [source]);

  // Someone who was already premium on arrival has nothing to buy here.
  // Read once: buying on this screen must not swap it out mid-purchase.
  const alreadyPremium = useRef(!!isPremium).current;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Set once premium is unlocked here: the paywall becomes a welcome screen
  const [welcome, setWelcome] = useState<string | null>(null);
  const succeeded = welcome != null;
  const successScale = useRef(new RNAnimated.Value(0)).current;

  const tierPackages = useMemo(() => {
    const allOfferings = Object.values(offerings?.all ?? {});
    const offering =
      offerings?.current ??
      allOfferings.find(o => o.availablePackages.length > 0) ??
      null;
    const all = offering?.availablePackages ?? [];
    const withPkg = TIERS.map(t => ({ ...t, pkg: all.find(p => p.packageType === t.type) }));
    // Before offerings load every tier shows a spinner; after, only tiers
    // configured in RevenueCat render, so dropping a plan leaves no dead row
    return offering ? withPkg.filter(t => t.pkg) : withPkg;
  }, [offerings]);
  const packages = tierPackages.map(t => t.pkg).filter(Boolean) as PurchasesPackage[];
  // Plans that never arrived: say so rather than spin forever
  const plansMissing = packages.length === 0 && (offeringsState === 'failed' || offeringsState === 'unavailable'
    || offeringsState === 'ready');

  // Plans are fetched at sign-in; if that failed, opening the paywall tries again
  useEffect(() => {
    if (offeringsState === 'failed') reloadOfferings();
  }, []);

  const [trialEligible, setTrialEligible] = useState<Record<string, boolean>>({});
  const productIds = packages.map(p => p.product.identifier).join(',');
  useEffect(() => {
    if (!productIds) return;
    let cancelled = false;
    checkTrialEligibility(productIds.split(','))
      .then(map => { if (!cancelled) setTrialEligible(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [productIds]);

  const trialFor = (pkg?: PurchasesPackage) =>
    pkg && trialEligible[pkg.product.identifier] ? trialOf(pkg) : null;

  const selected = tierPackages[selectedIndex];
  const selectedTrial = trialFor(selected?.pkg);
  const selectedIsLifetime = selected?.type === 'LIFETIME';
  const savings = annualSavings(
    tierPackages.find(t => t.type === 'ANNUAL')?.pkg,
    tierPackages.find(t => t.type === 'MONTHLY')?.pkg,
  );

  const finish = (title: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWelcome(title);
    RNAnimated.spring(successScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  };

  // Close the paywall, then open what they just unlocked
  const openUnlocked = (screen: string) => {
    navigation.goBack();
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('TrainingTab', { screen, initial: false });
    }
  };

  const handlePurchase = async () => {
    const pkg = selected?.pkg;
    if (!pkg) return;
    const trial = selectedTrial;
    setPurchasing(true);
    const outcome = await purchasePackage(pkg);
    setPurchasing(false);
    if (outcome === 'purchased') {
      // A heads-up before the first charge, so the trial ending isn't a surprise
      const day = trial ? trialReminderDay(trial) : null;
      if (trial && day != null) {
        scheduleTrialReminder(day, `Your Aretē Premium trial ends in ${trial.days - day} days. After that it renews at ${pkg.product.priceString}.`);
      }
      finish('Welcome to Aretē Premium');
      return;
    }
    const problem = PURCHASE_PROBLEMS[outcome];
    if (problem) Alert.alert(problem[0], problem[1]);
  };

  const handleRestore = async () => {
    setRestoring(true);
    const outcome = await restorePurchases();
    setRestoring(false);
    if (outcome === 'restored') {
      finish('Premium Restored');
    } else if (outcome === 'none') {
      showToast('No purchases found');
    } else {
      // Not the same as having nothing to restore: a paying user on a bad
      // connection must not be told they have no purchase
      Alert.alert("Couldn't Restore", "The App Store couldn't be reached. Check your connection and try again.");
    }
  };

  const selectTier = (i: number) => {
    if (i !== selectedIndex) Haptics.selectionAsync();
    setSelectedIndex(i);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient colors={[HERO_TINT, PW_BG]} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.badgeRow}>
            <Ionicons name="leaf-outline" size={12} color={ACCENT} />
            <Text style={styles.badgeText}>ARETĒ PREMIUM</Text>
            <Ionicons name="leaf-outline" size={12} color={ACCENT} style={styles.leafFlip} />
          </View>
          <Text style={styles.title}>{alreadyPremium ? "You're Premium" : headline.title}</Text>
          <Text style={styles.subtitle}>
            {alreadyPremium ? 'Everything below is already unlocked' : headline.subtitle}
          </Text>
        </LinearGradient>

        <View style={styles.accentDivider} />

        {/* Features */}
        <View style={styles.featuresCard}>
          {features.map((f, i) => (
            <Animated.View
              key={f.key}
              entering={FadeInDown.delay(80 + i * 50).duration(260)}
              style={[styles.featureRow, i < features.length - 1 && styles.featureRowBorder]}
            >
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon as any} size={18} color={ACCENT} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDetail}>{f.detail}</Text>
              </View>
              <Ionicons name="checkmark" size={16} color={ACCENT} />
            </Animated.View>
          ))}
        </View>

        {alreadyPremium ? (
          <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.ctaBtnText}>Done</Text>
          </TouchableOpacity>
        ) : (
          <>
            {plansMissing && (
              <View style={styles.plansMissing}>
                <Text style={styles.plansMissingText}>
                  {offeringsState === 'failed'
                    ? "Couldn't load the plans. Check your connection and try again."
                    : "Premium can't be purchased on this device right now."}
                </Text>
                {offeringsState === 'failed' && (
                  <TouchableOpacity onPress={reloadOfferings} accessibilityRole="button">
                    <Text style={styles.plansRetry}>Try Again</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Pricing tiers */}
            {!plansMissing && tierPackages.map(({ type, label, badge, pkg }, i) => {
              const isSelected = selectedIndex === i;
              const trial = trialFor(pkg);
              const isAnnual = type === 'ANNUAL';
              const tierBadge = isAnnual && savings ? `Save ${savings.percent}%` : badge;
              return (
                <PressableScale
                  key={type}
                  style={[styles.tierCard, isSelected && styles.tierCardSelected]}
                  onPress={() => selectTier(i)}
                >
                  <View
                    style={styles.tierLeft}
                    accessible
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${label}${pkg ? `, ${pkg.product.priceString}` : ''}`}
                  >
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View>
                      <Text style={[styles.tierLabel, isSelected && styles.tierLabelSelected]}>
                        {label}
                      </Text>
                      {pkg ? (
                        <>
                          <Text style={styles.tierPrice}>
                            {trial ? `${trial.text}, then ${pkg.product.priceString}` : pkg.product.priceString}
                          </Text>
                          {isAnnual && savings?.perMonth && (
                            <Text style={styles.tierSub}>{savings.perMonth}/mo, billed yearly</Text>
                          )}
                        </>
                      ) : (
                        <ActivityIndicator size="small" color={SUBTEXT} style={{ marginTop: 2 }} />
                      )}
                    </View>
                  </View>
                  {tierBadge ? (
                    <View style={styles.tierBadge}>
                      <Text style={styles.tierBadgeText}>{tierBadge}</Text>
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}

            {/* CTA */}
            <TouchableOpacity
              style={[styles.ctaBtn, (purchasing || succeeded || packages.length === 0) && { opacity: 0.6 }]}
              onPress={handlePurchase}
              disabled={purchasing || succeeded || packages.length === 0}
            >
              {purchasing
                ? <ActivityIndicator color={PW_BG} />
                : <Text style={styles.ctaBtnText}>{ctaLabel(selected?.type ?? '', selected?.pkg, selectedTrial)}</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={restoring || succeeded}>
              <Text style={styles.restoreBtnText}>{restoring ? 'Restoring…' : 'Restore Purchases'}</Text>
            </TouchableOpacity>

            <Text style={styles.legalText}>
              {selectedTrial
                ? 'Payment is charged to your Apple ID when the free trial ends unless you cancel at least 24 hours before. '
                : 'Payment charged to your Apple ID at confirmation of purchase. '}
              {selectedIsLifetime
                ? 'Lifetime is a one-time purchase. It does not renew.'
                : 'Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple ID settings.'}
            </Text>
          </>
        )}

        {/* Apple guideline 3.1.2 requires working Terms and Privacy links in the purchase flow */}
        <View style={styles.legalLinks}>
          <Text style={styles.legalLink} onPress={() => openExternalLink('https://aretefitnessapp.com/terms')}>
            Terms of Use
          </Text>
          <Text style={styles.legalLinkSeparator}>·</Text>
          <Text style={styles.legalLink} onPress={() => openExternalLink('https://aretefitnessapp.com/privacy')}>
            Privacy Policy
          </Text>
        </View>
      </ScrollView>

      {/* Floats over the hero: its own row read as a bar across the top */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + spacing.xs }]}
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={22} color={TEXT} />
      </TouchableOpacity>

      {/* After a purchase: what just unlocked and a way straight into each, instead of a toast */}
      {welcome != null && (
        <View style={[styles.welcome, { paddingTop: insets.top + spacing.xl }]} testID="purchase-success">
          <RNAnimated.View style={[styles.successCircle, { transform: [{ scale: successScale }] }]}>
            <Ionicons name="checkmark" size={44} color={PW_BG} />
          </RNAnimated.View>
          <Text style={styles.title}>{welcome}</Text>
          <Text style={styles.subtitle}>Here is what you can open now</Text>
          <View style={[styles.featuresCard, styles.welcomeList]}>
            {UNLOCKED.map((u, i) => (
              <Animated.View key={u.screen} entering={FadeInDown.delay(250 + i * 80).duration(260)}>
                <TouchableOpacity
                  style={[styles.featureRow, i < UNLOCKED.length - 1 && styles.featureRowBorder]}
                  onPress={() => openUnlocked(u.screen)}
                  accessibilityRole="button"
                >
                  <View style={styles.featureIconWrap}>
                    <Ionicons name={u.icon as any} size={18} color={ACCENT} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureLabel}>{u.label}</Text>
                    <Text style={styles.featureDetail}>{u.detail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={SUBTEXT} />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
          <TouchableOpacity style={[styles.ctaBtn, styles.welcomeDone]} onPress={() => navigation.goBack()}>
            <Text style={styles.ctaBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PW_BG },

  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PW_CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  hero: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
    color: ACCENT,
    letterSpacing: 2,
  },
  leafFlip: { transform: [{ scaleX: -1 }] },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '700',
    color: TEXT,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: SUBTEXT,
    textAlign: 'center',
  },

  accentDivider: {
    height: 1,
    backgroundColor: ACCENT,
    opacity: 0.3,
    marginBottom: spacing.md,
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
  featureText: { flex: 1 },
  featureLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: TEXT,
  },
  featureDetail: {
    fontSize: typography.fontSize.xs,
    color: SUBTEXT,
    marginTop: 2,
    lineHeight: 15,
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
    borderColor: ACCENT,
    backgroundColor: ACCENT + '18',
  },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: PW_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: ACCENT },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  tierLabel: { fontSize: typography.fontSize.md, color: SUBTEXT },
  tierLabelSelected: { color: TEXT, fontWeight: '600' },
  tierPrice: { fontSize: typography.fontSize.sm, color: SUBTEXT, marginTop: 1 },
  tierSub: { fontSize: typography.fontSize.xs, color: SUBTEXT, marginTop: 1 },
  tierBadge: {
    backgroundColor: ACCENT + '22',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: ACCENT + '55',
  },
  tierBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: ACCENT },

  ctaBtn: {
    backgroundColor: ACCENT,
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
  restoreBtnText: { fontSize: typography.fontSize.sm, color: SUBTEXT },

  legalText: {
    fontSize: typography.fontSize.xs,
    color: SUBTEXT,
    textAlign: 'center',
    lineHeight: 16,
  },
  plansMissing: {
    backgroundColor: PW_CARD,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: PW_BORDER,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  plansMissingText: { fontSize: typography.fontSize.sm, color: TEXT, textAlign: 'center', lineHeight: 20 },
  plansRetry: { fontSize: typography.fontSize.sm, fontWeight: '700', color: ACCENT },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  legalLink: {
    fontSize: typography.fontSize.xs,
    color: SUBTEXT,
    textDecorationLine: 'underline',
    paddingVertical: spacing.xs,
  },
  legalLinkSeparator: { fontSize: typography.fontSize.xs, color: SUBTEXT },

  welcome: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: PW_BG,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  welcomeList: { alignSelf: 'stretch', marginTop: spacing.lg },
  welcomeDone: { alignSelf: 'stretch' },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
