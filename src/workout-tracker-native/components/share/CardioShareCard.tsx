import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import RouteTrace, { type LatLng } from './RouteTrace';
import { fmtDuration, fmtPace } from '../../utils/cardioFormat';

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

const CARD_WIDTH = 360;
const TRACE_WIDTH = CARD_WIDTH - 48;
const TRACE_HEIGHT = 210;

const CardioShareCard = forwardRef<View, CardioShareCardProps>(
  ({ activityName, date, distance, distanceUnit, durationMin, elevationM, coords, accentColor }, ref) => {
    const hasRoute = (coords?.length ?? 0) >= 2;

    return (
      <View ref={ref} style={styles.card}>
        <View style={[styles.accentEdge, { backgroundColor: accentColor }]} />
        <View style={styles.content}>
          {/* Brand + date */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/Arete_name.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.date}>{date}</Text>
          </View>

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

          {/* Hero stat */}
          <View style={styles.hero}>
            <Text style={[styles.heroValue, { color: accentColor }]}>
              {distance.toFixed(2)}
              <Text style={styles.heroUnit}> {distanceUnit}</Text>
            </Text>
            <Text style={styles.heroLabel}>Distance</Text>
          </View>

          {/* Secondary stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{fmtDuration(durationMin)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{fmtPace(durationMin, distance)}</Text>
              <Text style={styles.statLabel}>Pace /{distanceUnit}</Text>
            </View>
            {elevationM != null && elevationM > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{Math.round(elevationM)} m</Text>
                  <Text style={styles.statLabel}>Elevation</Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.footer}>aretefitnessapp.com</Text>
        </View>
      </View>
    );
  }
);

CardioShareCard.displayName = 'CardioShareCard';

export default CardioShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
  },
  accentEdge: {
    height: 5,
  },
  content: {
    padding: 24,
    paddingTop: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  logo: {
    width: 86,
    height: 28,
  },
  date: {
    fontSize: 12,
    color: '#8E8E93',
  },

  activityName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },

  traceBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: {
    marginBottom: 14,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  heroUnit: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 2,
  },

  footer: {
    fontSize: 11,
    color: '#636366',
    textAlign: 'center',
  },
});
