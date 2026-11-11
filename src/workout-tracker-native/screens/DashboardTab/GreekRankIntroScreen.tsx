import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GREEK_RANKS, GREEK_RANK_COLORS, rankTextColor } from '../../constants/greekRanks';

// Registered in both DashboardStack (the post-first-workout moment) and
// ProfileStack (the info button on GreekRankScreen), so the prop is the
// slice of a navigator both satisfy rather than one stack's typed props.
type Props = {
  navigation: {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
    canGoBack: () => boolean;
  };
  route?: object;
};

// Effort earns the score. Performance adds no points; it unlocks the top two
// ranks, so its row shows what it does instead of a weight.
const PILLARS = [
  { label: 'Consistency', pct: '40%', desc: 'Train regularly week over week' },
  { label: 'Dedication', pct: '30%', desc: 'Maintain your training over months' },
  { label: 'Volume', pct: '30%', desc: 'Do more working sets and cardio minutes each week' },
  { label: 'Performance', pct: 'Unlocks', desc: 'Titan needs a Strength or Endurance Score in the top half, Aretē the top 20%' },
];

export default function GreekRankIntroScreen({ navigation }: Props) {
  const { colors, mode } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const goBack = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('DashboardHome');

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Greek Rank</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── What is Greek Rank ── */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.card}>
          <Text style={s.sectionTitle}>What is Greek Rank?</Text>
          <Text style={s.bodyText}>
            Greek Rank is your score, 0 to 100, for the work you put in. It's determined by how
            often you train, how long you've kept at it, and how much you get through in a week.
            Each user gets a rank starting from their first session.
          </Text>
          <Text style={s.bodyText}>
            Train from Neophyte to Aretē, which means excellence in Greek. You must have a high
            enough Strength or Endurance Score to reach Titan and Aretē.
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
            renderItem={({ item, index }) => (
              <View style={s.rankItem}>
                <View style={[s.rankCircle, { borderColor: item.color, backgroundColor: item.color + '22' }]}>
                  <Text style={[s.rankCircleIcon, { color: rankTextColor(item.name, item.color, mode) }]}>{item.icon}</Text>
                </View>
                <Text style={[s.rankItemName, { color: rankTextColor(item.name, item.color, mode) }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {index > 0 && <Text style={s.rankItemScore}>{item.low}+</Text>}
              </View>
            )}
          />
        </Animated.View>

        {/* ── How Ranks Are Earned ── */}
        <Animated.View entering={FadeInDown.delay(760).duration(400)} style={s.card}>
          <Text style={s.sectionTitle}>How Ranks Are Earned</Text>
          {PILLARS.map((p, i) => (
            <View key={p.label} style={[s.pillarRow, i < PILLARS.length - 1 && s.pillarDivider]}>
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
            Each rank unlocks a new frame for your profile photo, adding an ornament to the one
            before it. From{' '}
            <Text style={{ color: rankTextColor('Olympian', GREEK_RANK_COLORS.Olympian, mode), fontWeight: '700' }}>Olympian</Text>
            {' '}up, a glint sweeps around the rim.
          </Text>
          <Text style={s.bodyText}>
            Tap your photo on the Greek Rank page to wear any frame you've unlocked.
          </Text>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.xl * 2 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },

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
  bodyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },

  // Rank progression list
  rankList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  rankItem: { alignItems: 'center', width: 68, marginBottom: spacing.md },
  rankCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  rankCircleIcon: { fontSize: typography.fontSize.lg, fontWeight: '800' },
  rankItemName: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginBottom: 2 },
  rankItemScore: { fontSize: 9, color: colors.textSecondary },

  // Pillars
  pillarRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, gap: spacing.sm },
  pillarDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pillarText: { flex: 1 },
  pillarLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  pillarLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  pillarPct: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  pillarDesc: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
});
