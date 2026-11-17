import React, { useEffect, useMemo, useState } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ThemedSwitch from '../../components/ThemedSwitch';
import SettingsHeader from '../../components/settings/SettingsHeader';
import { createSettingsStyles } from '../../components/settings/settingsStyles';
import {
  LIVE_WORKOUT_NOTIF_KEY, REST_ALERTS_KEY, REMINDERS_KEY, REMINDER_HOUR_KEY, REMINDER_MIN_KEY,
} from '../../constants/storageKeys';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import {
  requestNotificationPermission,
  hasNotificationPermission,
  scheduleWorkoutReminder,
  cancelWorkoutReminder,
} from '../../utils/notifications';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'NotificationSettings'>;

export function formatReminderTime(hour: string | null, minute: string | null) {
  const h = parseInt(hour ?? '', 10) || 9;
  const m = parseInt(minute ?? '', 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function NotificationSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const base = useMemo(() => createSettingsStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uid = user?.id;
  const perUserRemindersKey    = `${REMINDERS_KEY}_${uid}`;
  const perUserReminderHourKey = `${REMINDER_HOUR_KEY}_${uid}`;
  const perUserReminderMinKey  = `${REMINDER_MIN_KEY}_${uid}`;

  const [remindersOn, setRemindersOn]   = useState(false);
  const [restAlertsOn, setRestAlertsOn] = useState(true);
  const [liveNotifOn, setLiveNotifOn]   = useState(true);
  const [reminderHour, setReminderHour] = useState('9');
  const [reminderMin, setReminderMin]   = useState('00');
  const [reminderPickerVisible, setReminderPickerVisible] = useState(false);
  const [pendingReminderDate, setPendingReminderDate] = useState(() => {
    const d = new Date(); d.setHours(9, 0, 0, 0); return d;
  });

  useEffect(() => {
    AsyncStorage.multiGet([
      perUserRemindersKey, REST_ALERTS_KEY, LIVE_WORKOUT_NOTIF_KEY, perUserReminderHourKey, perUserReminderMinKey,
    ]).then(async pairs => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
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

  const getReminderDate = () => {
    const d = new Date();
    d.setHours(parseInt(reminderHour, 10) || 9, parseInt(reminderMin, 10) || 0, 0, 0);
    return d;
  };

  const applyReminderDate = async (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    setReminderHour(String(h));
    setReminderMin(String(m).padStart(2, '0'));
    await AsyncStorage.multiSet([[perUserReminderHourKey, String(h)], [perUserReminderMinKey, String(m)]]);
    if (remindersOn) await scheduleWorkoutReminder(h, m);
  };

  return (
    <>
      <ScrollView style={base.container} contentContainerStyle={base.content}>
        <SettingsHeader title="Notifications" onBack={() => navigation.goBack()} />

        <Text style={base.sectionLabel}>Reminders</Text>
        <View style={base.group}>
          <View style={base.row}>
            <View style={base.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
              <Text style={base.rowLabel}>Workout Reminders</Text>
            </View>
            <ThemedSwitch
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
            />
          </View>
          {remindersOn && (
            <TouchableOpacity
              style={[base.row, styles.subRow]}
              onPress={() => {
                setPendingReminderDate(getReminderDate());
                setReminderPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={base.rowLeft}>
                <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                <Text style={base.rowLabel}>Reminder Time</Text>
              </View>
              <View style={base.rowRight}>
                <Text style={base.rowValue}>{formatReminderTime(reminderHour, reminderMin)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        <Text style={base.sectionLabel}>During a Workout</Text>
        <View style={base.group}>
          <View style={base.row}>
            <View style={base.rowLeft}>
              <Ionicons name="alarm-outline" size={20} color={colors.textSecondary} />
              <Text style={base.rowLabel}>Rest Timer Alerts</Text>
            </View>
            <ThemedSwitch
              value={restAlertsOn}
              accessibilityLabel="Rest timer alerts"
              onValueChange={async (v) => {
                if (v && !(await ensurePermission())) return;
                setRestAlertsOn(v);
                await AsyncStorage.setItem(REST_ALERTS_KEY, String(v));
              }}
            />
          </View>

          <View style={base.divider} />

          <View style={base.row}>
            <View style={base.rowLeft}>
              <Ionicons name="fitness-outline" size={20} color={colors.textSecondary} />
              <Text style={base.rowLabel}>{Platform.OS === 'ios' ? 'Live Workout on Lock Screen' : 'Live Workout Notification'}</Text>
            </View>
            <ThemedSwitch
              value={liveNotifOn}
              accessibilityLabel={Platform.OS === 'ios' ? 'Live workout on lock screen' : 'Live workout notification'}
              onValueChange={async (v) => {
                if (v && !(await ensurePermission())) return;
                setLiveNotifOn(v);
                await AsyncStorage.setItem(LIVE_WORKOUT_NOTIF_KEY, String(v));
              }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Reminder time picker — iOS bottom sheet */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={reminderPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setReminderPickerVisible(false)}
        >
          <TouchableOpacity style={base.modalOverlay} activeOpacity={1} onPress={() => setReminderPickerVisible(false)}>
            <View style={base.modalSheet} onStartShouldSetResponder={() => true}>
              <Text style={base.modalTitle}>Reminder Time</Text>
              <DateTimePicker
                value={pendingReminderDate}
                mode="time"
                display="spinner"
                onChange={(_: DateTimePickerEvent, date?: Date) => { if (date) setPendingReminderDate(date); }}
                textColor={colors.textPrimary}
                style={{ backgroundColor: colors.surface }}
              />
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={async () => {
                  await applyReminderDate(pendingReminderDate);
                  setReminderPickerVisible(false);
                }}
              >
                <Text style={styles.doneBtnText}>Done</Text>
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
    </>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    subRow: { paddingTop: 0 },
    doneBtn: {
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    doneBtnText: {
      color: colors.accentText,
      fontSize: typography.fontSize.sm,
      fontWeight: '600',
    },
  });
