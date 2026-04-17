import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'BodyweightLog'>;

type LogEntry = { id: number; weight: number; date: string };

export default function BodyweightScreen({ navigation }: Props) {
  const { token, user, updateUser } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);

  const weightUnit = user?.weight_unit || 'lbs';

  const fetchLogs = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/bodyweight`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setLogs(await res.json());
    } catch (err) {
      console.error('Failed to fetch bodyweight logs', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchLogs(); }, [token]));

  const handleSave = async () => {
    const weight = parseFloat(weightInput);
    if (!weightInput || isNaN(weight) || weight <= 0) {
      Alert.alert('Invalid weight', 'Please enter a valid weight.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/bodyweight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ weight }),
      });
      if (res.ok) {
        const entry = await res.json();
        setLogs(prev => [entry, ...prev]);
        updateUser({ bodyweight: weight });
        setWeightInput('');
        setModalVisible(false);
      } else {
        Alert.alert('Error', 'Failed to save entry.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete entry', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/bodyweight/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const remaining = logs.filter(l => l.id !== id);
              setLogs(remaining);
              updateUser({ bodyweight: remaining[0]?.weight ?? null });
            }
          } catch {
            Alert.alert('Error', 'Failed to delete entry.');
          }
        },
      },
    ]);
  };

  // Chart data — show up to 20 most recent, oldest→newest left→right
  const chartData = [...logs]
    .slice(0, 20)
    .reverse()
    .map(log => ({
      value: log.weight,
      label: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

  const currentWeight = logs[0]?.weight;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bodyweight</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.save} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item.id.toString()}
          ListHeaderComponent={
            <View>
              {/* Current weight */}
              <View style={styles.currentCard}>
                <Text style={styles.currentLabel}>Current</Text>
                <Text style={styles.currentValue}>
                  {currentWeight ? `${currentWeight} ${weightUnit}` : '—'}
                </Text>
              </View>

              {/* Chart */}
              {chartData.length >= 2 && (
                <View style={styles.chartCard}>
                  <Text style={styles.sectionTitle}>Progress</Text>
                  <LineChart
                    data={chartData}
                    height={160}
                    spacing={44}
                    color={colors.save}
                    thickness={2}
                    hideDataPoints={false}
                    dataPointsColor={colors.save}
                    startFillColor={colors.save}
                    endFillColor="#fff"
                    startOpacity={0.2}
                    endOpacity={0}
                    areaChart
                    curved
                    hideRules
                    hideYAxisText
                    xAxisLabelTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                    initialSpacing={10}
                    endSpacing={10}
                    noOfSections={4}
                  />
                </View>
              )}

              <Text style={styles.sectionTitle}>History</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No entries yet — tap + to log your weight.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <View>
                <Text style={styles.logWeight}>{item.weight} {weightUnit}</Text>
                <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Log weight modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Log Weight</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={`Weight (${weightUnit})`}
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => { setModalVisible(false); setWeightInput(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  addBtn: {
    backgroundColor: colors.save,
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  currentCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  currentLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  currentValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  logWeight: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  logDate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    fontSize: typography.fontSize.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: spacing.md,
    padding: spacing.lg,
    width: '80%',
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalButtons: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: spacing.sm,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: colors.surface },
  cancelBtnText: { color: colors.textPrimary, fontWeight: '600' },
  saveBtn: { backgroundColor: colors.save },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
