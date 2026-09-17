import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ShareCardFrame,
  ShareCardHeader,
  ShareCardBanner,
  ShareCardHero,
  ShareCardHeroLabel,
  ShareCardStatsRow,
  ShareCardFooter,
  type ShareCardStatItem,
} from './share/ShareCardParts';
import { SHARE_TEXT } from '../constants/shareCardTheme';

type EnduranceScoreShareCardProps = {
  score: number;
  rankLabel: string;
  distancesTracked: number;
  /** Finish time at the best-scoring distance, e.g. "25:00". */
  bestTime: string;
  bestTimeLabel: string;
  accentColor: string;
  date: string;
  /** Swaps in the gold/laurel "Rank Up!" treatment used for PR banners elsewhere. */
  isRankUp?: boolean;
};

const EnduranceScoreShareCard = forwardRef<View, EnduranceScoreShareCardProps>(
  ({ score, rankLabel, distancesTracked, bestTime, bestTimeLabel, accentColor, date, isRankUp }, ref) => {
    const statItems: ShareCardStatItem[] = [
      { value: bestTime, label: bestTimeLabel },
      { value: distancesTracked, label: distancesTracked === 1 ? 'Distance' : 'Distances' },
    ];

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date={date} />

        <Text style={styles.title}>{isRankUp ? 'New Rank' : 'My Endurance Score'}</Text>

        {isRankUp && <ShareCardBanner text={`Now: ${rankLabel}`} />}

        <ShareCardHero value={score} accentColor={accentColor}>
          <ShareCardHeroLabel>{rankLabel}</ShareCardHeroLabel>
        </ShareCardHero>

        <ShareCardStatsRow items={statItems} style={styles.statsRow} />

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

EnduranceScoreShareCard.displayName = 'EnduranceScoreShareCard';

export default EnduranceScoreShareCard;

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    lineHeight: 30,
    marginBottom: 14,
  },
  statsRow: {
    marginBottom: 18,
  },
});
