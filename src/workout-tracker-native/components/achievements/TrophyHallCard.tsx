import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { appCache } from '../../utils/appCache';
import {
  ACHIEVEMENTS_CACHE_KEY, almostThere, amountText, earnedBadges, fetchAchievements, type AchievementsData,
} from '../../utils/achievements';
import { badgeAccessibilityLabel } from '../../constants/achievements';
import AchievementBadge from './AchievementBadge';

const BADGE = 64;
// The newest four, one per equal column, so a short row doesn't leave the right side empty
const SHOWN = 4;

/**
 * Your Journey's way into the Trophy Hall (TODO §27): the count, the three
 * latest badges with a dot on any not yet seen, and the closest next one.
 * No progress bar and no coloured border, so it doesn't compete with the rank.
 */
export default function TrophyHallCard({ onOpen }: { onOpen: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [data, setData] = useState<AchievementsData | null>(() => appCache.get<AchievementsData>(ACHIEVEMENTS_CACHE_KEY));

  useFocusEffect(useCallback(() => {
    // The cache already holds what the Hall saw, dots cleared, so use it on the way back
    const cached = appCache.get<AchievementsData>(ACHIEVEMENTS_CACHE_KEY);
    if (cached) setData(cached);
    fetchAchievements().then(fresh => { if (fresh) setData(fresh); });
  }, []));

  if (!data) return null;

  const latest = earnedBadges(data).slice(0, SHOWN);
  const unseen = new Set(data.unseen);
  const close = almostThere(data, 1)[0];
  const closeText = close?.next
    ? `${close.next.title}, ${amountText(close.track, close.next.remaining, close.unit, data.distance_unit)} to go`
    : null;

  return (
    <TouchableOpacity
      style={styles.card} onPress={onOpen} accessibilityRole="button"
      accessibilityLabel={`Trophy Hall, ${data.earned_count} of ${data.total_count} earned${unseen.size ? `, ${unseen.size} new` : ''}`}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Trophy Hall</Text>
        <Text style={styles.count}>{data.earned_count} of {data.total_count} earned</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
      {latest.length > 0 ? (
        <View style={styles.badges} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {latest.map(item => (
            <View key={item.key} style={styles.badgeSlot} accessibilityLabel={badgeAccessibilityLabel(item.title, { earnedAt: item.state.earned_at })}>
              <AchievementBadge badgeKey={item.key} threshold={item.threshold} weightUnit={data.weight_unit} size={BADGE} />
              {unseen.has(item.key) && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.line}>Your first workout earns your first badge.</Text>
      )}
      {closeText && (
        <Text style={styles.line} numberOfLines={1}>
          <Text style={styles.lineLabel}>Almost there  </Text>{closeText}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  card: {
    marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm + 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: 13, color: colors.textSecondary },
  badges: { flexDirection: 'row' },
  badgeSlot: { width: `${100 / SHOWN}%`, height: BADGE, alignItems: 'center' },
  dot: { position: 'absolute', top: 2, right: '50%', marginRight: -BADGE / 2 + 2, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.surface },
  line: { fontSize: 13, color: colors.textSecondary },
  lineLabel: { fontWeight: '700', color: colors.textPrimary },
});
