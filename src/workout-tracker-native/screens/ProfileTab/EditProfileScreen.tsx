import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { apiFetch, resolveMediaUrl } from '../../utils/api';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicUri, setProfilePicUri] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill from user whenever user data loads (handles async auth state)
  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setBio(user.bio ?? '');
    setProfilePicUri(user.profile_pic_url ?? '');
    if (user.height != null) {
      setHeightFt(String(Math.floor(user.height / 12)));
      setHeightIn(String(Math.round(user.height % 12)));
    }
    setGender((user as any).gender ?? null);
    const bd = (user as any).birth_date;
    if (bd) {
      const [y, m, d] = bd.split('-').map(Number);
      setBirthDate(new Date(y, m - 1, d));
    } else {
      setBirthDate(null);
    }
  }, [user]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 300, height: 300 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    setProfilePicUri(`data:image/jpeg;base64,${manipulated.base64}`);
  };

  const handleSave = async () => {
    const totalInches =
      heightFt || heightIn
        ? parseInt(heightFt || '0') * 12 + parseFloat(heightIn || '0')
        : null;

    const birthDateIso = birthDate
      ? `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`
      : null;

    setSaving(true);
    try {
      const resolvedPicUrl = profilePicUri;

      const res = await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bio,
          profile_pic_url: resolvedPicUrl,
          height: totalInches,
          gender,
          birth_date: birthDateIso,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        await updateUser(updated);
        Alert.alert('Saved', 'Profile updated successfully');
        navigation.goBack();
      } else {
        const data = await res.json();
        Alert.alert('Error', data.message || 'Failed to save profile');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
      </View>

      <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
        <Image
          source={
            profilePicUri
              ? { uri: resolveMediaUrl(profilePicUri) }
              : require('../../assets/profile-placeholder.png')
          }
          style={styles.avatar}
        />
        <Text style={styles.avatarHint}>Tap to change photo</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={colors.placeholder}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        placeholder="Describe yourself, your fitness goals, or anything you like!"
        placeholderTextColor={colors.placeholder}
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.sectionHeader}>Body Stats</Text>

      <Text style={styles.label}>Gender</Text>
      <View style={styles.chipRow}>
        {(['male', 'female', null] as const).map((val) => {
          const label = val === 'male' ? 'Male' : val === 'female' ? 'Female' : 'Prefer not to say';
          const active = gender === val;
          return (
            <TouchableOpacity
              key={label}
              style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setGender(val)}
            >
              <Text style={[styles.chipText, active && { color: colors.accentText }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Birthday</Text>
      <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
        <Text style={[styles.dateText, !birthDate && { color: colors.placeholder }]}>
          {birthDate
            ? birthDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
            : 'Select birthday'}
        </Text>
      </TouchableOpacity>

      {/* iOS: modal wrapper so the picker doesn't push layout */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerCard}>
              <TouchableOpacity style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
                <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 16 }}>Done</Text>
              </TouchableOpacity>
              <DateTimePicker
                value={birthDate ?? new Date(1990, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date(new Date().getFullYear() - 14, 11, 31)}
                minimumDate={new Date(1920, 0, 1)}
                onChange={(_, date) => { if (date) setBirthDate(date); }}
              />
            </View>
          </View>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={birthDate ?? new Date(1990, 0, 1)}
            mode="date"
            display="default"
            maximumDate={new Date(new Date().getFullYear() - 14, 11, 31)}
            minimumDate={new Date(1920, 0, 1)}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setBirthDate(date);
            }}
          />
        )
      )}

      <Text style={styles.label}>Height</Text>
      <View style={styles.row}>
        <View style={styles.halfInputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="ft"
            placeholderTextColor={colors.placeholder}
            value={heightFt}
            onChangeText={setHeightFt}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.halfInputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="in"
            placeholderTextColor={colors.placeholder}
            value={heightIn}
            onChangeText={setHeightIn}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color={colors.accentText} />
          : <Text style={styles.saveButtonText}>Save Changes</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.border,
  },
  avatarHint: {
    color: colors.save,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  bioInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateText: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
  },
  pickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  pickerDone: {
    alignItems: 'flex-end',
    padding: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  halfInputWrapper: {
    flex: 1,
  },
  unitToggle: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    height: 52,
    alignSelf: 'flex-start',
  },
  unitBtn: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  unitBtnActive: {
    backgroundColor: colors.save,
  },
  unitBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: typography.fontSize.sm,
  },
  unitBtnTextActive: {
    color: colors.accentText,
  },
  saveButton: {
    backgroundColor: colors.save,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.accentText,
    fontSize: typography.fontSize.md,
    fontWeight: '600',
  },
  cancelButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: typography.fontSize.md,
  },
});
