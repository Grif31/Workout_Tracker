import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LaurelBranch } from './LaurelWreath';
import { PR_GOLD, PR_GOLD_TEXT } from '../constants/prColors';

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

const CARD_WIDTH = 360;

const PRShareCard = forwardRef<View, PRShareCardProps>(
  ({ exerciseName, prLabel, value, delta, date, accentColor }, ref) => (
    <View ref={ref} style={styles.card}>
      <View style={[styles.accentEdge, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('../assets/Arete_name.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.date}>{date}</Text>
        </View>

        <View style={styles.banner}>
          <LaurelBranch height={18} color={PR_GOLD_TEXT} />
          <Text style={styles.bannerText}>New {prLabel} PR!</Text>
          <LaurelBranch side="right" height={18} color={PR_GOLD_TEXT} />
        </View>

        <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>

        <View style={styles.hero}>
          <Text style={[styles.heroValue, { color: accentColor }]}>{value}</Text>
          {delta != null && <Text style={styles.delta}>▲ {delta}</Text>}
        </View>

        <Text style={styles.footer}>aretefitnessapp.com</Text>
      </View>
    </View>
  )
);

PRShareCard.displayName = 'PRShareCard';

export default PRShareCard;

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
    marginBottom: 18,
  },
  logo: {
    width: 86,
    height: 28,
  },
  date: {
    fontSize: 12,
    color: '#8E8E93',
  },
  banner: {
    backgroundColor: PR_GOLD,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: PR_GOLD_TEXT,
    flex: 1,
    textAlign: 'center',
  },
  exerciseName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 10,
  },
  hero: {
    marginBottom: 18,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  delta: {
    fontSize: 15,
    fontWeight: '700',
    color: PR_GOLD,
    marginTop: 4,
  },
  footer: {
    fontSize: 11,
    color: '#636366',
    textAlign: 'center',
  },
});
