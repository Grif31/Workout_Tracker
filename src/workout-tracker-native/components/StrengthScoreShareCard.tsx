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

type StrengthScoreShareCardProps = {
  score: number;
  rankLabel: string;
  exercisesUsed: number;
  muscleGroupsUsed: number;
  accentColor: string;
  date: string;
  /** Swaps in the gold/laurel "Rank Up!" treatment used for PR banners elsewhere. */
  isRankUp?: boolean;
};

const StrengthScoreShareCard = forwardRef<View, StrengthScoreShareCardProps>(
  ({ score, rankLabel, exercisesUsed, muscleGroupsUsed, accentColor, date, isRankUp }, ref) => {
    const statItems: ShareCardStatItem[] = [
      { value: exercisesUsed, label: exercisesUsed === 1 ? 'Exercise' : 'Exercises' },
      { value: muscleGroupsUsed, label: muscleGroupsUsed === 1 ? 'Muscle Group' : 'Muscle Groups' },
    ];

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date={date} />

        <Text style={styles.title}>{isRankUp ? 'Rank Up!' : 'My Strength Score'}</Text>

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

StrengthScoreShareCard.displayName = 'StrengthScoreShareCard';

export default StrengthScoreShareCard;

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
