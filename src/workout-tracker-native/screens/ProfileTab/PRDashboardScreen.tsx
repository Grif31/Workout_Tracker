import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LaurelBranch } from '../../components/LaurelWreath';
import DraggableList from '../../components/DraggableList';
import PRShareCard from '../../components/PRShareCard';
import { loadPrPins, type PRPin } from '../../utils/prPins';
import { PR_GOLD, PR_GOLD_TEXT } from '../../constants/prColors';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { captureAndShare } from '../../utils/shareCapture';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';
import { fmtPrValue, fmtPrContext, fmtPrDelta, type PREventItem } from '../../utils/prFormat';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'PRDashboard'>;

type WorkoutBest = { workout_id: number; workout_name: string; date: string; value: number } | null;

type DashboardData = {
  recent_events: PREventItem[];
  page: number;
  has_more: boolean;
  workout_bests: { best_volume: WorkoutBest; best_total_reps: WorkoutBest };
  stats: {
    prs_this_month: number;
    pr_streak_weeks: number;
    total_prs: number;
    days_since_last_pr: {
      exercise_template_id: number;
      exercise_name: string;
      days_since_last_pr: number;
    }[];
  };
};

const FILTERS = [
  { key: null,       label: 'All'      },
  { key: 'weight',   label: 'Weight'   },
  { key: 'reps',     label: 'Reps'     },
  { key: 'time',     label: 'Time'     },
  { key: 'distance', label: 'Distance' },
] as const;

const STALLED_SHOWN = 5;

type SectionKey = 'hero' | 'records' | 'stalled' | 'progression';
type SectionConfig = { key: SectionKey; visible: boolean };

export const PR_DASHBOARD_LAYOUT_KEY = 'pr_dashboard_layout';

const DEFAULT_LAYOUT: SectionConfig[] = [
  { key: 'hero',        visible: true },
  { key: 'records',     visible: true },
  { key: 'stalled',     visible: true },
  { key: 'progression', visible: true },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  hero:        'Stats',
  records:     'Workout Records',
  stalled:     'Time Since Last PR',
  progression: 'Pinned Progression',
};

export default function PRDashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unit = user?.weight_unit || 'lbs';

  const [data, setData]             = useState<DashboardData | null>(null);
  const [events, setEvents]         = useState<PREventItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter]         = useState<typeof FILTERS[number]['key']>(null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('mi');
  const [shareEvent, setShareEvent] = useState<PREventItem | null>(null);
  const [layout, setLayout]         = useState<SectionConfig[]>(DEFAULT_LAYOUT);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [pins, setPins]             = useState<PRPin[]>([]);
  const shareRef = useRef<View>(null);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${PR_DASHBOARD_LAYOUT_KEY}_${user.id}`).then(raw => {
      if (!raw) return;
      try {
        const stored: SectionConfig[] = JSON.parse(raw);
        // Keep only known sections, append any new defaults added since save
        const known = stored.filter(s => DEFAULT_LAYOUT.some(d => d.key === s.key));
        const missing = DEFAULT_LAYOUT.filter(d => !known.some(s => s.key === d.key));
        setLayout([...known, ...missing]);
      } catch {}
    });
  }, [user?.id]);

  const persistLayout = (next: SectionConfig[]) => {
    setLayout(next);
    if (user?.id) {
      AsyncStorage.setItem(`${PR_DASHBOARD_LAYOUT_KEY}_${user.id}`, JSON.stringify(next)).catch(() => {});
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      setDistanceUnit(v === 'km' ? 'km' : 'mi');
    });
  }, [user?.id]);

  const fetchPage = useCallback(async (page: number, type: typeof filter) => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (type) params.set('type', type);
    const res = await apiFetch(`/api/personal-records/dashboard?${params}`);
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  }, []);

  const filterRef = useRef(filter);
  filterRef.current = filter;

  const loadFirstPage = useCallback(async (type: typeof filter, isAlive: () => boolean) => {
    try {
      const d = await fetchPage(1, type);
      if (d && isAlive()) {
        setData(d);
        setEvents(d.recent_events);
      }
    } catch {}
    if (isAlive()) setLoading(false);
  }, [fetchPage]);

  // Refresh on focus with whatever filter is active (PRs can change after
  // editing/deleting a workout reached from this screen)
  useFocusEffect(useCallback(() => {
    let alive = true;
    loadFirstPage(filterRef.current, () => alive);
    // Pins are toggled on PRProgressionScreen — refresh them on the way back
    if (user?.id) {
      loadPrPins(user.id).then(p => { if (alive) setPins(p); });
    }
    return () => { alive = false; };
  }, [loadFirstPage, user?.id]));

  // Refetch on filter change; skip the first run — the focus effect covers mount
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    let alive = true;
    setLoading(true);
    loadFirstPage(filter, () => alive);
    return () => { alive = false; };
  }, [filter, loadFirstPage]);

  const loadMore = async () => {
    if (!data?.has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(data.page + 1, filter);
      if (d) {
        setData(d);
        setEvents(prev => [...prev, ...d.recent_events]);
      }
    } catch {}
    setLoadingMore(false);
  };

  const sharePr = (event: PREventItem) => {
    setShareEvent(event);
    // Let the off-screen card render before capturing it
    setTimeout(async () => {
      try {
        await captureAndShare(shareRef, 'Share your PR');
      } catch {}
      setShareEvent(null);
    }, 100);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const openWorkout = (workoutId: number) => navigation.navigate('WorkoutDetails', { workoutId });

  const openProgression = (event: { exercise_template_id: number; exercise_name?: string }) =>
    navigation.navigate('PRProgression', {
      exerciseTemplateId: event.exercise_template_id,
      exerciseName: event.exercise_name ?? '',
    });

  const stats = data?.stats;
  const bests = data?.workout_bests;
  const stalled = stats?.days_since_last_pr.slice(0, STALLED_SHOWN) ?? [];

  const renderSection = (key: SectionKey) => {
    switch (key) {
      case 'hero': return stats ? (
        <View style={styles.heroRow}>
          <View style={[styles.heroBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heroValue, { color: PR_GOLD_TEXT }]}>{stats.prs_this_month}</Text>
            <Text style={styles.heroLabel}>PRs this month</Text>
          </View>
          <View style={[styles.heroBox, { backgroundColor: colors.surface }]}>
            <View style={styles.heroLaurelRow}>
              <LaurelBranch height={16} color={PR_GOLD} />
              <Text style={[styles.heroValue, { color: PR_GOLD_TEXT }]}>{stats.pr_streak_weeks}</Text>
              <LaurelBranch side="right" height={16} color={PR_GOLD} />
            </View>
            <Text style={styles.heroLabel}>week PR streak</Text>
          </View>
          <View style={[styles.heroBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heroValue, { color: PR_GOLD_TEXT }]}>{stats.total_prs}</Text>
            <Text style={styles.heroLabel}>total PRs</Text>
          </View>
        </View>
      ) : null;

      case 'records': return bests && (bests.best_volume || bests.best_total_reps) ? (
        <View>
          <Text style={styles.sectionTitle}>Workout Records</Text>
          <View style={styles.bestsRow}>
            {bests.best_volume && (
              <TouchableOpacity
                style={[styles.bestCard, { backgroundColor: colors.surface }]}
                onPress={() => openWorkout(bests.best_volume!.workout_id)}
                activeOpacity={0.7}
              >
                <Text style={styles.bestLabel}>Most Volume</Text>
                <Text style={[styles.bestValue, { color: colors.textPrimary }]}>
                  {bests.best_volume.value.toLocaleString()} lbs
                </Text>
                <Text style={styles.bestMeta} numberOfLines={1}>
                  {bests.best_volume.workout_name} · {fmtDate(bests.best_volume.date)}
                </Text>
              </TouchableOpacity>
            )}
            {bests.best_total_reps && (
              <TouchableOpacity
                style={[styles.bestCard, { backgroundColor: colors.surface }]}
                onPress={() => openWorkout(bests.best_total_reps!.workout_id)}
                activeOpacity={0.7}
              >
                <Text style={styles.bestLabel}>Most Reps</Text>
                <Text style={[styles.bestValue, { color: colors.textPrimary }]}>
                  {bests.best_total_reps.value.toLocaleString()} reps
                </Text>
                <Text style={styles.bestMeta} numberOfLines={1}>
                  {bests.best_total_reps.workout_name} · {fmtDate(bests.best_total_reps.date)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null;

      case 'stalled': return stalled.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Time Since Last PR</Text>
          <View style={[styles.stalledCard, { backgroundColor: colors.surface }]}>
            {stalled.map((row, i) => (
              <TouchableOpacity
                key={row.exercise_template_id}
                style={[styles.stalledRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                onPress={() => openProgression(row)}
                activeOpacity={0.7}
              >
                <Text style={[styles.stalledName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {row.exercise_name}
                </Text>
                <Text style={styles.stalledDays}>
                  {row.days_since_last_pr === 0 ? 'Today' : `${row.days_since_last_pr}d ago`}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null;

      case 'progression': return (
        <View>
          <Text style={styles.sectionTitle}>Pinned Progression</Text>
          {pins.length === 0 ? (
            <Text style={styles.pinsHint}>
              Pin lifts from their progression view to keep them here.
            </Text>
          ) : (
            <View style={[styles.stalledCard, { backgroundColor: colors.surface }]}>
              {pins.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.stalledRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  onPress={() => navigation.navigate('PRProgression', { exerciseTemplateId: p.id, exerciseName: p.name })}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pin" size={14} color={colors.accent} />
                  <Text style={[styles.stalledName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      );
    }
  };

  const renderHeader = () => (
    <View>
      {layout.filter(s => s.visible).map(s => (
        <View key={s.key}>{renderSection(s.key)}</View>
      ))}

      {/* Feed title + filter chips */}
      <Text style={styles.sectionTitle}>Recent PRs</Text>
      <View style={styles.chipRow}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, { borderColor: colors.border }, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, { color: active ? colors.accent : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderEvent = ({ item }: { item: PREventItem }) => {
    const context = fmtPrContext(item, unit);
    const delta = fmtPrDelta(item, unit, distanceUnit);
    return (
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: colors.surface }]}
        onPress={() => openWorkout(item.workout_id)}
        activeOpacity={0.7}
      >
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.exercise_name}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {item.pr_label}{context ? ` ${context}` : ''} · {fmtDate(item.achieved_at)}
          </Text>
        </View>
        <View style={styles.eventRight}>
          <Text style={[styles.eventValue, { color: colors.textPrimary }]}>
            {fmtPrValue(item, unit, distanceUnit)}
          </Text>
          {delta && <Text style={[styles.eventDelta, { color: colors.save }]}>▲ {delta}</Text>}
        </View>
        <View style={styles.eventActions}>
          <TouchableOpacity onPress={() => openProgression(item)} hitSlop={8}>
            <Ionicons name="stats-chart-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => sharePr(item)} hitSlop={8}>
            <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PR Dashboard</Text>
        <TouchableOpacity
          onPress={() => setCustomizeOpen(true)}
          style={styles.gearBtn}
          hitSlop={8}
          accessibilityLabel="Customize dashboard"
        >
          <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {filter ? 'No PRs of this type yet.' : 'No PRs yet.\nLog some workouts to start your history.'}
            </Text>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} /> : null}
          renderItem={renderEvent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* Customize sections modal */}
      <Modal
        visible={customizeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomizeOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCustomizeOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Customize Dashboard</Text>
            <Text style={styles.modalHint}>
              Long-press and drag to reorder. Tap the eye to show or hide a section.
            </Text>
            <DraggableList
              data={layout}
              keyExtractor={s => s.key}
              rowHeight={48}
              gap={spacing.sm}
              onReorder={(from, to) => {
                const next = [...layout];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                persistLayout(next);
              }}
              renderItem={item => (
                <View style={[styles.customizeRow, { backgroundColor: colors.background }]}>
                  <Ionicons name="reorder-three-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.customizeLabel, { color: item.visible ? colors.textPrimary : colors.textSecondary }]}>
                    {SECTION_LABELS[item.key]}
                  </Text>
                  <TouchableOpacity
                    onPress={() => persistLayout(layout.map(s => s.key === item.key ? { ...s, visible: !s.visible } : s))}
                    hitSlop={8}
                    accessibilityLabel={`${item.visible ? 'Hide' : 'Show'} ${SECTION_LABELS[item.key]}`}
                  >
                    <Ionicons
                      name={item.visible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={item.visible ? colors.accent : colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity
              style={[styles.modalDone, { backgroundColor: colors.accent }]}
              onPress={() => setCustomizeOpen(false)}
            >
              <Text style={[styles.modalDoneText, { color: colors.accentText }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Off-screen share card */}
      {shareEvent && (
        <View ref={shareRef} style={styles.offscreen} collapsable={false}>
          <PRShareCard
            exerciseName={shareEvent.exercise_name ?? ''}
            prLabel={shareEvent.pr_label ?? 'PR'}
            value={fmtPrValue(shareEvent, unit, distanceUnit)}
            delta={fmtPrDelta(shareEvent, unit, distanceUnit)}
            date={fmtDate(shareEvent.achieved_at)}
            accentColor={colors.accent}
          />
        </View>
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
  gearBtn: { width: 40, alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    lineHeight: 22,
  },

  heroRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  heroBox: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  heroLaurelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroValue: { fontSize: typography.fontSize.xl, fontWeight: '800' },
  heroLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  bestsRow: { flexDirection: 'row', gap: spacing.sm },
  bestCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bestLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  bestValue: { fontSize: typography.fontSize.lg, fontWeight: '800', marginTop: 4 },
  bestMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 4 },

  stalledCard: { borderRadius: radius.md, overflow: 'hidden' },
  stalledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  stalledName: { flex: 1, fontSize: typography.fontSize.md, fontWeight: '600' },
  stalledDays: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '600' },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  eventInfo: { flex: 1 },
  eventName: { fontSize: typography.fontSize.md, fontWeight: '600', marginBottom: 2 },
  eventMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  eventRight: { alignItems: 'flex-end' },
  eventValue: { fontSize: typography.fontSize.md, fontWeight: '700' },
  eventDelta: { fontSize: typography.fontSize.xs, fontWeight: '700', marginTop: 2 },
  eventActions: { gap: spacing.sm, alignItems: 'center' },

  offscreen: { position: 'absolute', left: -9999, top: -9999 },

  pinsHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  modalHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  customizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  customizeLabel: {
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: '600',
  },
  modalDone: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  modalDoneText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
  },
});
