import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShareCardFrame, ShareCardWordmark } from './ShareCardParts';
import AchievementBadge from '../achievements/AchievementBadge';
import BadgeGlow from '../achievements/BadgeGlow';
import { badgeLook } from '../../constants/achievements';
import { SHARE_DIVIDER, SHARE_TEXT, SHARE_TEXT_MUTED } from '../../constants/shareCardTheme';

type AchievementShareCardProps = {
  badgeKey: string;
  title: string;
  threshold?: number;
  weightUnit: string;
  /** What and when: "Your 100th workout · Sep 28, 2026" */
  line: string;
  accentColor: string;
};

// Kept uncluttered on purpose (TODO §27): no ladder dots, no stats strip, and
// no laurel, which is the PR card's
const AchievementShareCard = forwardRef<View, AchievementShareCardProps>(
  ({ badgeKey, title, threshold, weightUnit, line, accentColor }, ref) => (
    <ShareCardFrame ref={ref} accentColor={accentColor}>
      <View style={styles.body}>
        <ShareCardWordmark />
        <View style={styles.badge}>
          <BadgeGlow metal={badgeLook(badgeKey, { threshold, weightUnit }).metal} size={230}>
            <AchievementBadge badgeKey={badgeKey} size={196} threshold={threshold} weightUnit={weightUnit} />
          </BadgeGlow>
        </View>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.line}>{line}</Text>
        <View style={styles.divider} />
        <Text style={styles.motto}>Excellence, logged.</Text>
      </View>
    </ShareCardFrame>
  )
);

AchievementShareCard.displayName = 'AchievementShareCard';

export default AchievementShareCard;

const styles = StyleSheet.create({
  body: { alignItems: 'center' },
  badge: { marginTop: 22 },
  title: {
    marginTop: 14,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: SHARE_TEXT,
    textAlign: 'center',
  },
  line: {
    marginTop: 6,
    fontSize: 15,
    color: SHARE_TEXT_MUTED,
    textAlign: 'center',
  },
  divider: {
    marginTop: 26,
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: SHARE_DIVIDER,
  },
  motto: {
    marginTop: 14,
    fontSize: 12,
    color: SHARE_TEXT_MUTED,
    letterSpacing: 0.3,
  },
});
