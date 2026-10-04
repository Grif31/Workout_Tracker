import React, { useEffect, useMemo, useState } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LIVE_WORKOUT_NOTIF_KEY, REST_ALERTS_KEY, REMINDERS_KEY, REMINDER_HOUR_KEY, REMINDER_MIN_KEY,
} from '../../constants/storageKeys';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ACCENT_PRESETS, KEY_ACCENT, type Colors, type ThemePreference } from '../../context/ThemeContext';
import SegmentedControl from '../../components/SegmentedControl';
import { usePurchase } from '../../context/PurchaseContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, isNetworkError } from '../../utils/api';
import { APP_ICONS_ENABLED, HEALTH_SYNC_ENABLED } from '../../constants/featureFlags';
import {
  requestNotificationPermission,
  hasNotificationPermission,
  scheduleWorkoutReminder,
  cancelWorkoutReminder,
} from '../../utils/notifications';
import { HEALTH_SYNC_KEY, requestHealthKitPermission } from '../../utils/healthKit';
import {
  REST_TIMER_KEY, AUTO_REST_KEY, VIBRATE_KEY, RPE_KEY, PLATE_CALC_KEY, REPEAT_LAST_SET_KEY, PREFILL_PREVIOUS_KEY,
} from '../../components/workout/types';
import { requestHealthConnectPermission } from '../../utils/healthConnect';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';
import { openExternalLink } from '../../utils/links';

// Reads the live app.config.js version so this never drifts out of sync again.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const REST_TIMER_PRESETS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

const THEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const satisfies readonly { key: ThemePreference; label: string }[];

// The same switches as the in-workout settings menu, with the same defaults
// WorkoutLog falls back to when nothing is stored
const WORKOUT_TOGGLES = [
  { key: AUTO_REST_KEY, label: 'Auto-start rest timer', hint: 'Start the rest countdown when a set is checked off', icon: 'play-circle-outline', fallback: true },
  { key: VIBRATE_KEY, label: 'Vibrate when rest ends', hint: 'Vibrate the phone when the rest countdown completes', icon: 'phone-portrait-outline', fallback: true },
  { key: RPE_KEY, label: 'Track RPE', hint: 'Show an RPE input on each strength set', icon: 'speedometer-outline', fallback: false },
  { key: PLATE_CALC_KEY, label: 'Show plate calculator', hint: 'Show a plate calculator button while logging sets', icon: 'calculator-outline', fallback: true },
  { key: REPEAT_LAST_SET_KEY, label: 'Repeat last set', hint: "Add Set copies the last set's reps and weight", icon: 'copy-outline', fallback: false },
  { key: PREFILL_PREVIOUS_KEY, label: 'Prefill previous sets', hint: "Fill a new exercise's sets with last session's reps and weight", icon: 'reload-outline', fallback: true },
] as const;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors, mode, accentPreset, themePreference, setThemePreference, setAccentPreset } = useTheme();
  const { isPremium } = usePurchase();
  const uid = user?.id;
  const perUserRestTimerKey    = `${REST_TIMER_KEY}_${uid}`;
  const perUserHealthSyncKey   = `${HEALTH_SYNC_KEY}_${uid}`;
  const perUserGpsKey          = `${GPS_DISTANCE_UNIT_KEY}_${uid}`;
  const perUserRemindersKey    = `${REMINDERS_KEY}_${uid}`;
  const perUserReminderHourKey = `${REMINDER_HOUR_KEY}_${uid}`;
  const perUserReminderMinKey  = `${REMINDER_MIN_KEY}_${uid}`;

  const [unitIsKg, setUnitIsKg]             = useState(user?.weight_unit === 'kg');
  const [distanceIsKm, setDistanceIsKm]     = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState('90');
  const [savingUnit, setSavingUnit]         = useState(false);
  // Notification settings
  const [remindersOn, setRemindersOn]   = useState(false);
  const [restAlertsOn, setRestAlertsOn] = useState(true);
  const [liveNotifOn, setLiveNotifOn]   = useState(true);
  const [reminderHour, setReminderHour] = useState('9');
  const [reminderMin, setReminderMin]   = useState('00');

  const [accentModalVisible, setAccentModalVisible] = useState(false);
  const [restTimerPickerVisible, setRestTimerPickerVisible] = useState(false);
  const [reminderPickerVisible, setReminderPickerVisible] = useState(false);
  const [pendingReminderDate, setPendingReminderDate] = useState(() => {
    const d = new Date(); d.setHours(9, 0, 0, 0); return d;
  });

  // Health sync
  const [healthSyncOn, setHealthSyncOn] = useState(false);
  const [workoutToggles, setWorkoutToggles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(WORKOUT_TOGGLES.map(t => [t.key, t.fallback])),
  );

  useEffect(() => {
    AsyncStorage.multiGet(WORKOUT_TOGGLES.map(t => `${t.key}_${uid}`)).then(pairs => {
      setWorkoutToggles(Object.fromEntries(WORKOUT_TOGGLES.map((t, i) => {
        const v = pairs[i][1];
        return [t.key, v === null ? t.fallback : v === 'true'];
      })));
    });
  }, []);

  const setWorkoutToggle = (key: string, value: boolean) => {
    setWorkoutToggles(prev => ({ ...prev, [key]: value }));
    AsyncStorage.setItem(`${key}_${uid}`, String(value));
  };

  useEffect(() => {
    AsyncStorage.multiGet([
      perUserRestTimerKey, perUserRemindersKey, REST_ALERTS_KEY, LIVE_WORKOUT_NOTIF_KEY,
      perUserReminderHourKey, perUserReminderMinKey, perUserHealthSyncKey, perUserGpsKey,
    ]).then(async pairs => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
      if (map[perUserRestTimerKey]) setRestTimerSeconds(map[perUserRestTimerKey]!);
      if (map[perUserRemindersKey] === 'true') {
        // Notifications turned off in the phone's settings mean no reminder
        // will fire, so the switch shouldn't claim one will
        if (await hasNotificationPermission()) setRemindersOn(true);
        else AsyncStorage.setItem(perUserRemindersKey, 'false');
      }
      if (map[REST_ALERTS_KEY] !== null) setRestAlertsOn(map[REST_ALERTS_KEY] !== 'false');
      if (map[LIVE_WORKOUT_NOTIF_KEY] !== null) setLiveNotifOn(map[LIVE_WORKOUT_NOTIF_KEY] !== 'false');
      if (map[perUserReminderHourKey]) setReminderHour(map[perUserReminderHourKey]!);
      if (map[perUserReminderMinKey]) setReminderMin(map[perUserReminderMinKey]!);
      if (map[perUserHealthSyncKey] !== null) setHealthSyncOn(map[perUserHealthSyncKey] === 'true');
      if (map[perUserGpsKey]) setDistanceIsKm(map[perUserGpsKey] !== 'mi');
    });
  }, []);

  const ensurePermission = async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Permission Required',
        'Allow notifications in your device settings to enable this feature.',
      );
    }
    return granted;
  };

  // The switch rewrites every stored weight, rounded, so a stray tap shouldn't
  // be enough
  const confirmUnitToggle = (value: boolean) => {
    const unit = value ? 'kg' : 'lbs';
    Alert.alert(
      `Switch to ${unit}?`,
      `Every weight you've logged, your PRs and your bodyweight entries are converted to ${unit}. `
        + `Converted values are rounded to the nearest 0.5 ${unit}, so switching back may not give the exact original numbers.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Convert to ${unit}`, onPress: () => handleUnitToggle(value) },
      ],
    );
  };

  const handleUnitToggle = async (value: boolean) => {
    setUnitIsKg(value);
    const newUnit = value ? 'kg' : 'lbs';
    setSavingUnit(true);
    try {
      await updateUser({ weight_unit: newUnit });
      const res = await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_unit: newUnit }),
      });
      // apiFetch only throws on network failure; a rejected PATCH means the
      // server never converted stored weights, so the local unit must roll back.
      if (!res.ok) throw new Error(`Unit change failed (${res.status})`);
    } catch (err) {
      setUnitIsKg(!value);
      updateUser({ weight_unit: value ? 'lbs' : 'kg' });
      if (!isNetworkError(err)) Alert.alert("Couldn't Change Units", 'Try again in a moment.');
    } finally {
      setSavingUnit(false);
    }
  };

  const formatRestTimer = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
  };

  const getReminderDate = () => {
    const d = new Date();
    d.setHours(parseInt(reminderHour, 10) || 9, parseInt(reminderMin, 10) || 0, 0, 0);
    return d;
  };

  const formatReminderTime = () => {
    const h = parseInt(reminderHour, 10) || 9;
    const m = parseInt(reminderMin, 10) || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const applyReminderDate = async (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    setReminderHour(String(h));
    setReminderMin(String(m).padStart(2, '0'));
    await AsyncStorage.multiSet([[perUserReminderHourKey, String(h)], [perUserReminderMinKey, String(m)]]);
    if (remindersOn) await scheduleWorkoutReminder(h, m);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Appearance ── */}
      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.group}>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons
              name={mode === 'dark' ? 'moon' : 'sunny-outline'}
              size={20}
              color={colors.textSecondary}
            />
            <Text style={styles.rowLabel}>Theme</Text>
          </View>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={themePreference}
            onChange={setThemePreference}
            style={styles.themeControl}
          />
        </View>

        <View style={styles.divider} />

        {/* Accent color picker */}
        <TouchableOpacity style={styles.row} onPress={() => setAccentModalVisible(true)} activeOpacity={0.7}>
          <View style={styles.rowLeft}>
            <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Accent Color</Text>
          </View>
          <View style={styles.accentRowRight}>
            <View style={[styles.accentCircle, { backgroundColor: colors.accent }]} />
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {APP_ICONS_ENABLED && (
          <>
            <View style={styles.divider} />

            {/* App Icon */}
            <TouchableOpacity
              style={styles.row}
              onPress={isPremium
                ? undefined
                : () => (navigation as any).navigate('Paywall', { source: 'app_icon' })
              }
              activeOpacity={isPremium ? 1 : 0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="apps-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.rowLabel}>App Icon</Text>
              </View>
              {isPremium
                ? <Text style={[styles.rowLabel, { color: colors.textSecondary, fontSize: 13 }]}>Coming soon</Text>
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.accent} />
                    <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>Premium</Text>
                  </View>
              }
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Account ── */}
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('AccountSettings')}>
          <View style={styles.rowLeft}>
            <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Account</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Preferences ── */}
      <Text style={styles.sectionLabel}>Preferences</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="barbell-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Weight Unit</Text>
          </View>
          <View style={styles.unitToggle}>
            <Text style={[styles.unitLabel, !unitIsKg && styles.unitActive]}>lbs</Text>
            <Switch
              testID="weight-unit-switch"
              value={unitIsKg}
              onValueChange={confirmUnitToggle}
              accessibilityLabel="Weight unit kilograms"
              disabled={savingUnit}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
            <Text style={[styles.unitLabel, unitIsKg && styles.unitActive]}>kg</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="navigate-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Distance Unit</Text>
          </View>
          <View style={styles.unitToggle}>
            <Text style={[styles.unitLabel, !distanceIsKm && styles.unitActive]}>mi</Text>
            <Switch
              value={distanceIsKm}
              accessibilityLabel="Distance unit kilometers"
              onValueChange={async (isKm) => {
                const unit = isKm ? 'km' : 'mi';
                setDistanceIsKm(isKm);
                await AsyncStorage.setItem(perUserGpsKey, unit);
              }}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
            <Text style={[styles.unitLabel, distanceIsKm && styles.unitActive]}>km</Text>
          </View>
        </View>
      </View>

      {/* ── Workout ── */}
      <Text style={styles.sectionLabel}>Workout</Text>
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setRestTimerPickerVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Default rest timer, ${formatRestTimer(parseInt(restTimerSeconds, 10) || 90)}`}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="timer-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Default Rest Timer</Text>
          </View>
          <View style={styles.accentRowRight}>
            <Text style={styles.rowValue}>{formatRestTimer(parseInt(restTimerSeconds, 10) || 90)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {WORKOUT_TOGGLES.map(t => (
          <React.Fragment key={t.key}>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name={t.icon} size={20} color={colors.textSecondary} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{t.label}</Text>
                  <Text style={styles.rowHint}>{t.hint}</Text>
                </View>
              </View>
              <Switch
                value={workoutToggles[t.key]}
                onValueChange={v => setWorkoutToggle(t.key, v)}
                accessibilityLabel={t.label}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Notifications ── */}
      <Text style={styles.sectionLabel}>Notifications</Text>
      <View style={styles.group}>

        {/* Workout Reminders */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Workout Reminders</Text>
          </View>
          <Switch
            value={remindersOn}
            accessibilityLabel="Workout reminders"
            onValueChange={async (v) => {
              if (v) {
                if (!(await ensurePermission())) return;
                setRemindersOn(true);
                await AsyncStorage.setItem(perUserRemindersKey, 'true');
                const h = parseInt(reminderHour, 10) || 9;
                const m = parseInt(reminderMin, 10) || 0;
                scheduleWorkoutReminder(h, m);
              } else {
                setRemindersOn(false);
                await AsyncStorage.setItem(perUserRemindersKey, 'false');
                cancelWorkoutReminder();
              }
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
        {remindersOn && (
          <TouchableOpacity
            style={[styles.row, { paddingTop: 0 }]}
            onPress={() => {
              setPendingReminderDate(getReminderDate());
              setReminderPickerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>Reminder Time</Text>
            </View>
            <View style={styles.accentRowRight}>
              <Text style={styles.rowValue}>{formatReminderTime()}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />

        {/* Rest Timer Alerts */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="alarm-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Rest Timer Alerts</Text>
          </View>
          <Switch
            value={restAlertsOn}
            accessibilityLabel="Rest timer alerts"
            onValueChange={async (v) => {
              if (v && !(await ensurePermission())) return;
              setRestAlertsOn(v);
              await AsyncStorage.setItem(REST_ALERTS_KEY, String(v));
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        {/* Live Workout Notification */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="fitness-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Live Workout Notification</Text>
          </View>
          <Switch
            value={liveNotifOn}
            accessibilityLabel="Live workout notification"
            onValueChange={async (v) => {
              if (v && !(await ensurePermission())) return;
              setLiveNotifOn(v);
              await AsyncStorage.setItem(LIVE_WORKOUT_NOTIF_KEY, String(v));
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

      </View>

      {/* ── Health Sync ── */}
      {HEALTH_SYNC_ENABLED && (
        <>
          <Text style={styles.sectionLabel}>Health</Text>
          <View style={styles.group}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="heart-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.rowLabel}>
                  {Platform.OS === 'ios' ? 'Sync to Apple Health' : 'Sync to Health Connect'}
                </Text>
              </View>
              <Switch
                value={healthSyncOn}
                accessibilityLabel={Platform.OS === 'ios' ? 'Sync to Apple Health' : 'Sync to Health Connect'}
                onValueChange={async (v) => {
                  if (v) {
                    const granted = Platform.OS === 'ios'
                      ? await requestHealthKitPermission()
                      : await requestHealthConnectPermission();
                    if (!granted) {
                      Alert.alert(
                        'Permission Required',
                        `Allow ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} access in your device settings to enable this feature.`,
                      );
                      return;
                    }
                  }
                  setHealthSyncOn(v);
                  await AsyncStorage.setItem(perUserHealthSyncKey, String(v));
                }}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </>
      )}

      {/* ── App Info ── */}
      <Text style={styles.sectionLabel}>App</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Version</Text>
          </View>
          <Text style={styles.rowValue}>{APP_VERSION}</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => openExternalLink('https://aretefitnessapp.com/terms')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Terms of Service</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => openExternalLink('https://aretefitnessapp.com/privacy')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Privacy Policy</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.row}
          onPress={() => openExternalLink('mailto:support@aretefitnessapp.com')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Contact Support</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

      </View>
    </ScrollView>

      {/* Accent color picker modal */}
      <Modal
        visible={accentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAccentModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAccentModalVisible(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Accent Color</Text>
            <View style={styles.accentGrid}>
              {ACCENT_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset.name}
                  style={styles.accentGridItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset.name} accent`}
                  accessibilityState={{ selected: accentPreset.name === preset.name }}
                  onPress={() => {
                    setAccentPreset(preset);
                    if (user?.id) AsyncStorage.setItem(`${KEY_ACCENT}_${user.id}`, preset.name);
                    setAccentModalVisible(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[
                    styles.accentGridCircle,
                    { backgroundColor: mode === 'light' ? preset.light : preset.value },
                    accentPreset.name === preset.name && styles.accentCircleSelected,
                  ]}>
                    {accentPreset.name === preset.name && (
                      <Ionicons name="checkmark" size={18} color={mode === 'light' ? preset.lightText : preset.text} />
                    )}
                  </View>

                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reminder time picker — iOS bottom sheet */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={reminderPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setReminderPickerVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReminderPickerVisible(false)}>
            <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Reminder Time</Text>
              <DateTimePicker
                value={pendingReminderDate}
                mode="time"
                display="spinner"
                onChange={(_: DateTimePickerEvent, date?: Date) => { if (date) setPendingReminderDate(date); }}
                textColor={colors.textPrimary}
                style={{ backgroundColor: colors.surface }}
              />
              <TouchableOpacity
                style={[styles.saveBtn, { marginHorizontal: spacing.md, marginTop: spacing.sm }]}
                onPress={async () => {
                  await applyReminderDate(pendingReminderDate);
                  setReminderPickerVisible(false);
                }}
              >
                <Text style={styles.saveBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Reminder time picker — Android system dialog */}
      {Platform.OS === 'android' && reminderPickerVisible && (
        <DateTimePicker
          value={getReminderDate()}
          mode="time"
          display="default"
          onChange={async (_: DateTimePickerEvent, date?: Date) => {
            setReminderPickerVisible(false);
            if (date) await applyReminderDate(date);
          }}
        />
      )}

      {/* Rest timer preset picker */}
      <Modal
        visible={restTimerPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRestTimerPickerVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRestTimerPickerVisible(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Default Rest Timer</Text>
            <View style={styles.restTimerGrid}>
              {REST_TIMER_PRESETS.map(secs => {
                const selected = (parseInt(restTimerSeconds, 10) || 90) === secs;
                return (
                  <TouchableOpacity
                    key={secs}
                    style={[styles.restTimerOption, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    onPress={async () => {
                      setRestTimerSeconds(String(secs));
                      await AsyncStorage.setItem(perUserRestTimerKey, String(secs));
                      setRestTimerPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.restTimerOptionText, selected && { color: colors.accentText }]}>
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
    headerTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: '700',
      color: colors.textPrimary,
    },
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
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    rowLabel: {
      fontSize: typography.fontSize.md,
      color: colors.textPrimary,
    },
    rowText: { flex: 1 },
    rowHint: {
      fontSize: typography.fontSize.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    themeControl: { width: 190 },
    restHint: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
    },
    rowValue: {
      fontSize: typography.fontSize.md,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    accentRowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    accentCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    accentCircleSelected: {
      borderWidth: 2.5,
      borderColor: colors.textPrimary,
    },
    accentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    accentGridItem: {
      alignItems: 'center',
      width: '22%',
    },
    accentGridCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    restTimerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    restTimerOption: {
      width: '30%',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.sm,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    restTimerOptionText: {
      fontSize: typography.fontSize.md,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    unitToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    unitLabel: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      fontWeight: '500',
      minWidth: 24,
      textAlign: 'center',
    },
    unitActive: {
      color: colors.accent,
      fontWeight: '700',
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    saveBtnText: {
      color: colors.accentText,
      fontSize: typography.fontSize.sm,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
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
  });
