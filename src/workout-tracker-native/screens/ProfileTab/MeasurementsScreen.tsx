import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, isNetworkError } from '../../utils/api';
import { roundTenth } from '../../utils/units';
import { toLocalDateStr } from '../../utils/date';
import {
  MEASUREMENT_FIELDS,
  fmtSignedDelta,
  lengthUnitFor,
  measurementTrend,
  trailingAverages,
  type MeasurementKey,
} from '../../utils/bodyMetrics';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'Measurements'>;

type BWLog      = { id: number; weight: number; date: string };
type Measurement = { id: number; date: string } & Record<MeasurementKey, number | null>;
type Photo       = { id: number; date: string; photo_url: string; notes: string|null };

type Tab = 'bodyweight' | 'measurements' | 'photos';
type MValues = Record<MeasurementKey, string>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_M_VALUES: MValues = { waist: '', chest: '', right_arm: '', left_arm: '', right_leg: '', left_leg: '' };

// Edits and backdated entries can land anywhere in the history, so re-sort
// rather than prepending. Same-day ties keep the newest entry first.
function sortNewestFirst<T extends { id: number; date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id);
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MeasurementsScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const weightUnit = user?.weight_unit || 'lbs';
  const lengthUnit = lengthUnitFor(weightUnit);

  const [activeTab, setActiveTab] = useState<Tab>('bodyweight');

  // ── Body weight state ──────────────────────────────────────
  const [bwLogs, setBwLogs]           = useState<BWLog[]>([]);
  const [bwLoading, setBwLoading]     = useState(true);
  const [bwModal, setBwModal]         = useState(false);
  const [bwEditing, setBwEditing]     = useState<BWLog | null>(null);
  const [bwInput, setBwInput]         = useState('');
  const [bwDate, setBwDate]           = useState(() => new Date());
  const [bwSaving, setBwSaving]       = useState(false);

  // ── Measurements state ─────────────────────────────────────
  const [mLogs, setMLogs]             = useState<Measurement[]>([]);
  const [mLoading, setMLoading]       = useState(true);
  const [mModal, setMModal]           = useState(false);
  const [mEditing, setMEditing]       = useState<Measurement | null>(null);
  const [mValues, setMValues]         = useState<MValues>(EMPTY_M_VALUES);
  const [mDate, setMDate]             = useState(() => new Date());
  const [mSaving, setMSaving]         = useState(false);

  // Android has no inline date picker: mounting it opens the system dialog.
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);

  // ── Photos state ───────────────────────────────────────────
  const [photos, setPhotos]           = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoNotes, setPhotoNotes]   = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds]   = useState<number[]>([]);

  // iOS's decimal pad has no return key, so without an explicit way out the
  // keyboard can't be closed from the log modals.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  const closeBwModal = () => {
    Keyboard.dismiss();
    setAndroidPickerOpen(false);
    setBwModal(false);
    setBwEditing(null);
    setBwInput('');
  };

  const closeMModal = () => {
    Keyboard.dismiss();
    setAndroidPickerOpen(false);
    setMModal(false);
    setMEditing(null);
    setMValues(EMPTY_M_VALUES);
  };

  const openBwModal = (entry?: BWLog) => {
    setBwEditing(entry ?? null);
    setBwInput(entry ? `${roundTenth(entry.weight)}` : '');
    setBwDate(entry ? new Date(entry.date) : new Date());
    setBwModal(true);
  };

  const openMModal = (entry?: Measurement) => {
    setMEditing(entry ?? null);
    setMValues(entry
      ? Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) =>
          [key, entry[key] != null ? `${roundTenth(entry[key] as number)}` : ''])) as MValues
      : EMPTY_M_VALUES);
    setMDate(entry ? new Date(entry.date) : new Date());
    setMModal(true);
  };

  // ── Body weight handlers ───────────────────────────────────
  const handleBwSave = async () => {
    const weight = parseFloat(bwInput);
    if (!bwInput || isNaN(weight) || weight <= 0) {
      Alert.alert('Invalid weight', 'Please enter a valid weight.');
      return;
    }
    setBwSaving(true);
    try {
      const res = await apiFetch(bwEditing ? `/api/bodyweight/${bwEditing.id}` : '/api/bodyweight', {
        method: bwEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight, date: toLocalDateStr(bwDate) }),
      });
      if (res.ok) {
        const entry: BWLog = await res.json();
        const next = sortNewestFirst([entry, ...bwLogs.filter(l => l.id !== entry.id)]);
        setBwLogs(next);
        // A backdated entry isn't the current weight; the newest one is.
        updateUser({ bodyweight: next[0].weight });
        closeBwModal();
      } else {
        Alert.alert("Couldn't Save Bodyweight", 'Try again in a moment.');
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Save Bodyweight", 'Try again in a moment.');
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
            } else {
              Alert.alert("Couldn't Delete Entry", 'Try again in a moment.');
            }
          } catch (err) {
            if (!isNetworkError(err)) Alert.alert("Couldn't Delete Entry", 'Try again in a moment.');
          }
        },
      },
    ]);
  };

  // ── Measurements handlers ──────────────────────────────────
  const handleMSave = async () => {
    const parsed = Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) =>
      [key, mValues[key] ? parseFloat(mValues[key]) : null])) as Record<MeasurementKey, number | null>;

    if (Object.values(parsed).every(v => v === null)) {
      Alert.alert('Empty', 'Enter at least one measurement.');
      return;
    }
    setMSaving(true);
    try {
      const res = await apiFetch(mEditing ? `/api/measurements/${mEditing.id}` : '/api/measurements', {
        method: mEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, date: toLocalDateStr(mDate) }),
      });
      if (res.ok) {
        const entry: Measurement = await res.json();
        setMLogs(prev => sortNewestFirst([entry, ...prev.filter(m => m.id !== entry.id)]));
        closeMModal();
      } else {
        Alert.alert("Couldn't Save Measurement", 'Try again in a moment.');
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Save Measurement", 'Try again in a moment.');
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
            else Alert.alert("Couldn't Delete Measurement", 'Try again in a moment.');
          } catch (err) {
            if (!isNetworkError(err)) Alert.alert("Couldn't Delete Measurement", 'Try again in a moment.');
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
    setPhotoNotes('');
    setPendingPhoto(result.assets[0]);
  };

  const closeUploadModal = () => {
    Keyboard.dismiss();
    setPendingPhoto(null);
    setPhotoNotes('');
  };

  const handleUploadPhoto = async () => {
    if (!pendingPhoto) return;
    setUploading(true);
    try {
      const formData = new FormData();
      const filename = pendingPhoto.uri.split('/').pop() ?? 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri: pendingPhoto.uri, name: filename, type } as any);
      if (photoNotes.trim()) formData.append('notes', photoNotes.trim());

      const res = await apiFetch('/api/progress-photos', { method: 'POST', body: formData });
      if (res.ok) {
        const photo = await res.json();
        setPhotos(prev => [photo, ...prev]);
        closeUploadModal();
      } else {
        Alert.alert("Couldn't Upload Photo", 'Try again in a moment.');
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Upload Photo", 'Try again in a moment.');
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
            } else {
              Alert.alert("Couldn't Delete Photo", 'Try again in a moment.');
            }
          } catch (err) {
            if (!isNetworkError(err)) Alert.alert("Couldn't Delete Photo", 'Try again in a moment.');
          }
        },
      },
    ]);
  };

  const exitCompare = () => {
    setCompareMode(false);
    setCompareIds([]);
  };

  const handlePhotoPress = (photo: Photo) => {
    if (!compareMode) {
      setSelectedPhoto(photo);
      return;
    }
    setCompareIds(prev => prev.includes(photo.id)
      ? prev.filter(id => id !== photo.id)
      : [...prev, photo.id].slice(-2));
  };

  // Older photo on the left, so the pair reads as before → after.
  const comparePair = compareIds.length === 2
    ? photos
        .filter(p => compareIds.includes(p.id))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : null;

  // ── Chart data ─────────────────────────────────────────────
  // Averages run over the whole history, then the chart shows the tail, so
  // the first plotted point still averages in the days before it.
  const bwAscending = useMemo(() => [...bwLogs].reverse(), [bwLogs]);
  const bwAverages = useMemo(() => trailingAverages(bwAscending), [bwAscending]);
  const chartLogs = bwAscending.slice(-20);
  const chartAverages = bwAverages.slice(-20);

  const bwChartData = chartLogs.map(log => ({
    value: log.weight,
    label: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
  const bwAvgChartData = chartAverages.map(value => ({ value }));

  const currentBw = bwLogs[0]?.weight;
  const currentAvg = bwAverages[bwAverages.length - 1];

  const mTrends = useMemo(
    () => Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, measurementTrend(mLogs, key)])),
    [mLogs],
  ) as Record<MeasurementKey, ReturnType<typeof measurementTrend>>;

  // ── Shared modal pieces ────────────────────────────────────
  const renderModalHeader = (title: string) => (
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>{title}</Text>
      {keyboardVisible && (
        <TouchableOpacity
          style={styles.modalKeyboardBtn}
          onPress={Keyboard.dismiss}
          accessibilityLabel="Hide keyboard"
          hitSlop={8}
        >
          <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderDateRow = (date: Date, setDate: (d: Date) => void) => (
    <View style={styles.dateRow}>
      <Text style={styles.dateRowLabel}>Date</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          maximumDate={new Date()}
          themeVariant={mode === 'dark' ? 'dark' : 'light'}
          accentColor={colors.accent}
          onChange={(_event: any, d?: Date) => { if (d) setDate(d); }}
        />
      ) : (
        <TouchableOpacity
          style={styles.dateRowBtn}
          onPress={() => { Keyboard.dismiss(); setAndroidPickerOpen(true); }}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
          <Text style={styles.dateRowValue}>{fmtShortDate(date)}</Text>
        </TouchableOpacity>
      )}
      {Platform.OS === 'android' && androidPickerOpen && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_event: any, d?: Date) => {
            setAndroidPickerOpen(false);
            if (d) setDate(d);
          }}
        />
      )}
    </View>
  );

  const renderModalButtons = (onCancel: () => void, onSave: () => void, saving: boolean, saveLabel = 'Save') => (
    <View style={styles.modalButtons}>
      <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modalBtn, { backgroundColor: colors.accent }]}
        onPress={onSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );

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
              {currentAvg != null && bwLogs.length >= 2 && (
                <Text style={styles.currentSub}>7-day avg {currentAvg} {weightUnit}</Text>
              )}
            </View>
            {bwChartData.length >= 2 && (
              <View style={styles.chartCard}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <LineChart
                  data={bwChartData}
                  data2={bwAvgChartData}
                  height={160}
                  spacing={44}
                  color={colors.accent}
                  color2={colors.textSecondary}
                  thickness={2}
                  thickness2={2}
                  strokeDashArray2={[4, 4]}
                  hideDataPoints={false}
                  hideDataPoints2
                  dataPointsColor={colors.accent}
                  startFillColor={colors.accent}
                  endFillColor={colors.background}
                  startOpacity={0.2}
                  endOpacity={0}
                  startOpacity2={0}
                  endOpacity2={0}
                  areaChart
                  curved
                  hideRules
                  hideYAxisText
                  xAxisLabelTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                  initialSpacing={10}
                  endSpacing={10}
                  noOfSections={4}
                />
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: colors.accent }]} />
                  <Text style={styles.legendText}>Weigh-ins</Text>
                  <View style={[styles.legendSwatch, { backgroundColor: colors.textSecondary }]} />
                  <Text style={styles.legendText}>7-day average</Text>
                </View>
              </View>
            )}
            <Text style={styles.sectionTitle}>History</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No entries yet. Tap + to log your weight.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.logRow} onPress={() => openBwModal(item)} accessibilityHint="Edit entry">
            <View>
              <Text style={styles.logPrimary}>{roundTenth(item.weight)} {weightUnit}</Text>
              <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity onPress={() => handleBwDelete(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </TouchableOpacity>
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
            <View style={styles.statsGrid}>
              {MEASUREMENT_FIELDS.map(({ key, short }) => {
                const trend = mTrends[key];
                return (
                  <View key={key} style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>{short}</Text>
                    <Text style={styles.statBoxValue}>
                      {trend ? `${roundTenth(trend.latest)}` : '—'}
                      {trend && <Text style={styles.statBoxUnit}> {lengthUnit}</Text>}
                    </Text>
                    {trend?.sinceLast != null && (
                      <Text style={styles.statBoxDelta}>{fmtSignedDelta(trend.sinceLast)} since last</Text>
                    )}
                    {trend?.sinceFirst != null && (
                      <Text style={styles.statBoxDelta}>{fmtSignedDelta(trend.sinceFirst)} since start</Text>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={styles.sectionTitle}>History</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No measurements yet. Tap + to log.</Text>
        }
        renderItem={({ item }) => {
          const parts = MEASUREMENT_FIELDS
            .filter(({ key }) => item[key] != null)
            .map(({ key, short }) => `${short}: ${roundTenth(item[key] as number)}`);
          return (
            <TouchableOpacity style={styles.logRow} onPress={() => openMModal(item)} accessibilityHint="Edit entry">
              <View style={{ flex: 1 }}>
                <Text style={styles.logDate}>{new Date(item.date).toLocaleDateString()}</Text>
                <Text style={styles.logPrimary} numberOfLines={2}>{parts.join('  ·  ')}</Text>
              </View>
              <TouchableOpacity onPress={() => handleMDelete(item.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </TouchableOpacity>
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
        {photos.length >= 2 && (
          <View style={styles.compareBar}>
            <Text style={styles.compareBarText}>
              {compareMode ? `Select 2 photos (${compareIds.length}/2)` : `${photos.length} photos`}
            </Text>
            <TouchableOpacity
              style={[styles.compareBtn, compareMode && { backgroundColor: colors.accent }]}
              onPress={compareMode ? exitCompare : () => setCompareMode(true)}
            >
              <Ionicons
                name={compareMode ? 'close' : 'git-compare-outline'}
                size={16}
                color={compareMode ? colors.accentText : colors.accent}
              />
              <Text style={[styles.compareBtnText, compareMode && { color: colors.accentText }]}>
                {compareMode ? 'Cancel' : 'Compare'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {photos.length === 0 ? (
          <Text style={[styles.emptyText, { margin: spacing.xl }]}>
            No progress photos yet. Tap + to upload.
          </Text>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={item => item.id.toString()}
            numColumns={2}
            extraData={compareIds}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
            columnWrapperStyle={{ gap: spacing.md }}
            renderItem={({ item }) => {
              const picked = compareIds.includes(item.id);
              return (
                <TouchableOpacity onPress={() => handlePhotoPress(item)}>
                  <Image
                    source={{ uri: item.photo_url }}
                    style={[
                      styles.photoCell,
                      { width: cellSize, height: cellSize },
                      compareMode && !picked && styles.photoCellDimmed,
                    ]}
                  />
                  {picked && (
                    <View style={[styles.photoPickBadge, { backgroundColor: colors.accent }]}>
                      <Ionicons name="checkmark" size={16} color={colors.accentText} />
                    </View>
                  )}
                  <Text style={styles.photoDate}>
                    {new Date(item.date).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Floating add button */}
        {!compareMode && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.accent }]}
            onPress={handleAddPhoto}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator size="small" color={colors.accentText} />
              : <Ionicons name="add" size={28} color={colors.accentText} />
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Determine which add button to show and what it does
  const handleAdd = () => {
    if (activeTab === 'bodyweight') openBwModal();
    else if (activeTab === 'measurements') openMModal();
    else handleAddPhoto();
  };

  const compareHalfWidth = (SCREEN_WIDTH - spacing.md * 3) / 2;

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
            <Ionicons name="add" size={22} color={colors.accentText} />
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
            onPress={() => { setActiveTab(tab); exitCompare(); }}
          >
            <Text style={[styles.tabLabel, activeTab === tab && { color: colors.accent }]}>
              {tab === 'bodyweight' ? 'Bodyweight' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'bodyweight' && renderBodyweightTab()}
      {activeTab === 'measurements' && renderMeasurementsTab()}
      {activeTab === 'photos' && renderPhotosTab()}

      {/* Log Weight Modal */}
      <Modal visible={bwModal} transparent animationType="fade" onRequestClose={closeBwModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={styles.modalBox}>
            {renderModalHeader(bwEditing ? 'Edit Weight' : 'Log Weight')}
            <TextInput
              style={styles.modalInput}
              placeholder={`Weight (${weightUnit})`}
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={bwInput}
              onChangeText={setBwInput}
              autoFocus={!bwEditing}
            />
            {renderDateRow(bwDate, setBwDate)}
            {renderModalButtons(closeBwModal, handleBwSave, bwSaving)}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Log Measurements Modal */}
      <Modal visible={mModal} transparent animationType="fade" onRequestClose={closeMModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={styles.modalBox}>
            {renderModalHeader(mEditing ? 'Edit Measurements' : 'Log Measurements')}
            {/* Two columns keep all six fields above the keyboard on small phones;
                the ScrollView is the fallback when they still don't fit. */}
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={styles.mFieldGrid}>
                {MEASUREMENT_FIELDS.map(({ key, label }) => {
                  const last = mTrends[key]?.latest;
                  return (
                    <View key={key} style={styles.mField}>
                      <Text style={styles.mFieldLabel}>{label} ({lengthUnit})</Text>
                      <TextInput
                        style={styles.mFieldInput}
                        accessibilityLabel={label}
                        placeholder={last != null ? `${roundTenth(last)}` : '—'}
                        placeholderTextColor={colors.placeholder}
                        keyboardType="decimal-pad"
                        value={mValues[key]}
                        onChangeText={v => setMValues(prev => ({ ...prev, [key]: v }))}
                      />
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            {renderDateRow(mDate, setMDate)}
            {renderModalButtons(closeMModal, handleMSave, mSaving)}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Photo upload (notes) Modal */}
      <Modal visible={!!pendingPhoto} transparent animationType="fade" onRequestClose={closeUploadModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={styles.modalBox}>
            {renderModalHeader('New Progress Photo')}
            {pendingPhoto && (
              <Image source={{ uri: pendingPhoto.uri }} style={styles.uploadPreview} resizeMode="cover" />
            )}
            <TextInput
              style={[styles.modalInput, styles.notesInput]}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.placeholder}
              value={photoNotes}
              onChangeText={setPhotoNotes}
              maxLength={250}
              multiline
            />
            {renderModalButtons(closeUploadModal, handleUploadPhoto, uploading, 'Upload')}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Side-by-side compare Modal */}
      <Modal visible={!!comparePair} transparent animationType="fade" onRequestClose={exitCompare}>
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={styles.photoModalClose} onPress={exitCompare} accessibilityLabel="Close comparison">
            <Ionicons name="close" size={28} color={colors.accentText} />
          </TouchableOpacity>
          {comparePair && (
            <>
              <Text style={styles.compareTitle}>
                {(() => {
                  const days = Math.round(
                    (new Date(comparePair[1].date).getTime() - new Date(comparePair[0].date).getTime()) / DAY_MS);
                  return days === 0 ? 'Same day' : `${days} ${days === 1 ? 'day' : 'days'} apart`;
                })()}
              </Text>
              <View style={styles.compareRow}>
                {comparePair.map(p => (
                  <View key={p.id} style={{ width: compareHalfWidth }}>
                    <Image
                      source={{ uri: p.photo_url }}
                      style={{ width: compareHalfWidth, height: compareHalfWidth * 4 / 3, borderRadius: spacing.sm }}
                      resizeMode="cover"
                    />
                    <Text style={styles.compareDate}>{fmtShortDate(new Date(p.date))}</Text>
                    {p.notes ? <Text style={styles.compareNotes} numberOfLines={3}>{p.notes}</Text> : null}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Full-screen photo modal */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={styles.photoModalClose} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={28} color={colors.accentText} />
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
                <Ionicons name="trash-outline" size={18} color={colors.accentText} />
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
    marginBottom: spacing.xs,
  },
  currentValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  currentSub: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  legendSwatch: { width: 12, height: 3, borderRadius: 2, marginLeft: spacing.sm },
  legendText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

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
    marginBottom: spacing.xs,
  },
  statBoxValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statBoxUnit: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statBoxDelta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
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

  compareBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  compareBarText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  compareBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.accent },
  photoCell: { borderRadius: spacing.sm },
  photoCellDimmed: { opacity: 0.45 },
  photoPickBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoDate: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalKeyboardBtn: {
    position: 'absolute',
    right: 0,
  },
  modalScroll: { flexGrow: 0, marginBottom: spacing.md },
  mFieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  mField: { width: '48%' },
  mFieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dateRowLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  dateRowBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dateRowValue: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.accent },
  uploadPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: spacing.sm,
    marginBottom: spacing.md,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  mFieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
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
  saveBtnText: { color: colors.accentText, fontWeight: '600' },

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
  compareTitle: {
    color: colors.accentText,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  compareRow: { flexDirection: 'row', gap: spacing.md },
  compareDate: {
    color: colors.accentText,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  compareNotes: {
    color: colors.accentText,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  photoFull: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
  },
  photoNotes: {
    color: colors.accentText,
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
    color: colors.accentText,
    fontWeight: '600',
    fontSize: typography.fontSize.md,
  },
});
