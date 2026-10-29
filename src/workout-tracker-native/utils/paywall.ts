import type { PurchasesPackage } from 'react-native-purchases';
import { APP_ICONS_ENABLED } from '../constants/featureFlags';

export type PaywallFeature = { key: string; icon: string; label: string; detail: string };

// How many a free account can keep (enforced client-side in CoachScreen). What
// onboarding generated (`starter`) is not counted.
export const FREE_TEMPLATE_LIMIT = 7;
export const FREE_ROUTINE_LIMIT = 2;

// Kept to a handful of grouped rows so the plans stay on screen; each locked
// entry point maps to the row that covers it (SOURCES below)
const ALL_FEATURES: PaywallFeature[] = [
  { key: 'ai_coach', icon: 'sparkles', label: 'AI Coach', detail: 'Programs built for you, a weekly review and insights on demand' },
  { key: 'workout_tools', icon: 'trending-up-outline', label: 'Smarter workouts', detail: "Today's Target and exercise swaps that fit your injuries" },
  { key: 'scores', icon: 'trophy-outline', label: 'Strength and Endurance Scores', detail: 'See where every lift and every pace ranks' },
  { key: 'stats', icon: 'bar-chart-outline', label: 'Advanced stats', detail: 'Volume zones, trends, balance and how fast each lift is gaining' },
  { key: 'unlimited', icon: 'list-outline', label: 'Unlimited templates and routines', detail: `Free accounts keep ${FREE_TEMPLATE_LIMIT} templates and ${FREE_ROUTINE_LIMIT} routines` },
  ...(APP_ICONS_ENABLED ? [{ key: 'app_icon', icon: 'apps-outline', label: 'Custom app icons', detail: 'Pick the icon on your home screen' }] : []),
];

// The `source` each locked entry point passes, mapped to the feature it was
// asking for and the headline that answers it
const SOURCES: Record<string, { feature: string; title: string; subtitle: string }> = {
  ai_coach: { feature: 'ai_coach', title: 'AI Coach is part of Premium', subtitle: 'Programs built around you, in seconds' },
  weekly_review: { feature: 'ai_coach', title: 'The full weekly review is part of Premium', subtitle: 'What went well, what lagged, and one change for next week' },
  pr_velocity: { feature: 'stats', title: 'Progress rate is part of Premium', subtitle: 'See how fast each lift is gaining and when it stalls' },
  strength_score: { feature: 'scores', title: 'Strength Score is part of Premium', subtitle: 'See how your lifts rank and what to work on next' },
  endurance_score: { feature: 'scores', title: 'Endurance Score is part of Premium', subtitle: 'See how your pace ranks at every distance' },
  muscle_volume: { feature: 'stats', title: 'Advanced stats are part of Premium', subtitle: 'See which muscles need more work, how you split push and pull, and how hard this week is' },
  templates: { feature: 'unlimited', title: `You've used your ${FREE_TEMPLATE_LIMIT} free templates`, subtitle: 'Premium removes the limit' },
  routines: { feature: 'unlimited', title: `You've used your ${FREE_ROUTINE_LIMIT} free routines`, subtitle: 'Premium removes the limit' },
  app_icon: { feature: 'app_icon', title: 'Custom icons are part of Premium', subtitle: 'Unlock every tool Aretē has to offer' },
};

const DEFAULT_HEADLINE = { title: 'Reach your peak', subtitle: 'Unlock every tool Aretē has to offer' };

export function headlineFor(source?: string): { title: string; subtitle: string } {
  const s = source ? SOURCES[source] : undefined;
  return s ? { title: s.title, subtitle: s.subtitle } : DEFAULT_HEADLINE;
}

/** Every feature, with the one the user tapped to get here listed first. */
export function featuresFor(source?: string): PaywallFeature[] {
  const first = source ? SOURCES[source]?.feature : undefined;
  if (!first) return ALL_FEATURES;
  return [...ALL_FEATURES.filter(f => f.key === first), ...ALL_FEATURES.filter(f => f.key !== first)];
}

const PERIOD_WORD: Record<string, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };
const PERIOD_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

export type Trial = {
  /** "1 week free" */
  text: string;
  /** "7-Day" for the button */
  length: string;
  days: number;
};

/** The package's free trial, or null for a paid intro offer or none. */
export function trialOf(pkg: PurchasesPackage | undefined): Trial | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const word = PERIOD_WORD[intro.periodUnit];
  if (!word) return null;
  const n = intro.periodNumberOfUnits;
  const days = n * PERIOD_DAYS[intro.periodUnit];
  // Days read best for anything under a month ("7-Day", not "1-Week")
  const length = days < 30 ? `${days}-Day` : `${n}-${word[0].toUpperCase()}${word.slice(1)}`;
  return { text: `${n} ${word}${n === 1 ? '' : 's'} free`, length, days };
}

function formatMoney(amount: number, currencyCode: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return null;
  }
}

/** What Annual saves against twelve Monthly payments, from the store's own prices. */
export function annualSavings(
  annual: PurchasesPackage | undefined,
  monthly: PurchasesPackage | undefined,
): { percent: number; perMonth: string | null } | null {
  const a = annual?.product.price;
  const m = monthly?.product.price;
  if (!a || !m || a >= m * 12) return null;
  return {
    percent: Math.round((1 - a / (m * 12)) * 100),
    perMonth: formatMoney(a / 12, annual!.product.currencyCode),
  };
}

/** The buy button's label: what tapping it starts, and for how much. */
export function ctaLabel(type: string, pkg: PurchasesPackage | undefined, trial: Trial | null): string {
  if (!pkg) return 'Get Premium';
  if (trial) return `Start ${trial.length} Free Trial`;
  const price = pkg.product.priceString;
  if (type === 'LIFETIME') return `Buy Lifetime for ${price}`;
  if (type === 'ANNUAL') return `Subscribe for ${price}/year`;
  if (type === 'MONTHLY') return `Subscribe for ${price}/month`;
  return `Get Premium for ${price}`;
}

/** The day of the trial the reminder goes out on; null when the trial is too short for one. */
export const trialReminderDay = (trial: Trial): number | null => (trial.days >= 3 ? trial.days - 2 : null);
