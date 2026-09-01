import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LaurelBranch } from '../LaurelWreath';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { PR_GOLD, PR_GOLD_TEXT } from '../../constants/prColors';
import {
  SHARE_BG,
  SHARE_SURFACE,
  SHARE_DIVIDER,
  SHARE_TEXT,
  SHARE_TEXT_MUTED,
  SHARE_TEXT_FOOTER,
} from '../../constants/shareCardTheme';

// Shared chrome for the share-card family (PRShareCard, WorkoutShareCard,
// WeeklySummaryShareCard, StrengthScoreShareCard, CardioShareCard). Each card
// composes these pieces with its own middle section — editing a piece here
// changes every card that uses it; editing one card's file changes only that card.

export const SHARE_CARD_WIDTH = 360;

// Outer rounded card + accent-color edge + padded content area.
type ShareCardFrameProps = { accentColor: string; children: React.ReactNode };
export const ShareCardFrame = forwardRef<View, ShareCardFrameProps>(
  ({ accentColor, children }, ref) => (
    <View ref={ref} style={styles.card}>
      <View style={[styles.accentEdge, { backgroundColor: accentColor }]} />
      <View style={styles.content}>{children}</View>
    </View>
  )
);
ShareCardFrame.displayName = 'ShareCardFrame';

// Logo + date/range row.
type ShareCardHeaderProps = { date: string; style?: StyleProp<ViewStyle> };
export function ShareCardHeader({ date, style }: ShareCardHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <Image source={require('../../assets/Arete_name.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.date}>{date}</Text>
    </View>
  );
}

// Laurel-flanked PR / rank-up callout — gold-bordered outline on the surface
// color, matching the hero-card treatment used elsewhere in the app (e.g.
// PRProgressionScreen, PRDashboardScreen, ProfileScreen) instead of a filled
// gold block.
type ShareCardBannerProps = { text: string; style?: StyleProp<ViewStyle> };
export function ShareCardBanner({ text, style }: ShareCardBannerProps) {
  return (
    <View style={[styles.banner, style]}>
      <LaurelBranch height={18} color={PR_GOLD} />
      <Text style={styles.bannerText}>{text}</Text>
      <LaurelBranch side="right" height={18} color={PR_GOLD} />
    </View>
  );
}

// Big accent-colored headline value. `children` holds whatever sits underneath
// it (a muted uppercase label via ShareCardHeroLabel, a delta line, etc.) —
// that varies too much per card to fix into one prop shape.
type ShareCardHeroProps = {
  value: React.ReactNode;
  accentColor: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};
export function ShareCardHero({ value, accentColor, style, children }: ShareCardHeroProps) {
  return (
    <View style={[styles.hero, style]}>
      <Text style={[styles.heroValue, { color: accentColor }]}>{value}</Text>
      {children}
    </View>
  );
}

export function ShareCardHeroLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heroLabel}>{children}</Text>;
}

// Surface row of stat boxes with a divider auto-inserted between each item.
export type ShareCardStatItem = { value: React.ReactNode; label: string };
type ShareCardStatsRowProps = { items: ShareCardStatItem[]; style?: StyleProp<ViewStyle> };
export function ShareCardStatsRow({ items, style }: ShareCardStatsRowProps) {
  return (
    <View style={[styles.statsRow, style]}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={styles.statDivider} />}
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{item.value}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export function ShareCardFooter() {
  return <Text style={styles.footer}>aretefitnessapp.com</Text>;
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    backgroundColor: SHARE_BG,
    borderRadius: 20,
    overflow: 'hidden',
  },
  accentEdge: {
    height: 5,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  logo: {
    width: 86,
    height: 28,
  },
  date: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
  },

  banner: {
    backgroundColor: SHARE_SURFACE,
    borderWidth: 1.5,
    borderColor: PR_GOLD,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: PR_GOLD_TEXT,
    flex: 1,
    textAlign: 'center',
  },

  hero: {
    marginBottom: spacing.md,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  heroLabel: {
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: SHARE_SURFACE,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: SHARE_TEXT,
  },
  statLabel: {
    fontSize: 10,
    color: SHARE_TEXT_MUTED,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: SHARE_DIVIDER,
    marginVertical: 2,
  },

  footer: {
    fontSize: typography.fontSize.xs,
    color: SHARE_TEXT_FOOTER,
    textAlign: 'center',
  },
});
