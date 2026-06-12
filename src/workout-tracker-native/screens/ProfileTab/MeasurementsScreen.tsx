import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch } from '../../utils/api';
import { roundTenth } from '../../utils/units';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Measurements'>;

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type BWLog      = { id: number; weight: number; date: string };
type Measurement = { id: number; date: string; waist: number|null; chest: number|null; right_arm: number|null; left_arm: number|null; right_leg: number|null; left_leg: number|null };
type Photo       = { id: number; date: string; photo_url: string; notes: string|null };

type Tab = 'bodyweight' | 'measurements' | 'photos';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function MeasurementsScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const weightUnit = user?.weight_unit || 'lbs';

  const [activeTab, setActiveTab] = useState<Tab>('bodyweight');

  // ── Body weight state ──────────────────────────────────────
  const [bwLogs, setBwLogs]           = useState<BWLog[]>([]);
  const [bwLoading, setBwLoading]     = useState(true);
  const [bwModal, setBwModal]         = useState(false);
  const [bwInput, setBwInput]         = useState('');
  const [bwSaving, setBwSaving]       = useState(false);

  // ── Measurements state ─────────────────────────────────────
  const [mLogs, setMLogs]             = useState<Measurement[]>([]);
  const [mLoading, setMLoading]       = useState(true);
  const [mModal, setMModal]           = useState(false);
  const [mWaist, setMWaist]           = useState('');
  const [mChest, setMChest]           = useState('');
  const [mRArm, setMRArm]             = useState('');
  const [mLArm, setMLArm]             = useState('');
  const [mRLeg, setMRLeg]             = useState('');
  const [mLLeg, setMLLeg]             = useState('');
  const [mSaving, setMSaving]         = useState(false);

  // ── Photos state ───────────────────────────────────────────
  const [photos, setPhotos]           = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading]     = useState(false);

  // Fetch all data on focus
  const fetchAll = async () => {
    setBwLoading(true);
    setMLoading(true);
    setPhotosLoading(true);
    try {
      const [bwRes, mRes, pRes] = await Promise.all([
        apiFetch('/api/bodyweight'),
        apiFetch('/api/measurements'),
        apiFetch('/api/progress-photos'),
      ]);
      if (bwRes.ok) setBwLogs(await bwRes.json());
      if (mRes.ok) setMLogs(await mRes.json());
      if (pRes.ok) setPhotos(await pRes.json());
    } catch {
    } finally {
      setBwLoading(false);
      setMLoading(false);
      setPhotosLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAll(); }, []));

  // ── Body weight handlers ───────────────────────────────────
  const handleBwSave = async () => {
    const weight = parseFloat(bwInput);
    if (!bwInput || isNaN(weight) || weight <= 0) {
      Alert.alert('Invalid weight', 'Please enter a valid weight.');
      return;
    }
    setBwSaving(true);
    try {
      const res = await apiFetch('/api/bodyweight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight, date: localDateStr(new Date()) }),
      });
      if (res.ok) {
        const entry = await res.json();
        setBwLogs(prev => [entry, ...prev]);
        updateUser({ bodyweight: weight });
        setBwInput('');
        setBwModal(false);
      } else {
        Alert.alert('Error', 'Failed to save entry.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setBwSaving(false);
    }
  };

  const handleBwDelete = (id: number) => {
    Alert.alert('Delete entry', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/bodyweight/${id}`, { method: 'DELETE' });
            if (res.ok) {
              const remaining = bwLogs.filter(l => l.id !== id);
              setBwLogs(remaining);
              updateUser({ bodyweight: remaining[0]?.weight ?? null });
            }
          } catch {
            Alert.alert('Error', 'Failed to delete entry.');
          }
        },
      },
    ]);
  };

  // ── Measurements handlers ──────────────────────────────────
  const handleMSave = async () => {
    const waist     = mWaist ? parseFloat(mWaist) : null;
    const chest     = mChest ? parseFloat(mChest) : null;
    const right_arm = mRArm  ? parseFloat(mRArm)  : null;
    const left_arm  = mLArm  ? parseFloat(mLArm)  : null;
    const right_leg = mRLeg  ? parseFloat(mRLeg)  : null;
    const left_leg  = mLLeg  ? parseFloat(mLLeg)  : null;

    if ([waist, chest, right_arm, left_arm, right_leg, left_leg].every(v => v === null)) {
      Alert.alert('Empty', 'Enter at least one measurement.');
      return;
    }
    setMSaving(true);
    try {
      const res = await apiFetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waist, chest, right_arm, left_arm, right_leg, left_leg, date: localDateStr(new Date()) }),
      });
      if (res.ok) {
        const entry = await res.json();
        setMLogs(prev => [entry, ...prev]);
        setMWaist(''); setMChest(''); setMRArm(''); setMLArm(''); setMRLeg(''); setMLLeg('');
        setMModal(false);
      } else {
        Alert.alert('Error', 'Failed to save measurement.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setMSaving(false);
    }
  };

  const handleMDelete = (id: number) => {
    Alert.alert('Delete entry', 'Remove this measurement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/measurements/${id}`, { method: 'DELETE' });
            if (res.ok) setMLogs(prev => prev.filter(m => m.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete measurement.');
          }
        },
      },
    ]);
  };

  // ── Photo handlers ─────────────────────────────────────────
  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      const filename = asset.uri.split('/').pop() ?? 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri: asset.uri, name: filename, type } as any);

      const res = await apiFetch('/api/progress-photos', { method: 'POST', body: formData });
      if (res.ok) {
        const photo = await res.json();
        setPhotos(prev => [photo, ...prev]);
      } else {
        Alert.alert('Error', 'Failed to upload photo.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = (photo: Photo) => {
    Alert.alert('Delete photo', 'Remove this progress photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/progress-photos/${photo.id}`, { method: 'DELETE' });
            if (res.ok) {
              setPhotos(prev => prev.filter(p => p.id !== photo.id));
              setSelectedPhoto(null);
            }
          } catch {
            Alert.alert('Error', 'Failed to delete photo.');
          }
        },
      },
    ]);
  };

  // ── Chart data ─────────────────────────────────────────────
  const bwChartData = [...bwLogs]
    .slice(0, 20)
    .reverse()
    .map(log => ({
      value: log.weight,
      label: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

  const currentBw = bwLogs[0]?.weight;
  const latestM   = mLogs[0];

  // ── Tab content renders ────────────────────────────────────
  const renderBodyweightTab = () => {
    if (bwLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />;
    return (
      <FlatList
        data={bwLogs}
        keyExtractor={item => item.id.toString()}
        ListHeaderComponent={
          <View>
            <View style={styles.currentCard}>
              <Text style={styles.currentLabel}>Current</Text>
              <Text style={styles.currentValue}>
                {currentBw ? `${currentBw} ${weightUnit}` : '—'}
              </Text>
            </View>
            {bwChartData.length >= 2 && (
              <View style={styles.chartCard}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <LineChart
                  data={bwChartData}
                  height={160}
                  spacing={44}
                  color={colors.accent}
                  thickness={2}
                  hideDataPoints={false}
                  dataPointsColor={colors.accent}
                  startFillColor={colors.accent}
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
              <Text style={styles.logPrimary}>{roundTenth(item.weight)} {weightUnit}</Text>
              <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity onPress={() => handleBwDelete(item.id)}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  const renderMeasurementsTab = () => {
    if (mLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />;
    return (
      <FlatList
        data={mLogs}
        keyExtractor={item => item.id.toString()}
        ListHeaderComponent={
          <View>
            {/* Latest values */}
            <View style={styles.statsGrid}>
              {([
                ['waist', 'Waist'],
                ['chest', 'Chest'],
                ['right_arm', 'R Arm'],
                ['left_arm', 'L Arm'],
                ['right_leg', 'R Leg'],
                ['left_leg', 'L Leg'],
              ] as [keyof Measurement, string][]).map(([key, label]) => (
                <View key={key} style={styles.statBox}>
                  <Text style={styles.statBoxLabel}>{label}</Text>
                  <Text style={styles.statBoxValue}>
                    {latestM?.[key] != null ? `${roundTenth(latestM[key] as number)}` : '—'}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionTitle}>History</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No measurements yet — tap + to log.</Text>
        }
        renderItem={({ item }) => {
          const LABELS: Record<keyof Measurement, string> = {
            id: '', date: '',
            waist: 'Waist', chest: 'Chest',
            right_arm: 'R Arm', left_arm: 'L Arm',
            right_leg: 'R Leg', left_leg: 'L Leg',
          };
          const parts = (['waist', 'chest', 'right_arm', 'left_arm', 'right_leg', 'left_leg'] as const)
            .filter(k => item[k] != null)
            .map(k => `${LABELS[k]}: ${roundTenth(item[k] as number)}`);
          return (
            <View style={styles.logRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString()}</Text>
                <Text style={styles.logPrimary} numberOfLines={2}>{parts.join('  ·  ')}</Text>
              </View>
              <TouchableOpacity onPress={() => handleMDelete(item.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  const cellSize = (SCREEN_WIDTH - spacing.md * 3) / 2;

  const renderPhotosTab = () => {
    if (photosLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.xl }} />;
    return (
      <View style={{ flex: 1 }}>
        {photos.length === 0 ? (
          <Text style={[styles.emptyText, { margin: spacing.xl }]}>
            No progress photos yet — tap + to upload.
          </Text>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={item => item.id.toString()}
            numColumns={2}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
            columnWrapperStyle={{ gap: spacing.md }}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelectedPhoto(item)}>
                <Image
                  source={{ uri: item.photo_url }}
                  style={{ width: cellSize, height: cellSize, borderRadius: spacing.sm }}
                />
                <Text style={styles.photoDate}>
                  {new Date(item.date).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Floating add button */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent }]}
          onPress={handleAddPhoto}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="add" size={28} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    );
  };

  // Determine which add button to show and what it does
  const handleAdd = () => {
    if (activeTab === 'bodyweight') setBwModal(true);
    else if (activeTab === 'measurements') setMModal(true);
    else handleAddPhoto();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Measurements</Text>
        {activeTab !== 'photos' ? (
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.accent }]} onPress={handleAdd}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['bodyweight', 'measurements', 'photos'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && { color: colors.accent }]}>
              {tab === 'bodyweight' ? 'Body Weight' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'bodyweight' && renderBodyweightTab()}
      {activeTab === 'measurements' && renderMeasurementsTab()}
      {activeTab === 'photos' && renderPhotosTab()}

      {/* Log Weight Modal */}
      <Modal visible={bwModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Log Weight</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={`Weight (${weightUnit})`}
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={bwInput}
              onChangeText={setBwInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => { setBwModal(false); setBwInput(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                onPress={handleBwSave}
                disabled={bwSaving}
              >
                <Text style={styles.saveBtnText}>{bwSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Log Measurements Modal */}
      <Modal visible={mModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Log Measurements</Text>
            {([
              ['Waist', mWaist, setMWaist],
              ['Chest', mChest, setMChest],
              ['Right Arm', mRArm, setMRArm],
              ['Left Arm', mLArm, setMLArm],
              ['Right Leg', mRLeg, setMRLeg],
              ['Left Leg', mLLeg, setMLLeg],
            ] as [string, string, (v: string) => void][]).map(([label, value, setter]) => (
              <TextInput
                key={label}
                style={[styles.modalInput, { marginBottom: spacing.sm }]}
                placeholder={`${label} (optional)`}
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                value={value}
                onChangeText={setter}
              />
            ))}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => { setMModal(false); setMWaist(''); setMChest(''); setMRArm(''); setMLArm(''); setMRLeg(''); setMLLeg(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                onPress={handleMSave}
                disabled={mSaving}
              >
                <Text style={styles.saveBtnText}>{mSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen photo modal */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade">
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={styles.photoModalClose} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <>
              <Image
                source={{ uri: selectedPhoto.photo_url }}
                style={styles.photoFull}
                resizeMode="contain"
              />
              {selectedPhoto.notes ? (
                <Text style={styles.photoNotes}>{selectedPhoto.notes}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.photoDeleteBtn, { backgroundColor: colors.danger }]}
                onPress={() => handleDeletePhoto(selectedPhoto)}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.photoDeleteText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
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
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  tabLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
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

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  statBoxLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statBoxValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
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
  logPrimary: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  logDate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: 2 },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  photoDate: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: spacing.md,
    padding: spacing.lg,
    width: '85%',
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
  cancelBtn: { backgroundColor: colors.background },
  cancelBtnText: { color: colors.textPrimary, fontWeight: '600' },
  saveBtnText: { color: '#fff', fontWeight: '600' },

  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.md,
    zIndex: 10,
    padding: spacing.sm,
  },
  photoFull: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
  },
  photoNotes: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  photoDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
  },
  photoDeleteText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: typography.fontSize.md,
  },
});
