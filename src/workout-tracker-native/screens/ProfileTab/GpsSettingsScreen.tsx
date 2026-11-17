import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ThemedSwitch from '../../components/ThemedSwitch';
import SettingsHeader from '../../components/settings/SettingsHeader';
import { createSettingsStyles } from '../../components/settings/settingsStyles';
import { GPS_AUTO_PAUSE_KEY, GPS_KEEP_SCREEN_ON_KEY } from '../../constants/storageKeys';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ProfileStackParamsList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'GpsSettings'>;

export default function GpsSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  const autoPauseKey  = `${GPS_AUTO_PAUSE_KEY}_${user?.id}`;
  const keepScreenKey = `${GPS_KEEP_SCREEN_ON_KEY}_${user?.id}`;

  const [autoPauseOn, setAutoPauseOn]   = useState(true);
  const [keepScreenOn, setKeepScreenOn] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([autoPauseKey, keepScreenKey]).then(([[, autoPause], [, keepScreen]]) => {
      setAutoPauseOn(autoPause !== 'false');
      setKeepScreenOn(keepScreen === 'true');
    });
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SettingsHeader title="GPS Activities" onBack={() => navigation.goBack()} />

      <Text style={styles.sectionLabel}>Runs, Rides and Walks</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="pause-circle-outline" size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Auto-Pause</Text>
              <Text style={styles.rowHint}>Stops the clock while you're stopped, like at a light</Text>
            </View>
          </View>
          <ThemedSwitch
            value={autoPauseOn}
            accessibilityLabel="Auto-pause"
            onValueChange={async (v) => {
              setAutoPauseOn(v);
              await AsyncStorage.setItem(autoPauseKey, String(v));
            }}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Keep Screen On</Text>
              <Text style={styles.rowHint}>While the map is open, for a phone on a mount</Text>
            </View>
          </View>
          <ThemedSwitch
            value={keepScreenOn}
            accessibilityLabel="Keep screen on during GPS activities"
            onValueChange={async (v) => {
              setKeepScreenOn(v);
              await AsyncStorage.setItem(keepScreenKey, String(v));
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}
