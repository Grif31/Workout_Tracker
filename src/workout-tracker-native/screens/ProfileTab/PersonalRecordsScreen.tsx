import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, SectionList, ScrollView,
  TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LaurelBranch } from '../../components/LaurelWreath';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { apiFetch } from '../../utils/api';

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
  muscle_group: string;
};

const TABS = [
  { key: 'max_weight' as const, label: 'Max Weight' },
  { key: 'max_reps'   as const, label: 'Max Reps'   },
  { key: 'cardio'     as const, label: 'Cardio'      },
];

type RepsEntry = { weight: number; reps: number; achieved_at: string };
type RepsSection = {
  title: string;
  exercise_template_id: number;
  muscle_group: string;
  data: RepsEntry[];
};

type CardioEntry =
  | { kind: 'time'; label: string; time_min: number; achieved_at: string }
  | { kind: 'distance'; label: string; distance_km: number; achieved_at: string };
type CardioSection = { title: string; exercise_template_id: number; data: CardioEntry[] };

export default function PersonalRecordsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [prs, setPrs]             = useState<PR[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'max_weight' | 'max_reps' | 'cardio'>('max_weight');
  const [sortBy, setSortBy]       = useState<'default' | 'muscle'>('default');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const searchRef = useRef<TextInput>(null);

  const toggleSearch = () => {
    if (searchOpen) {
      setQuery('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch('/api/personal-records');
        if (res.ok && alive) setPrs(await res.json());
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []));

  // ── Max Weight ─────────────────────────────────────────────────────────────
  const weightRows = useMemo(() =>
    prs.filter(p => p.pr_type === 'max_weight').sort((a, b) => b.value - a.value),
    [prs],
  );

  const weightByMuscle = useMemo(() => {
    const map = new Map<string, PR[]>();
    weightRows.forEach(pr => {
      const m = pr.muscle_group || 'Other';
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(pr);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [weightRows]);

  const est1rmMap = useMemo(() => {
    const m: Record<number, number> = {};
    prs.filter(p => p.pr_type === 'estimated_1rm').forEach(p => { m[p.exercise_template_id] = p.value; });
    return m;
  }, [prs]);

  // ── Max Reps ───────────────────────────────────────────────────────────────
  const repsSections: RepsSection[] = useMemo(() => {
    const map = new Map<number, RepsSection>();
    prs
      .filter(p => p.pr_type === 'max_reps' && p.weight_context != null)
      .forEach(p => {
        if (!map.has(p.exercise_template_id)) {
          map.set(p.exercise_template_id, {
            title: p.exercise_name,
            exercise_template_id: p.exercise_template_id,
            muscle_group: p.muscle_group || 'Other',
            data: [],
          });
        }
        map.get(p.exercise_template_id)!.data.push({
          weight: p.weight_context!,
          reps:   p.value,
          achieved_at: p.achieved_at,
        });
      });
    return [...map.values()]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(s => ({ ...s, data: s.data.sort((a, b) => b.weight - a.weight) }));
  }, [prs]);

  const repsByMuscle = useMemo(() => {
    const map = new Map<string, RepsSection[]>();
    repsSections.forEach(s => {
      const m = s.muscle_group || 'Other';
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(s);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([muscle, sections]) => ({ muscle, sections }));
  }, [repsSections]);

  // ── Cardio ─────────────────────────────────────────────────────────────────
  const cardioSections: CardioSection[] = useMemo(() => {
    const map = new Map<number, CardioSection>();
    prs
      .filter(p => p.pr_type === 'best_time' || p.pr_type === 'best_distance')
      .forEach(p => {
        const key = p.exercise_template_id;
        if (!map.has(key)) map.set(key, { title: p.exercise_name, exercise_template_id: key, data: [] });
        if (p.pr_type === 'best_time') {
          map.get(key)!.data.push({ kind: 'time', label: p.pr_label.replace(' Best Time', ''), time_min: p.value, achieved_at: p.achieved_at });
        } else {
          map.get(key)!.data.push({ kind: 'distance', label: p.pr_label.replace(' Best Distance', ''), distance_km: p.value, achieved_at: p.achieved_at });
        }
      });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [prs]);

  const filteredWeightRows = useMemo(() => {
    if (!query) return weightRows;
    const q = query.toLowerCase();
    return weightRows.filter(p => p.exercise_name.toLowerCase().includes(q));
  }, [weightRows, query]);

  const filteredWeightByMuscle = useMemo(() => {
    if (!query) return weightByMuscle;
    const q = query.toLowerCase();
    return weightByMuscle
      .map(s => ({ ...s, data: s.data.filter(p => p.exercise_name.toLowerCase().includes(q)) }))
      .filter(s => s.data.length > 0);
  }, [weightByMuscle, query]);

  const filteredRepsSections = useMemo(() => {
    if (!query) return repsSections;
    const q = query.toLowerCase();
    return repsSections.filter(s => s.title.toLowerCase().includes(q));
  }, [repsSections, query]);

  const filteredRepsByMuscle = useMemo(() => {
    if (!query) return repsByMuscle;
    const q = query.toLowerCase();
    return repsByMuscle
      .map(m => ({ ...m, sections: m.sections.filter(s => s.title.toLowerCase().includes(q)) }))
      .filter(m => m.sections.length > 0);
  }, [repsByMuscle, query]);

  const filteredCardioSections = useMemo(() => {
    if (!query) return cardioSections;
    const q = query.toLowerCase();
    return cardioSections.filter(s => s.title.toLowerCase().includes(q));
  }, [cardioSections, query]);

  const fmtTime = (mins: number) => {
    const m = Math.floor(mins);
    const s = Math.round((mins - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const renderAccordionExercise = (section: RepsSection) => {
    const isExpanded = expandedIds.has(section.exercise_template_id);
    const best = section.data[0];
    return (
      <View key={section.exercise_template_id} style={[styles.accordionCard, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => toggleExpanded(section.exercise_template_id)}
          activeOpacity={0.7}
        >
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: colors.textPrimary }]}>{section.title}</Text>
            <Text style={styles.rowDate}>
              Best: {best.weight === 0 ? 'Bodyweight' : `${best.weight} ${unit}`} × {best.reps} reps
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {isExpanded && section.data.map((item, index) => {
          const isTop = index === 0;
          return (
            <View key={`${item.weight}-${index}`} style={[styles.repsRow, { borderTopColor: colors.border }]}>
              <View style={styles.rowInfo}>
                <Text style={[styles.repsWeight, { color: colors.textSecondary }]}>
                  {item.weight === 0 ? 'Bodyweight' : `${item.weight} ${unit}`}
                </Text>
                <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
              </View>
              <View style={styles.rowRight}>
                {isTop && <LaurelBranch height={18} color="#C9A84C" />}
                <Text style={[styles.rowValue, isTop && { color: colors.accent }]}>{item.reps} reps</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const showSortToggle = activeTab !== 'cardio';

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

      {/* Sort + Search bar */}
      <View style={[styles.sortBar, { borderBottomColor: colors.border }]}>
        {showSortToggle && (
          <>
            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'default' && { backgroundColor: colors.accent + '20' }]}
              onPress={() => setSortBy('default')}
            >
              <Text style={[styles.sortBtnText, { color: sortBy === 'default' ? colors.accent : colors.textSecondary }]}>
                {activeTab === 'max_weight' ? 'By Value' : 'A–Z'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'muscle' && { backgroundColor: colors.accent + '20' }]}
              onPress={() => setSortBy('muscle')}
            >
              <Ionicons name="body-outline" size={14} color={sortBy === 'muscle' ? colors.accent : colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.sortBtnText, { color: sortBy === 'muscle' ? colors.accent : colors.textSecondary }]}>
                By Muscle
              </Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[styles.searchIconBtn, searchOpen && { backgroundColor: colors.accent + '20' }]}
          onPress={toggleSearch}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={18}
            color={searchOpen ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Search input */}
      {searchOpen && (
        <View style={[styles.searchRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search exercises…"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : activeTab === 'max_weight' ? (
        sortBy === 'muscle' ? (
          /* Max Weight — grouped by muscle */
          <SectionList
            sections={filteredWeightByMuscle}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No max-weight records yet.</Text>}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item, index }) => (
              <View style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }]}>{item.exercise_name}</Text>
                  <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                  {est1rmMap[item.exercise_template_id] != null && (
                    <Text style={styles.est1rm}>Est. 1RM · {est1rmMap[item.exercise_template_id].toFixed(1)} {unit}</Text>
                  )}
                </View>
                <View style={styles.rowRight}>
                  {index === 0 && <LaurelBranch height={18} color="#C9A84C" />}
                  <Text style={[styles.rowValue, index === 0 && { color: colors.accent }]}>{item.value} {unit}</Text>
                </View>
              </View>
            )}
          />
        ) : (
          /* Max Weight — by value with rank */
          <FlatList
            data={filteredWeightRows}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No max-weight records yet.</Text>}
            renderItem={({ item, index }) => (
              <View style={[styles.row, { backgroundColor: colors.surface }]}>
                <Text style={[styles.rank, index < 3 && { color: colors.accent }]}>#{index + 1}</Text>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }]}>{item.exercise_name}</Text>
                  <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                  {est1rmMap[item.exercise_template_id] != null && (
                    <Text style={styles.est1rm}>Est. 1RM · {est1rmMap[item.exercise_template_id].toFixed(1)} {unit}</Text>
                  )}
                </View>
                <View style={styles.rowRight}>
                  {index === 0 && <LaurelBranch height={18} color="#C9A84C" />}
                  <Text style={[styles.rowValue, index === 0 && { color: colors.accent }]}>{item.value} {unit}</Text>
                </View>
              </View>
            )}
          />
        )
      ) : activeTab === 'max_reps' ? (
        /* Max Reps — accordion per exercise, optional muscle grouping */
        <ScrollView contentContainerStyle={styles.list}>
          {repsSections.length === 0 && (
            <Text style={styles.empty}>No per-weight rep records yet.{'\n'}Log some workouts to build your records.</Text>
          )}
          {sortBy === 'muscle'
            ? filteredRepsByMuscle.map(({ muscle, sections }) => (
                <View key={muscle}>
                  <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>{muscle}</Text>
                  </View>
                  {sections.map(renderAccordionExercise)}
                </View>
              ))
            : filteredRepsSections.map(renderAccordionExercise)
          }
        </ScrollView>
      ) : (
        /* Cardio */
        <SectionList
          sections={filteredCardioSections}
          keyExtractor={(item, i) => `cardio-${i}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No cardio records yet.{'\n'}Log a run or ride to see your best times.</Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isTop = index === 0;
            const isLast = index === section.data.length - 1;
            return (
              <View style={[
                styles.repsRow,
                { backgroundColor: colors.surface, borderTopColor: colors.border },
                isLast && styles.repsRowLast,
              ]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.repsWeight, { color: colors.textSecondary }]}>{item.label}</Text>
                  <Text style={styles.rowDate}>{fmtDate(item.achieved_at)}</Text>
                </View>
                <View style={styles.rowRight}>
                  {isTop && <LaurelBranch height={18} color="#C9A84C" />}
                  <Text style={[styles.rowValue, isTop && { color: colors.accent }]}>
                    {item.kind === 'time' ? fmtTime(item.time_min) : `${item.distance_km.toFixed(2)} km`}
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
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600' },
  searchIconBtn: {
    marginLeft: 'auto',
    padding: spacing.xs + 2,
    borderRadius: 20,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: spacing.xs,
  },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },

  // Max weight flat row
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

  // Accordion (max reps)
  accordionCard: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },

  // Reps rows inside accordion + cardio section rows
  repsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  repsRowLast: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  repsWeight: { fontSize: typography.fontSize.sm, fontWeight: '600', marginBottom: 2 },

  // Section headers (muscle groups + cardio exercises)
  sectionHeader: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: { fontSize: typography.fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
