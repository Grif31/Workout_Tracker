import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, isNetworkError } from '../../utils/api';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Import'>;

type Source = 'hevy' | 'strong';
type WeightUnit = 'kg' | 'lbs';

const SOURCES: Record<Source, { name: string; howTo: string }> = {
  hevy: { name: 'Hevy', howTo: 'In Hevy: Profile, Settings, Export & Import Data, Export Workouts.' },
  strong: { name: 'Strong', howTo: 'In Strong: Settings, Export Strong Data. Export it in English.' },
};

// The server caps a request at 10 MB, and JSON escaping adds a little
const MAX_FILE_BYTES = 9 * 1024 * 1024;

export type ImportPreview = {
  workouts: number;
  sets: number;
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

export default function ImportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState<Source | 'import' | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<Record<Source, number>>({ hevy: 0, strong: 0 });

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/import');
      if (res.ok) setImported((await res.json()).imported);
    } catch { /* the undo rows just stay hidden */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const preview = async (source: Source, csv: string) => {
    const { res, body } = await postImport('/api/import/preview', source, csv, null);
    if (!res.ok) {
      Alert.alert("Couldn't Read the File", body.message ?? 'Try again in a moment.');
      return;
    }
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

  const renderChoose = () => (
    <>
      <Text style={styles.intro}>
        Bring your workout history over from another app. Export a CSV there, then pick the file here.
      </Text>
      <Text style={styles.sectionLabel}>Import from</Text>
      <View style={styles.group}>
        {(Object.keys(SOURCES) as Source[]).map((source, i) => (
          <React.Fragment key={source}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity
              style={styles.row}
              onPress={() => pickFile(source)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`Import from ${SOURCES[source].name}`}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{SOURCES[source].name}</Text>
                <Text style={styles.rowSub}>{SOURCES[source].howTo}</Text>
              </View>
              {busy === source
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Ionicons name="document-outline" size={18} color={colors.textSecondary} />}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>

      {(Object.keys(SOURCES) as Source[]).some(s => imported[s] > 0) && (
        <>
          <Text style={styles.sectionLabel}>Imported</Text>
          <View style={styles.group}>
            {(Object.keys(SOURCES) as Source[]).filter(s => imported[s] > 0).map((source, i) => (
              <React.Fragment key={source}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity style={styles.row} onPress={() => undo(source)} accessibilityRole="button">
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: colors.danger }]}>
                      Remove {SOURCES[source].name} Workouts
                    </Text>
                    <Text style={styles.rowSub}>{plural(imported[source], 'workout')} imported</Text>
                  </View>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </>
      )}
    </>
  );

  const renderPreview = ({ source, weightUnit, preview: p }: Picked) => (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {p.workouts > 0 ? plural(p.workouts, 'workout') : 'Nothing new'}
        </Text>
        {p.workouts > 0 && (
          <Text style={styles.cardSub}>
            {plural(p.sets, 'set')} · {fmtDate(p.first_date)} to {fmtDate(p.last_date)}
          </Text>
        )}
        {p.already_imported > 0 && (
          <Text style={styles.cardSub}>
            {plural(p.already_imported, 'workout')} already imported, skipped
          </Text>
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
          <Text style={styles.hint}>{SOURCES[source].name} doesn't say in this file. Pick the unit you logged in.</Text>
        </>
      )}

      {p.matched_exercises.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{plural(p.matched_exercises.length, 'exercise')} matched</Text>
          <View style={styles.group}>
            {p.matched_exercises.map((m, i) => {
              const ours = m.equipment ? `${m.name} (${m.equipment})` : m.name;
              return (
                <React.Fragment key={m.title}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.listRow}>
                    <Text style={styles.listTitle} numberOfLines={1}>{m.title}</Text>
                    {ours !== m.title && <Text style={styles.listSub} numberOfLines={1}>Saved as {ours}</Text>}
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </>
      )}

      {p.new_exercises.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{plural(p.new_exercises.length, 'new custom exercise')}</Text>
          <View style={styles.group}>
            {p.new_exercises.map((title, i) => (
              <React.Fragment key={title}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.listRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>{title}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.hint}>No match in the library, so these become your own exercises.</Text>
        </>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, (p.workouts === 0 || busy !== null) && styles.disabled]}
        onPress={runImport}
        disabled={p.workouts === 0 || busy !== null}
        accessibilityRole="button"
      >
        {busy === 'import'
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.primaryText}>Import {plural(p.workouts, 'Workout')}</Text>}
      </TouchableOpacity>
      {busy === 'import' && <Text style={styles.hint}>A long history can take a minute.</Text>}
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPicked(null)} disabled={busy !== null}>
        <Text style={styles.secondaryText}>Cancel</Text>
      </TouchableOpacity>
    </>
  );

  const renderResult = (r: ImportResult) => (
    <>
      <View style={styles.card}>
        <Ionicons name="checkmark-circle" size={40} color={colors.accent} style={styles.doneIcon} />
        <Text style={styles.cardTitle}>Imported {plural(r.imported, 'workout')}</Text>
        {(r.prs > 0 || r.badges > 0) && (
          <Text style={styles.cardSub}>
            {[r.prs > 0 && plural(r.prs, 'PR'), r.badges > 0 && `${plural(r.badges, 'badge')} earned`]
              .filter(Boolean).join(' · ')}
          </Text>
        )}
        {r.already_imported > 0 && (
          <Text style={styles.cardSub}>{plural(r.already_imported, 'workout')} already imported, skipped</Text>
        )}
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()} accessibilityRole="button">
        <Text style={styles.primaryText}>Done</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Workouts</Text>
        <View style={{ width: 24 }} />
      </View>
      {result ? renderResult(result) : picked ? renderPreview(picked) : renderChoose()}
    </ScrollView>
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
  group: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  rowSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  doneIcon: { marginBottom: spacing.sm },
  cardTitle: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  cardSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 8 },
  segmentText: { fontSize: typography.fontSize.md, color: colors.textPrimary, fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    textAlign: 'center',
  },
  listRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  listTitle: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  listSub: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: typography.fontSize.md, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  secondaryBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  secondaryText: { color: colors.textSecondary, fontSize: typography.fontSize.md },
});
