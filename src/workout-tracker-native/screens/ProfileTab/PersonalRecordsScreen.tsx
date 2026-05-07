import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, SectionList,
  TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing } from 'theme/spacing';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'PersonalRecords'>;

export type PR = {
  id: number;
  exercise_template_id: number;
  exercise_name: string;
  pr_type: 'max_weight' | 'max_reps' | 'estimated_1rm';
  pr_label: string;
  value: number;
  weight_context: number | null;
  achieved_at: string;
};

const TABS = [
  { key: 'max_weight' as const, label: 'Max Weight' },
  { key: 'max_reps'   as const, label: 'Max Reps'   },
  { key: 'cardio'     as const, label: 'Cardio'      },
];

// One entry in the per-exercise reps list
type RepsEntry = { weight: number; reps: number; achieved_at: string };
type RepsSection = { title: string; exercise_template_id: number; data: RepsEntry[] };

// Cardio PR section data
type CardioEntry =
  | { kind: 'time'; label: string; time_min: number; achieved_at: string }
  | { kind: 'distance'; label: string; distance_km: number; achieved_at: string };
type CardioSection = { title: string; exercise_template_id: number; data: CardioEntry[] };

export default function PersonalRecordsScreen({ navigation }: Props) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [prs, setPrs]             = useState<PR[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'max_weight' | 'max_reps' | 'cardio'>('max_weight');

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/personal-records`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && alive) setPrs(await res.json());
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]));

  // ── Max Weight tab data ────────────────────────────────────────────────────
  const weightRows = useMemo(() =>
    prs
      .filter(p => p.pr_type === 'max_weight')
      .sort((a, b) => b.value - a.value),
    [prs],
  );

  // Estimated 1RM lookup for secondary display
  const est1rmMap = useMemo(() => {
    const m: Record<number, number> = {};
    prs.filter(p => p.pr_type === 'estimated_1rm').forEach(p => { m[p.exercise_template_id] = p.value; });
    return m;
  }, [prs]);

  // ── Max Reps tab data (grouped by exercise) ────────────────────────────────
  const repsSections: RepsSection[] = useMemo(() => {
    const map = new Map<number, RepsSection>();
    prs
      .filter(p => p.pr_type === 'max_reps' && p.weight_context != null)
      .forEach(p => {
        if (!map.has(p.exercise_template_id)) {
          map.set(p.exercise_template_id, {
            title: p.exercise_name,
            exercise_template_id: p.exercise_template_id,
            data: [],
          });
        }
        map.get(p.exercise_template_id)!.data.push({
          weight: p.weight_context!,
          reps:   p.value,
          achieved_at: p.achieved_at,
        });
      });

    // Sort sections alphabetically; within each, sort by weight descending
    return [...map.values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(s => ({
        ...s,
        data: s.data.sort((a, b) => b.weight - a.weight),
      }));
  }, [prs]);

  // ── Cardio tab data ───────────────────────────────────────────────────────
  const cardioSections: CardioSection[] = useMemo(() => {
    const map = new Map<number, CardioSection>();

    prs
      .filter(p => p.pr_type === 'best_time' || p.pr_type === 'best_distance')
      .forEach(p => {
        const key = p.exercise_template_id;
        if (!map.has(key)) {
          map.set(key, { title: p.exercise_name, exercise_template_id: key, data: [] });
        }
        if (p.pr_type === 'best_time') {
          map.get(key)!.data.push({
            kind: 'time',
            label: p.pr_label.replace(' Best Time', ''),
            time_min: p.value,
            achieved_at: p.achieved_at,
          });
        } else {
          map.get(key)!.data.push({
            kind: 'distance',
            label: p.pr_label.replace(' Best Distance', ''),
            distance_km: p.value,
            achieved_at: p.achieved_at,
          });
        }
      });

    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [prs]);

  const fmtTime = (mins: number) => {
    const m = Math.floor(mins);
    const s = Math.round((mins - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Personal Records</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, { color: active ? colors.accent : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : activeTab === 'max_weight' ? (
        /* ── Max Weight flat list ───────────────────────────────────────────── */
        <FlatList
          data={weightRows}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No max-weight records yet.</Text>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <Text style={[styles.rank, index < 3 && { color: colors.accent }]}>
                #{index + 1}
              </Text>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]}>
                  {item.exercise_name}
                </Text>
                <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                {est1rmMap[item.exercise_template_id] && (
                  <Text style={styles.est1rm}>
                    Est. 1RM · {est1rmMap[item.exercise_template_id].toFixed(1)} {unit}
                  </Text>
                )}
              </View>
              <View style={styles.rowRight}>
                <Ionicons
                  name="trophy"
                  size={13}
                  color={index === 0 ? '#FFD700' : colors.border}
                  style={{ marginBottom: 2 }}
                />
                <Text style={[styles.rowValue, index === 0 && { color: colors.accent }]}>
                  {item.value} {unit}
                </Text>
              </View>
            </View>
          )}
        />
      ) : activeTab === 'max_reps' ? (
        /* ── Max Reps section list, grouped by exercise ─────────────────────── */
        <SectionList
          sections={repsSections}
          keyExtractor={(item, i) => `${item.weight}-${i}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No per-weight rep records yet.{'\n'}Log some workouts to build your records.</Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isTop = index === 0;
            return (
              <View style={[
                styles.repsRow,
                { backgroundColor: colors.surface },
                index === section.data.length - 1 && styles.repsRowLast,
              ]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.repsWeight, { color: colors.textSecondary }]}>
                    {item.weight} {unit}
                  </Text>
                  <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                </View>
                <View style={styles.rowRight}>
                  {isTop && (
                    <Ionicons name="trophy" size={13} color="#FFD700" style={{ marginBottom: 2 }} />
                  )}
                  <Text style={[styles.rowValue, isTop && { color: colors.accent }]}>
                    {item.reps} reps
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        /* ── Cardio section list, grouped by exercise ────────────────────────── */
        <SectionList
          sections={cardioSections}
          keyExtractor={(item, i) => `cardio-${i}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No cardio records yet.{'\n'}Log a run or ride to see your best times.</Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isTop = index === 0;
            const isLast = index === section.data.length - 1;
            return (
              <View style={[
                styles.repsRow,
                { backgroundColor: colors.surface },
                isLast && styles.repsRowLast,
              ]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.repsWeight, { color: colors.textSecondary }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                </View>
                <View style={styles.rowRight}>
                  {isTop && (
                    <Ionicons name="trophy" size={13} color="#FFD700" style={{ marginBottom: 2 }} />
                  )}
                  <Text style={[styles.rowValue, isTop && { color: colors.accent }]}>
                    {item.kind === 'time'
                      ? fmtTime(item.time_min)
                      : `${item.distance_km.toFixed(2)} km`}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 15, fontWeight: '600' },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },

  // Shared row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rank: { width: 30, fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  rowDate: { fontSize: 12, color: colors.textSecondary },
  est1rm: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

  // Reps section list
  sectionHeader: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  repsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  repsRowLast: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  repsWeight: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
});
