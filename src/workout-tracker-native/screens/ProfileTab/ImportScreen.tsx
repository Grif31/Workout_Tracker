import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Share,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { shareAsync } from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, isNetworkError } from '../../utils/api';
import { useWorkoutSession } from '../../context/WorkoutSessionContext';
import { useGpsRunStatus } from '../../context/GpsRunContext';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Import'>;

type Source = 'hevy' | 'strong';
type WeightUnit = 'kg' | 'lbs';

const SOURCES: Record<Source, { name: string; path: string[]; note?: string }> = {
  hevy: { name: 'Hevy', path: ['Profile', 'Settings', 'Export & Import Data', 'Export Workouts'] },
  strong: { name: 'Strong', path: ['Settings', 'Export Strong Data'], note: 'Export it in English.' },
};
const SOURCE_KEYS = Object.keys(SOURCES) as Source[];

// The CSV is one row per set, for spreadsheets; the JSON is everything the
// account holds (body stats, PRs, routines), the GDPR copy. Progress photos are
// in it as links, not image data, so the copy doesn't promise the photos.
const EXPORTS = {
  workouts: {
    label: 'Workouts', format: 'CSV', icon: 'document-text-outline', path: '/api/workouts/export',
    sub: 'Every set you logged, ready for a spreadsheet',
    fileName: 'aretefitnessapp_workouts.csv', mimeType: 'text/csv', title: 'Export Workout Data',
  },
  all: {
    label: 'All My Data', format: 'JSON', icon: 'archive-outline', path: '/api/me/export',
    sub: 'Workouts, body stats, PRs and routines',
    fileName: 'aretefitnessapp_all_data.json', mimeType: 'application/json', title: 'Export All My Data',
  },
} as const;
type ExportKind = keyof typeof EXPORTS;

// The server caps a request at 10 MB, and JSON escaping adds a little
const MAX_FILE_BYTES = 9 * 1024 * 1024;

// A long history matches hundreds of exercises; the full list is one tap away
const COLLAPSED_ROWS = 5;

export type ImportPreview = {
  workouts: number;
  sets: number;
  /** Sets the file holds that their matched exercise can't store (reps on a timed hold) */
  skipped_sets?: number;
  already_imported: number;
  first_date: string;
  last_date: string;
  matched_exercises: { title: string; name: string; equipment: string | null }[];
  new_exercises: string[];
  weight_unit: WeightUnit;
  unit_in_file: boolean;
};

type ImportResult = { imported: number; already_imported: number; prs: number; badges: number };

type Picked = { source: Source; csv: string; weightUnit: WeightUnit; preview: ImportPreview };

const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// weightUnit null: the server falls back to the account's unit
async function postImport(path: string, source: Source, csv: string, weightUnit: WeightUnit | null) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, csv, weight_unit: weightUnit }),
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

export default function ImportScreen({ navigation, route }: Props) {
  const mode = route.params?.mode ?? 'import';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // A minimized workout or run bar sits under this screen and already clears the home indicator
  const { session } = useWorkoutSession();
  const run = useGpsRunStatus();
  const miniBarBelow = !!session || (run.trackingState !== 'idle' && !run.screenOpen);
  const [busy, setBusy] = useState<Source | 'import' | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<Record<Source, number>>({ hevy: 0, strong: 0 });
  const [expanded, setExpanded] = useState<{ matched: boolean; created: boolean }>({ matched: false, created: false });

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/import');
      if (res.ok) setImported((await res.json()).imported);
    } catch { /* the undo rows just stay hidden */ }
  }, []);

  useEffect(() => { if (mode === 'import') loadStatus(); }, [mode, loadStatus]);

  const preview = async (source: Source, csv: string) => {
    const { res, body } = await postImport('/api/import/preview', source, csv, null);
    if (!res.ok) {
      Alert.alert("Couldn't Read the File", body.message ?? 'Try again in a moment.');
      return;
    }
    setExpanded({ matched: false, created: false });
    setPicked({ source, csv, weightUnit: body.weight_unit, preview: body });
  };

  const pickFile = async (source: Source) => {
    setBusy(source);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];
      if (file.size && file.size > MAX_FILE_BYTES) {
        Alert.alert('File Too Large', 'Imports can be up to 9 MB.');
        return;
      }
      const csv = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      await preview(source, csv);
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Read the File", 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const changeUnit = (unit: WeightUnit) => {
    if (!picked || unit === picked.weightUnit) return;
    setPicked({ ...picked, weightUnit: unit });
  };

  const runImport = async () => {
    if (!picked) return;
    setBusy('import');
    try {
      const { res, body } = await postImport('/api/import', picked.source, picked.csv, picked.weightUnit);
      if (!res.ok) {
        Alert.alert("Couldn't Import", body.message ?? 'Try again in a moment.');
        return;
      }
      setResult(body);
      setPicked(null);
      loadStatus();
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Import", 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const undo = (source: Source) => {
    const { name } = SOURCES[source];
    Alert.alert(
      `Remove ${name} Workouts`,
      `This removes the ${plural(imported[source], 'workout')} imported from ${name}. Workouts you logged in Aretē stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiFetch(`/api/import/${source}`, { method: 'DELETE' });
              if (!res.ok) Alert.alert("Couldn't Remove", 'Try again in a moment.');
              loadStatus();
            } catch (err) {
              if (!isNetworkError(err)) Alert.alert("Couldn't Remove", 'Try again in a moment.');
            }
          },
        },
      ],
    );
  };

  const runExport = async (kind: ExportKind) => {
    const { path, fileName, mimeType, title } = EXPORTS[kind];
    setExporting(kind);
    try {
      const res = await apiFetch(path);
      if (!res.ok) { Alert.alert("Couldn't Export", 'Try again in a moment.'); return; }
      const text = await res.text();
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (dir) {
        const fileUri = dir + fileName;
        await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
        await shareAsync(fileUri, { mimeType, dialogTitle: title });
      } else {
        await Share.share({ title, message: text });
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Export", 'Try again in a moment.');
    } finally {
      setExporting(null);
    }
  };

  const tile = (content: React.ReactNode, tint = colors.accent) => (
    <View style={[styles.tile, { backgroundColor: tint + '1F' }]}>{content}</View>
  );

  const renderChoose = () => (
    <Animated.View entering={FadeIn.duration(200)}>
      <Text style={styles.intro}>
        Bring your training history over from another app. Export a CSV there, then pick the file here.
      </Text>

      <Text style={styles.sectionLabel}>Import from</Text>
      <View style={styles.group}>
        {SOURCE_KEYS.map((source, i) => {
          const { name, path, note } = SOURCES[source];
          return (
            <React.Fragment key={source}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.row}
                onPress={() => pickFile(source)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Import from ${name}`}
              >
                {tile(<Text style={styles.tileLetter}>{name[0]}</Text>)}
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{name}</Text>
                  <Text style={styles.rowSub}>
                    {path.join('  ›  ')}{note ? `. ${note}` : ''}
                  </Text>
                </View>
                {busy === source
                  ? <ActivityIndicator size="small" color={colors.textSecondary} />
                  : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.footnote}>You'll see what's in the file before anything is saved.</Text>

      {SOURCE_KEYS.some(s => imported[s] > 0) && (
        <>
          <Text style={styles.sectionLabel}>Imported</Text>
          <View style={styles.group}>
            {SOURCE_KEYS.filter(s => imported[s] > 0).map((source, i) => (
              <React.Fragment key={source}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  {tile(<Ionicons name="checkmark" size={18} color={colors.accent} />)}
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{SOURCES[source].name}</Text>
                    <Text style={styles.rowSub}>{plural(imported[source], 'workout')} imported</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => undo(source)}
                    style={styles.removeBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${SOURCES[source].name} Workouts`}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </React.Fragment>
            ))}
          </View>
        </>
      )}
    </Animated.View>
  );

  const renderExport = () => (
    <Animated.View entering={FadeIn.duration(200)}>
      <Text style={styles.intro}>
        Take a copy of everything you've logged in Aretē.
      </Text>

      <Text style={styles.sectionLabel}>Download</Text>
      <View style={styles.group}>
        {(Object.keys(EXPORTS) as ExportKind[]).map((kind, i) => {
          const e = EXPORTS[kind];
          return (
            <React.Fragment key={kind}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.row}
                onPress={() => runExport(kind)}
                disabled={exporting !== null}
                accessibilityRole="button"
                accessibilityLabel={`Export ${e.label} (${e.format})`}
              >
                {tile(<Ionicons name={e.icon} size={18} color={colors.textPrimary} />, colors.textSecondary)}
                <View style={styles.rowText}>
                  <View style={styles.labelLine}>
                    <Text style={styles.rowLabel}>{e.label}</Text>
                    <View style={styles.formatPill}><Text style={styles.formatText}>{e.format}</Text></View>
                  </View>
                  <Text style={styles.rowSub}>{e.sub}</Text>
                </View>
                {exporting === kind
                  ? <ActivityIndicator size="small" color={colors.textSecondary} />
                  : <Ionicons name="share-outline" size={18} color={colors.textSecondary} />}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.footnote}>Opens the share sheet, so you can save to Files or send it anywhere.</Text>
    </Animated.View>
  );

  const renderList = (
    key: 'matched' | 'created',
    rows: { key: string; title: string; sub?: string; isNew?: boolean }[],
  ) => {
    const open = expanded[key] || rows.length <= COLLAPSED_ROWS + 1;
    const shown = open ? rows : rows.slice(0, COLLAPSED_ROWS);
    return (
      <View style={styles.group}>
        {shown.map((r, i) => (
          <React.Fragment key={r.key}>
            {i > 0 && <View style={styles.listDivider} />}
            <View style={styles.listRow}>
              <View style={styles.rowText}>
                <Text style={styles.listTitle} numberOfLines={1}>{r.title}</Text>
                {r.sub && (
                  <View style={styles.savedAs}>
                    <Ionicons name="arrow-forward" size={11} color={colors.textSecondary} />
                    <Text style={styles.listSub} numberOfLines={1}>{r.sub}</Text>
                  </View>
                )}
              </View>
              {r.isNew && <View style={styles.newPill}><Text style={styles.newText}>New</Text></View>}
            </View>
          </React.Fragment>
        ))}
        {!open && (
          <>
            <View style={styles.listDivider} />
            <TouchableOpacity
              style={styles.showAll}
              onPress={() => setExpanded(e => ({ ...e, [key]: true }))}
              accessibilityRole="button"
            >
              <Text style={styles.showAllText}>Show all {rows.length.toLocaleString()}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.accent} />
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  const stat = (value: number, label: string) => (
    <View style={styles.stat} key={label} accessible accessibilityLabel={`${value.toLocaleString()} ${label}`}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderPreview = ({ source, weightUnit, preview: p }: Picked) => {
    const exerciseCount = p.matched_exercises.length + p.new_exercises.length;
    return (
      <Animated.View entering={FadeInDown.duration(260)}>
        <View style={styles.summary}>
          <View style={styles.summaryHead}>
            {tile(<Text style={styles.tileLetter}>{SOURCES[source].name[0]}</Text>)}
            <View style={styles.rowText}>
              <Text style={styles.summaryEyebrow}>From {SOURCES[source].name}</Text>
              <Text style={styles.summaryRange}>
                {p.workouts > 0 ? `${fmtDate(p.first_date)} to ${fmtDate(p.last_date)}` : 'Nothing new to import'}
              </Text>
            </View>
          </View>
          {p.workouts > 0 && (
            <View style={styles.statRow}>
              {stat(p.workouts, p.workouts === 1 ? 'Workout' : 'Workouts')}
              <View style={styles.statDivider} />
              {stat(p.sets, p.sets === 1 ? 'Set' : 'Sets')}
              <View style={styles.statDivider} />
              {stat(exerciseCount, exerciseCount === 1 ? 'Exercise' : 'Exercises')}
            </View>
          )}
          {p.already_imported > 0 && (
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.noticeText}>
                {plural(p.already_imported, 'workout')} already imported, skipped
              </Text>
            </View>
          )}
          {!!p.skipped_sets && (
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.noticeText}>
                {plural(p.skipped_sets, 'set')} skipped, the wrong kind for the exercise {p.skipped_sets === 1 ? 'it' : 'they'} matched
              </Text>
            </View>
          )}
        </View>

        {!p.unit_in_file && p.workouts > 0 && (
          <>
            <Text style={styles.sectionLabel}>Weights in this file are in</Text>
            <View style={styles.segment}>
              {(['lbs', 'kg'] as WeightUnit[]).map(unit => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.segmentBtn, weightUnit === unit && { backgroundColor: colors.accent }]}
                  onPress={() => changeUnit(unit)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: weightUnit === unit }}
                >
                  <Text style={[styles.segmentText, weightUnit === unit && styles.segmentTextActive]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.footnote}>{SOURCES[source].name} doesn't say in this file. Pick the unit you logged in.</Text>
          </>
        )}

        {p.matched_exercises.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Matched to the library · {p.matched_exercises.length.toLocaleString()}</Text>
            {renderList('matched', p.matched_exercises.map(m => {
              const ours = m.equipment ? `${m.name} (${m.equipment})` : m.name;
              return { key: m.title, title: m.title, sub: ours !== m.title ? `Saved as ${ours}` : undefined };
            }))}
          </>
        )}

        {p.new_exercises.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>New custom exercises · {p.new_exercises.length.toLocaleString()}</Text>
            {renderList('created', p.new_exercises.map(title => ({ key: title, title, isNew: true })))}
            <Text style={styles.footnote}>No match in the library, so these become your own exercises.</Text>
          </>
        )}
      </Animated.View>
    );
  };

  const renderPreviewActions = ({ preview: p }: Picked) => (
    <View style={[styles.actionBar, { paddingBottom: (miniBarBelow ? 0 : insets.bottom) + spacing.sm }]}>
      {busy === 'import' && <Text style={styles.actionHint}>A long history can take a little while.</Text>}
      <TouchableOpacity
        style={[styles.primaryBtn, (p.workouts === 0 || busy !== null) && styles.disabled]}
        onPress={runImport}
        disabled={p.workouts === 0 || busy !== null}
        accessibilityRole="button"
      >
        {busy === 'import'
          ? <ActivityIndicator size="small" color={colors.accentText} />
          : <Text style={styles.primaryText}>Import {plural(p.workouts, 'Workout')}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPicked(null)} disabled={busy !== null}>
        <Text style={styles.secondaryText}>Choose a Different File</Text>
      </TouchableOpacity>
    </View>
  );

  const renderResult = (r: ImportResult) => (
    <View style={styles.result}>
      <Animated.View entering={ZoomIn.duration(320)} style={[styles.doneBadge, { backgroundColor: colors.accent + '1F' }]}>
        <Ionicons name="checkmark" size={40} color={colors.accent} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.resultBody}>
        <Text style={styles.resultTitle}>Imported {plural(r.imported, 'workout')}</Text>
        <Text style={styles.resultSub}>They're in your history, scores and progress charts now.</Text>
        {(r.prs > 0 || r.badges > 0) && (
          <View style={[styles.statRow, styles.resultStats]}>
            {r.prs > 0 && stat(r.prs, r.prs === 1 ? 'PR' : 'PRs')}
            {r.prs > 0 && r.badges > 0 && <View style={styles.statDivider} />}
            {r.badges > 0 && stat(r.badges, r.badges === 1 ? 'Badge earned' : 'Badges earned')}
          </View>
        )}
        {r.already_imported > 0 && (
          <Text style={styles.resultSub}>{plural(r.already_imported, 'workout')} already imported, skipped</Text>
        )}
      </Animated.View>
      <TouchableOpacity style={[styles.primaryBtn, styles.resultBtn]} onPress={() => navigation.goBack()} accessibilityRole="button">
        <Text style={styles.primaryText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{picked ? 'Review Import' : mode === 'export' ? 'Export Data' : 'Import Data'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {/* Keyed by step: each step mounts fresh, so its entrance plays and it starts at the top */}
      <ScrollView key={result ? 'result' : picked ? 'preview' : 'choose'} contentContainerStyle={styles.content}>
        {mode === 'export' ? renderExport()
          : result ? renderResult(result) : picked ? renderPreview(picked) : renderChoose()}
      </ScrollView>
      {mode === 'import' && !result && picked && renderPreviewActions(picked)}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl * 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  headerSpacer: { width: 24 },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  intro: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  footnote: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    lineHeight: 16,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 60,
    gap: spacing.sm + 4,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLetter: { fontSize: typography.fontSize.md, fontWeight: '800', color: colors.accent },
  rowText: { flex: 1 },
  labelLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 3, lineHeight: 15 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 36 + spacing.sm + 4 },
  listDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md },
  formatPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  formatText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  removeBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  removeText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.danger },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  summaryEyebrow: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryRange: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: spacing.sm + 4,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  noticeText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 8 },
  segmentText: { fontSize: typography.fontSize.md, color: colors.textPrimary, fontWeight: '600' },
  segmentTextActive: { color: colors.accentText },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  listTitle: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  savedAs: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  listSub: { flexShrink: 1, fontSize: typography.fontSize.xs, color: colors.textSecondary },
  newPill: {
    backgroundColor: colors.accent + '1F',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  showAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm + 2,
  },
  showAllText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.accent },
  actionBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 4,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  secondaryBtn: { alignItems: 'center', paddingVertical: spacing.sm + 4 },
  secondaryText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: '600' },
  result: { alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xl * 2 },
  doneBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBody: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  resultTitle: { fontSize: typography.fontSize.xxl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  resultSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  resultStats: { alignSelf: 'stretch', backgroundColor: colors.surface, marginTop: spacing.sm },
  resultBtn: { alignSelf: 'stretch', marginTop: spacing.xl },
});
