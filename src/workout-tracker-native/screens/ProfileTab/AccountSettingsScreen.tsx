import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'AccountSettings'>;

export default function AccountSettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/workouts/export');
      if (!res.ok) { Alert.alert('Error', 'Export failed. Please try again.'); return; }
      const csvText = await res.text();
      const FileSystem = await import('expo-file-system/legacy');
      const { shareAsync } = await import('expo-sharing');
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (dir) {
        const fileUri = dir + 'aretefitnessapp_workouts.csv';
        await FileSystem.writeAsStringAsync(fileUri, csvText, { encoding: FileSystem.EncodingType.UTF8 });
        await shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Workout Data' });
      } else {
        const { Share } = await import('react-native');
        await Share.share({ title: 'Workout Export', message: csvText });
      }
    } catch {
      Alert.alert('Error', 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all workout data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              `Type your email to confirm: this will delete all data for ${user?.email ?? 'your account'}.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const res = await apiFetch('/api/me', { method: 'DELETE' });
                      if (res.ok) {
                        logout();
                      } else {
                        Alert.alert('Error', 'Failed to delete account. Please try again.');
                      }
                    } catch {
                      Alert.alert('Error', 'Something went wrong. Please try again.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 24 }} />
      </View>

      {user?.email && (
        <Text style={styles.emailLabel}>{user.email}</Text>
      )}

      <Text style={styles.sectionLabel}>Profile</Text>
      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('EditProfile')}>
          <View style={styles.rowLeft}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Edit Profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChangePassword')}>
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Change Password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Data</Text>
      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={handleExport} disabled={exporting}>
          <View style={styles.rowLeft}>
            <Ionicons name="download-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Export Data</Text>
          </View>
          {exporting
            ? <ActivityIndicator size="small" color={colors.textSecondary} />
            : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Session</Text>
      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={handleLogout}>
          <View style={styles.rowLeft}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Log Out</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.group}>
        <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
          <View style={styles.rowLeft}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowLabel, { color: colors.danger }]}>Delete Account</Text>
          </View>
        </TouchableOpacity>
      </View>
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
  emailLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
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
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
});
