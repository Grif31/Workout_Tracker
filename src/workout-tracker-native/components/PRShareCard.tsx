import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ShareCardFrame,
  ShareCardHeader,
  ShareCardBanner,
  ShareCardHero,
  ShareCardFooter,
} from './share/ShareCardParts';
import { spacing } from '../theme/spacing';
import { PR_GOLD } from '../constants/prColors';
import { SHARE_TEXT } from '../constants/shareCardTheme';

type PRShareCardProps = {
  exerciseName: string;
  prLabel: string;
  /** Pre-formatted value, e.g. "245 lbs" or "24:10" */
  value: string;
  /** Pre-formatted improvement, e.g. "+10 lbs" or "32s faster" — null on a first-ever PR */
  delta: string | null;
  date: string;
  accentColor: string;
};

const PRShareCard = forwardRef<View, PRShareCardProps>(
  ({ exerciseName, prLabel, value, delta, date, accentColor }, ref) => (
    <ShareCardFrame ref={ref} accentColor={accentColor}>
      <ShareCardHeader date={date} />

      <ShareCardBanner text={`New ${prLabel} PR!`} style={styles.banner} />

      <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>

      <ShareCardHero value={value} accentColor={accentColor} style={styles.hero}>
        {delta != null && <Text style={styles.delta}>▲ {delta}</Text>}
      </ShareCardHero>

      <ShareCardFooter />
    </ShareCardFrame>
  )
);

PRShareCard.displayName = 'PRShareCard';

export default PRShareCard;

const styles = StyleSheet.create({
  banner: {
    marginBottom: spacing.md,
  },
  exerciseName: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
    marginBottom: 10,
  },
  hero: {
    marginBottom: 18,
  },
  delta: {
    fontSize: 15,
    fontWeight: '700',
    color: PR_GOLD,
    marginTop: spacing.xs,
  },
});
