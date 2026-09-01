import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import RouteTrace, { type LatLng } from './RouteTrace';
import {
  ShareCardFrame,
  ShareCardHeader,
  ShareCardHero,
  ShareCardHeroLabel,
  ShareCardStatsRow,
  ShareCardFooter,
  SHARE_CARD_WIDTH,
  type ShareCardStatItem,
} from './ShareCardParts';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { fmtDuration, fmtPace } from '../../utils/cardioFormat';
import { SHARE_SURFACE, SHARE_TEXT } from '../../constants/shareCardTheme';

type CardioShareCardProps = {
  activityName: string;
  date: string;
  distance: number;
  distanceUnit: 'km' | 'mi';
  durationMin: number;
  /** metres of ascent; omitted from the card when null/0 */
  elevationM?: number | null;
  /** decoded GPS route; card renders stats-only when absent */
  coords?: LatLng[];
  accentColor: string;
};

const TRACE_WIDTH = SHARE_CARD_WIDTH - 48;
const TRACE_HEIGHT = 210;

const CardioShareCard = forwardRef<View, CardioShareCardProps>(
  ({ activityName, date, distance, distanceUnit, durationMin, elevationM, coords, accentColor }, ref) => {
    const hasRoute = (coords?.length ?? 0) >= 2;

    const statItems: ShareCardStatItem[] = [
      { value: fmtDuration(durationMin), label: 'Duration' },
      { value: fmtPace(durationMin, distance), label: `Pace /${distanceUnit}` },
    ];
    if (elevationM != null && elevationM > 0) {
      statItems.push({ value: `${Math.round(elevationM)} m`, label: 'Elevation' });
    }

    return (
      <ShareCardFrame ref={ref} accentColor={accentColor}>
        <ShareCardHeader date={date} style={styles.header} />

        <Text style={styles.activityName} numberOfLines={1}>{activityName}</Text>

        {/* Route trace — privacy-safe line art, no map tiles */}
        {hasRoute && (
          <View style={styles.traceBox}>
            <RouteTrace
              coords={coords!}
              width={TRACE_WIDTH}
              height={TRACE_HEIGHT}
              strokeColor={accentColor}
            />
          </View>
        )}

        <ShareCardHero
          value={
            <>
              {distance.toFixed(2)}
              <Text style={styles.heroUnit}> {distanceUnit}</Text>
            </>
          }
          accentColor={accentColor}
          style={styles.hero}
        >
          <ShareCardHeroLabel>Distance</ShareCardHeroLabel>
        </ShareCardHero>

        <ShareCardStatsRow items={statItems} style={styles.statsRow} />

        <ShareCardFooter />
      </ShareCardFrame>
    );
  }
);

CardioShareCard.displayName = 'CardioShareCard';

export default CardioShareCard;

const styles = StyleSheet.create({
  header: {
    marginBottom: 14,
  },
  activityName: {
    fontSize: 24,
    fontWeight: '700',
    color: SHARE_TEXT,
    marginBottom: 12,
  },

  traceBox: {
    backgroundColor: SHARE_SURFACE,
    borderRadius: 14,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: {
    marginBottom: 14,
  },
  heroUnit: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
  },

  statsRow: {
    marginBottom: spacing.md,
  },
});
