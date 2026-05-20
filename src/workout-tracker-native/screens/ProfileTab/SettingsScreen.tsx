import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ACCENT_PRESETS, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import {
  requestNotificationPermission,
  scheduleWorkoutReminder,
  cancelWorkoutReminder,
} from '../../utils/notifications';
import { HEALTH_SYNC_KEY, requestHealthKitPermission } from '../../utils/healthKit';
import { requestHealthConnectPermission } from '../../utils/healthConnect';

const APP_VERSION = '1.0.0';
const REST_TIMER_KEY = 'default_rest_timer';
const REMINDERS_KEY = 'workout_reminders_enabled';
const REST_ALERTS_KEY = 'rest_timer_alerts_enabled';
const LIVE_NOTIF_KEY = 'live_workout_notif_enabled';
const REMINDER_HOUR_KEY = 'workout_reminder_hour';
const REMINDER_MIN_KEY = 'workout_reminder_minute';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user, logout, updateUser } = useAuth();
  const { colors, mode, accentPreset, toggleMode, setAccentPreset } = useTheme();

  const [unitIsKg, setUnitIsKg]             = useState(user?.weight_unit === 'kg');
  const [restTimerSeconds, setRestTimerSeconds] = useState('90');
  const [savingUnit, setSavingUnit]         = useState(false);

  // Notification settings
  const [remindersOn, setRemindersOn]   = useState(false);
  const [restAlertsOn, setRestAlertsOn] = useState(true);
  const [liveNotifOn, setLiveNotifOn]   = useState(true);
  const [reminderHour, setReminderHour] = useState('9');
  const [reminderMin, setReminderMin]   = useState('00');

  // Health sync
  const [healthSyncOn, setHealthSyncOn] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([
      REST_TIMER_KEY, REMINDERS_KEY, REST_ALERTS_KEY, LIVE_NOTIF_KEY,
      REMINDER_HOUR_KEY, REMINDER_MIN_KEY, HEALTH_SYNC_KEY,
    ]).then(pairs => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
      if (map[REST_TIMER_KEY]) setRestTimerSeconds(map[REST_TIMER_KEY]!);
      if (map[REMINDERS_KEY] !== null) setRemindersOn(map[REMINDERS_KEY] === 'true');
      if (map[REST_ALERTS_KEY] !== null) setRestAlertsOn(map[REST_ALERTS_KEY] !== 'false');
      if (map[LIVE_NOTIF_KEY] !== null) setLiveNotifOn(map[LIVE_NOTIF_KEY] !== 'false');
      if (map[REMINDER_HOUR_KEY]) setReminderHour(map[REMINDER_HOUR_KEY]!);
      if (map[REMINDER_MIN_KEY]) setReminderMin(map[REMINDER_MIN_KEY]!);
      if (map[HEALTH_SYNC_KEY] !== null) setHealthSyncOn(map[HEALTH_SYNC_KEY] === 'true');
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

  const handleUnitToggle = async (value: boolean) => {
    setUnitIsKg(value);
    const newUnit = value ? 'kg' : 'lbs';
    setSavingUnit(true);
    try {
      await updateUser({ weight_unit: newUnit });
      await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_unit: newUnit }),
      });
    } catch {
      setUnitIsKg(!value);
      updateUser({ weight_unit: value ? 'lbs' : 'kg' });
      Alert.alert('Error', 'Failed to save unit preference.');
    } finally {
      setSavingUnit(false);
    }
  };

  const handleRestTimerSave = async () => {
    const secs = parseInt(restTimerSeconds, 10);
    if (isNaN(secs) || secs < 10 || secs > 600) {
      Alert.alert('Invalid value', 'Enter a value between 10 and 600 seconds.');
      return;
    }
    await AsyncStorage.setItem(REST_TIMER_KEY, String(secs));
    Alert.alert('Saved', `Default rest timer set to ${secs}s.`);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Appearance ── */}
      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.group}>

        {/* Dark mode toggle */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons
              name={mode === 'dark' ? 'moon' : 'sunny-outline'}
              size={20}
              color={colors.textSecondary}
            />
            <Text style={styles.rowLabel}>Dark Mode</Text>
          </View>
          <Switch
            value={mode === 'dark'}
            onValueChange={toggleMode}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        {/* Accent color picker */}
        <View style={styles.accentRow}>
          <View style={styles.rowLeft}>
            <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Accent Color</Text>
          </View>
          <View style={styles.accentPresets}>
            {ACCENT_PRESETS.map(preset => (
              <TouchableOpacity
                key={preset.name}
                style={[
                  styles.accentCircle,
                  { backgroundColor: preset.value },
                  accentPreset.name === preset.name && styles.accentCircleSelected,
                ]}
                onPress={() => setAccentPreset(preset)}
                activeOpacity={0.8}
              >
                {accentPreset.name === preset.name && (
                  <Ionicons name="checkmark" size={14} color={preset.text} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Account ── */}
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Change Password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={handleLogout}>
          <View style={styles.rowLeft}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Log Out</Text>
          </View>
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
              value={unitIsKg}
              onValueChange={handleUnitToggle}
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
            <Ionicons name="timer-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Default Rest Timer</Text>
          </View>
          <View style={styles.timerInput}>
            <TextInput
              style={styles.timerField}
              value={restTimerSeconds}
              onChangeText={setRestTimerSeconds}
              keyboardType="number-pad"
              maxLength={3}
              returnKeyType="done"
              onSubmitEditing={handleRestTimerSave}
            />
            <Text style={styles.timerUnit}>sec</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={handleRestTimerSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
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
            onValueChange={async (v) => {
              if (v) {
                if (!(await ensurePermission())) return;
                setRemindersOn(true);
                await AsyncStorage.setItem(REMINDERS_KEY, 'true');
                const h = parseInt(reminderHour, 10) || 9;
                const m = parseInt(reminderMin, 10) || 0;
                scheduleWorkoutReminder(h, m);
              } else {
                setRemindersOn(false);
                await AsyncStorage.setItem(REMINDERS_KEY, 'false');
                cancelWorkoutReminder();
              }
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
        {remindersOn && (
          <View style={[styles.row, { paddingTop: 0, minHeight: 0 }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>Reminder Time</Text>
            </View>
            <View style={styles.timerInput}>
              <TextInput
                style={styles.timerField}
                value={reminderHour}
                onChangeText={setReminderHour}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="9"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.timerUnit}>h</Text>
              <TextInput
                style={styles.timerField}
                value={reminderMin}
                onChangeText={setReminderMin}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.timerUnit}>m</Text>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={async () => {
                  const h = Math.min(23, Math.max(0, parseInt(reminderHour, 10) || 9));
                  const m = Math.min(59, Math.max(0, parseInt(reminderMin, 10) || 0));
                  setReminderHour(String(h));
                  setReminderMin(String(m).padStart(2, '0'));
                  await AsyncStorage.multiSet([[REMINDER_HOUR_KEY, String(h)], [REMINDER_MIN_KEY, String(m)]]);
                  await scheduleWorkoutReminder(h, m);
                  Alert.alert('Saved', `Daily reminder set for ${h}:${String(m).padStart(2, '0')}`);
                }}
              >
                <Text style={styles.saveBtnText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* Rest Timer Alerts */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="timer-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Rest Timer Alerts</Text>
          </View>
          <Switch
            value={restAlertsOn}
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
            onValueChange={async (v) => {
              if (v && !(await ensurePermission())) return;
              setLiveNotifOn(v);
              await AsyncStorage.setItem(LIVE_NOTIF_KEY, String(v));
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

      </View>

      {/* ── Health Sync ── */}
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
              await AsyncStorage.setItem(HEALTH_SYNC_KEY, String(v));
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

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
          onPress={() => Linking.openURL('https://aretefitnessapp.com/terms')}
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
          onPress={() => Linking.openURL('https://aretefitnessapp.com/privacy')}
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
          onPress={() => Linking.openURL('mailto:support@aretefitnessapp.com')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Contact Support</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    accentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      minHeight: 60,
      flexWrap: 'wrap',
      gap: spacing.sm,
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
    rowValue: {
      fontSize: typography.fontSize.md,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    accentPresets: {
      flexDirection: 'row',
      gap: 10,
    },
    accentCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accentCircleSelected: {
      borderWidth: 2,
      borderColor: colors.textPrimary,
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
    timerInput: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    timerField: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      fontSize: typography.fontSize.md,
      color: colors.textPrimary,
      width: 52,
      textAlign: 'center',
    },
    timerUnit: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    saveBtnText: {
      color: colors.accentText,
      fontSize: typography.fontSize.sm,
      fontWeight: '600',
    },
  });
