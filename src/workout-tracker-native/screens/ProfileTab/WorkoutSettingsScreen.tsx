import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, StyleSheet, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  REST_TIMER_KEY, AUTO_REST_KEY, VIBRATE_KEY, RPE_KEY, PLATE_CALC_KEY, REPEAT_LAST_SET_KEY, PREFILL_PREVIOUS_KEY,
} from '../../components/workout/types';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'WorkoutSettings'>;

const REST_TIMER_PRESETS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const DEFAULT_REST = 90;

type Toggle = {
  key: string;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  fallback: boolean;
};

// The same switches as the in-workout settings menu, with the same defaults
// WorkoutLog falls back to when nothing is stored
const REST_TOGGLES: Toggle[] = [
  { key: AUTO_REST_KEY, label: 'Auto-start rest timer', hint: 'Start the rest countdown when a set is checked off', icon: 'play-circle-outline', fallback: true },
  { key: VIBRATE_KEY, label: 'Vibrate when rest ends', hint: 'Vibrate the phone when the rest countdown completes', icon: 'phone-portrait-outline', fallback: true },
];
const LOGGING_TOGGLES: Toggle[] = [
  { key: RPE_KEY, label: 'Track RPE', hint: 'Show an RPE input on each strength set', icon: 'speedometer-outline', fallback: false },
  { key: PLATE_CALC_KEY, label: 'Show plate calculator', hint: 'Show a plate calculator button while logging sets', icon: 'calculator-outline', fallback: true },
  { key: REPEAT_LAST_SET_KEY, label: 'Repeat last set', hint: "Add Set copies the last set's reps and weight", icon: 'copy-outline', fallback: false },
  { key: PREFILL_PREVIOUS_KEY, label: 'Prefill previous sets', hint: "Fill a new exercise's sets with last session's reps and weight", icon: 'reload-outline', fallback: true },
];
const ALL_TOGGLES = [...REST_TOGGLES, ...LOGGING_TOGGLES];

const formatRestTimer = (secs: number) => {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function WorkoutSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uid = user?.id;
  const restTimerKey = `${REST_TIMER_KEY}_${uid}`;

  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_TOGGLES.map(t => [t.key, t.fallback])),
  );

  useEffect(() => {
    AsyncStorage.multiGet([restTimerKey, ...ALL_TOGGLES.map(t => `${t.key}_${uid}`)]).then(pairs => {
      const rest = parseInt(pairs[0][1] ?? '', 10);
      if (rest > 0) setRestSeconds(rest);
      setToggles(Object.fromEntries(ALL_TOGGLES.map((t, i) => {
        const v = pairs[i + 1][1];
        return [t.key, v === null ? t.fallback : v === 'true'];
      })));
    });
  }, []);

  const setToggle = (key: string, value: boolean) => {
    setToggles(prev => ({ ...prev, [key]: value }));
    AsyncStorage.setItem(`${key}_${uid}`, String(value));
  };

  const pickRest = (secs: number) => {
    setRestSeconds(secs);
    AsyncStorage.setItem(restTimerKey, String(secs));
    setPickerVisible(false);
  };

  // dividerAbove: false for the first row of a group
  const renderToggle = (t: Toggle, dividerAbove = true) => (
    <React.Fragment key={t.key}>
      {dividerAbove && <View style={styles.divider} />}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Ionicons name={t.icon} size={20} color={colors.textSecondary} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t.label}</Text>
            <Text style={styles.rowHint}>{t.hint}</Text>
          </View>
        </View>
        <Switch
          value={toggles[t.key]}
          onValueChange={v => setToggle(t.key, v)}
          accessibilityLabel={t.label}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor="#fff"
        />
      </View>
    </React.Fragment>
  );

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.sectionLabel}>Rest Timer</Text>
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Default rest timer, ${formatRestTimer(restSeconds)}`}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="timer-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>Default Rest Timer</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{formatRestTimer(restSeconds)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          {REST_TOGGLES.map(t => renderToggle(t))}
        </View>

        <Text style={styles.sectionLabel}>Logging</Text>
        <View style={styles.group}>
          {LOGGING_TOGGLES.map((t, i) => renderToggle(t, i > 0))}
        </View>

        <Text style={styles.footnote}>These apply from the next workout you open.</Text>
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Default Rest Timer</Text>
            <View style={styles.restGrid}>
              {REST_TIMER_PRESETS.map(secs => {
                const selected = restSeconds === secs;
                return (
                  <TouchableOpacity
                    key={secs}
                    style={[styles.restOption, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    onPress={() => pickRest(secs)}
                    activeOpacity={0.7}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.restOptionText, selected && { color: colors.accentText }]}>
                      {formatRestTimer(secs)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.restHint}>
              Longer rest lets you lift more on the next set. A good start: 1-2 min for isolation and
              accessory work, 2-3 min for compound lifts, 3-5 min for heavy sets of 1-5 reps.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
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
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
    sectionLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    group: {
      backgroundColor: colors.surface,
      marginHorizontal: spacing.md,
      borderRadius: spacing.sm,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 52,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowText: { flex: 1 },
    rowLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
    rowHint: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
    rowValue: { fontSize: typography.fontSize.md, color: colors.textSecondary },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
    footnote: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.md,
    },
    modalTitle: {
      fontSize: typography.fontSize.md,
      fontWeight: '700',
      color: colors.textSecondary,
      textAlign: 'center',
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.xs,
    },
    restGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    restOption: {
      width: '30%',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    restOptionText: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    restHint: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, paddingHorizontal: spacing.lg },
  });
