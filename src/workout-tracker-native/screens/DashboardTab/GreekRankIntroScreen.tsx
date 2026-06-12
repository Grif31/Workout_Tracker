import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, Dimensions,
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { DashboardStackParamsList } from '../../navigation/types';
import { GREEK_RANKS } from '../ProfileTab/GreekRankScreen';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'GreekRankIntro'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NEOPHYTE = GREEK_RANKS[0];
const CIRCLE_SIZE = 120;

const PILLARS = [
  { emoji: '⚡', label: 'Strength', pct: '45%', desc: 'Lift heavier on the Big 6 lifts' },
  { emoji: '🔄', label: 'Consistency', pct: '30%', desc: 'Train regularly week over week' },
  { emoji: '🎯', label: 'Dedication', pct: '15%', desc: 'Maintain your training over months' },
  { emoji: '📈', label: 'Volume', pct: '10%', desc: 'Log more workouts per week' },
];

export default function GreekRankIntroScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero: animated rank badge ── */}
        <View style={s.hero}>
          <Animated.View entering={ZoomIn.springify().damping(12).delay(100)} style={s.badgeWrap}>
            <View style={[s.badgeOuter, { borderColor: NEOPHYTE.color }]}>
              <View style={[s.badgeInner, { backgroundColor: NEOPHYTE.color + '22' }]}>
                <Text style={[s.badgeIcon, { color: NEOPHYTE.color }]}>{NEOPHYTE.icon}</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(400).duration(400)} style={[s.rankName, { color: NEOPHYTE.color }]}>
            {NEOPHYTE.name.toUpperCase()}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(500).duration(400)} style={s.rankTagline}>
            Your first rank in the ancient order
          </Animated.Text>
        </View>

        {/* ── What is Greek Rank ── */}
        <Animated.View entering={FadeInDown.delay(600).duration(400)} style={s.card}>
          <Text style={s.sectionTitle}>What is Greek Rank?</Text>
          <Text style={s.bodyText}>
            Greek Rank measures your overall progress as an athlete across four training pillars.
            Complete more workouts, lift heavier, and stay consistent to climb from Neophyte all the way to Aretē — the pinnacle of human achievement.
          </Text>
        </Animated.View>

        {/* ── Rank Progression ── */}
        <Animated.View entering={FadeInDown.delay(680).duration(400)}>
          <Text style={[s.sectionTitle, { paddingHorizontal: spacing.lg }]}>The Path to Greatness</Text>
          <FlatList
            data={GREEK_RANKS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.name}
            contentContainerStyle={s.rankList}
            scrollEnabled={true}
            renderItem={({ item, index }) => {
              const isCurrent = item.name === NEOPHYTE.name;
              const isLocked = index > 0;
              return (
                <View style={[s.rankItem, { opacity: isLocked ? 0.4 : 1 }]}>
                  <View style={[
                    s.rankCircle,
                    { borderColor: item.color, backgroundColor: item.color + '22' },
                    isCurrent && { borderWidth: 2.5 },
                  ]}>
                    <Text style={[s.rankCircleIcon, { color: item.color }]}>{item.icon}</Text>
                  </View>
                  <Text style={[s.rankItemName, { color: isCurrent ? item.color : colors.textSecondary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isLocked && (
                    <Text style={s.rankItemScore}>{item.low}+</Text>
                  )}
                </View>
              );
            }}
          />
        </Animated.View>

        {/* ── How Ranks Are Earned ── */}
        <Animated.View entering={FadeInDown.delay(760).duration(400)} style={s.card}>
          <Text style={s.sectionTitle}>How Ranks Are Earned</Text>
          {PILLARS.map((p, i) => (
            <View key={p.label} style={[s.pillarRow, i < PILLARS.length - 1 && s.pillarDivider]}>
              <Text style={s.pillarEmoji}>{p.emoji}</Text>
              <View style={s.pillarText}>
                <View style={s.pillarLabelRow}>
                  <Text style={s.pillarLabel}>{p.label}</Text>
                  <Text style={[s.pillarPct, { color: colors.accent }]}>{p.pct}</Text>
                </View>
                <Text style={s.pillarDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </Animated.View>

        {/* ── Rewards ── */}
        <Animated.View entering={FadeInDown.delay(840).duration(400)} style={s.card}>
          <Text style={s.sectionTitle}>Rank Rewards</Text>
          <Text style={s.bodyText}>
            Each rank unlocks a unique profile frame you can equip on your avatar. Reach{' '}
            <Text style={{ color: '#9C27B0', fontWeight: '700' }}>Olympian</Text>
            {' '}and above to unlock animated frames that pulse with your rank colour.
          </Text>
        </Animated.View>

        {/* ── CTA ── */}
        <Animated.View entering={FadeInDown.delay(920).duration(400)} style={s.ctaWrap}>
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('DashboardHome')}
            activeOpacity={0.85}
          >
            <Text style={[s.ctaBtnText, { color: colors.accentText }]}>Start My Journey</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl * 2 },

  // Hero
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  badgeWrap: { marginBottom: spacing.md },
  badgeOuter: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  badgeInner: {
    width: CIRCLE_SIZE - 16, height: CIRCLE_SIZE - 16,
    borderRadius: (CIRCLE_SIZE - 16) / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 42, fontWeight: '800' },
  rankName: { fontSize: 30, fontWeight: '800', letterSpacing: 3, marginBottom: spacing.xs },
  rankTagline: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md, fontWeight: '700',
    color: colors.textPrimary, marginBottom: spacing.sm,
  },
  bodyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20 },

  // Rank progression list
  rankList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  rankItem: { alignItems: 'center', width: 68, marginBottom: spacing.md },
  rankCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  rankCircleIcon: { fontSize: typography.fontSize.lg, fontWeight: '800' },
  rankItemName: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginBottom: 2 },
  rankItemScore: { fontSize: 9, color: colors.textSecondary },

  // Pillars
  pillarRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, gap: spacing.sm },
  pillarDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pillarEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  pillarText: { flex: 1 },
  pillarLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  pillarLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  pillarPct: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  pillarDesc: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

  // CTA
  ctaWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  ctaBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  ctaBtnText: { fontSize: typography.fontSize.md, fontWeight: '700' },
});
