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
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, resolveMediaUrl, isNetworkError } from '../../utils/api';
import { toLocalDateStr } from '../../utils/date';
import { showToast } from '../../utils/toast';
import { useDiscardGuard } from '../../utils/useDiscardGuard';
import { cmToInches, ftInToInches, inchesToCm, inchesToFtIn } from '../../utils/height';
import SegmentedControl from '../../components/SegmentedControl';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'EditProfile'>;

type Gender = 'male' | 'female' | 'none';
const GENDERS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'none', label: 'Rather not say' },
] as const;

// Mirror UpdateProfileSchema in schemas.py; past them the save is rejected
const NAME_MAX = 100;
const BIO_MAX = 1000;

type Form = {
  name: string; bio: string; pic: string; gender: Gender;
  heightFt: string; heightIn: string; heightCm: string; birthDate: string | null;
};

export default function EditProfileScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Lengths follow the weight unit everywhere (utils/bodyMetrics lengthUnitFor)
  const metric = user?.weight_unit === 'kg';

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicUri, setProfilePicUri] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [gender, setGender] = useState<Gender>('none');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // The form as loaded; anything different is unsaved
  const [initial, setInitial] = useState<string | null>(null);

  const snapshot = (f: Form) => JSON.stringify({ ...f, name: f.name.trim(), bio: f.bio.trim() });
  const current: Form = {
    name, bio, pic: profilePicUri, gender, heightFt, heightIn, heightCm,
    birthDate: birthDate ? toLocalDateStr(birthDate) : null,
  };

  // Prefill once the user is known. Keyed on the id, not the object: a
  // refreshed user object mid-edit must not wipe what's been typed.
  useEffect(() => {
    if (!user) return;
    const loaded: Form = {
      name: user.name ?? '',
      bio: user.bio ?? '',
      pic: user.profile_pic_url ?? '',
      gender: (user as any).gender ?? 'none',
      heightFt: '', heightIn: '', heightCm: '',
      birthDate: (user as any).birth_date ?? null,
    };
    if (user.height != null) {
      const { ft, inch } = inchesToFtIn(user.height);
      loaded.heightFt = String(ft);
      loaded.heightIn = String(inch);
      loaded.heightCm = String(inchesToCm(user.height));
    }
    setName(loaded.name);
    setBio(loaded.bio);
    setProfilePicUri(loaded.pic);
    setGender(loaded.gender);
    setHeightFt(loaded.heightFt);
    setHeightIn(loaded.heightIn);
    setHeightCm(loaded.heightCm);
    if (loaded.birthDate) {
      const [y, m, d] = loaded.birthDate.split('-').map(Number);
      setBirthDate(new Date(y, m - 1, d));
    } else {
      setBirthDate(null);
    }
    setInitial(snapshot(loaded));
  }, [user?.id]);

  const dirty = initial != null && snapshot(current) !== initial;
  const leave = useDiscardGuard(navigation, dirty, "Your profile changes haven't been saved.");
  const heightChanged = initial != null && (() => {
    const was: Form = JSON.parse(initial);
    return was.heightFt !== heightFt || was.heightIn !== heightIn || was.heightCm !== heightCm;
  })();

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
    const body: Record<string, unknown> = {
      name: name.trim(),
      bio: bio.trim(),
      profile_pic_url: profilePicUri,
      gender: gender === 'none' ? null : gender,
      birth_date: birthDate ? toLocalDateStr(birthDate) : null,
    };
    // Only when edited: the fields show a rounded height, and sending that
    // back untouched would quietly change what's stored
    if (heightChanged) {
      body.height = metric ? cmToInches(heightCm) : ftInToInches(heightFt, heightIn);
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await updateUser(await res.json());
        showToast('Profile saved');
        leave(() => navigation.goBack());
      } else {
        const data = await res.json().catch(() => null);
        const message = typeof data?.message === 'string' && data.message.startsWith('height')
          ? 'Check the height you entered.'
          : 'Try again in a moment.';
        Alert.alert("Couldn't Save Profile", message);
      }
    } catch (err) {
      if (!isNetworkError(err)) Alert.alert("Couldn't Save Profile", 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const birthdayPicker = (
    <DateTimePicker
      value={birthDate ?? new Date(1990, 0, 1)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      // Without it the iOS spinner follows the system theme, not the app's,
      // and can draw dark text on the dark sheet
      themeVariant={mode}
      maximumDate={new Date(new Date().getFullYear() - 14, 11, 31)}
      minimumDate={new Date(1920, 0, 1)}
      onChange={(_, date) => {
        if (Platform.OS !== 'ios') setShowDatePicker(false);
        if (date) setBirthDate(date);
      }}
    />
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Profile</Text>
        </View>

        <TouchableOpacity
          onPress={pickImage}
          style={styles.avatarContainer}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          <View>
            <Image
              source={
                profilePicUri
                  ? { uri: resolveMediaUrl(profilePicUri) }
                  : require('../../assets/profile-placeholder.png')
              }
              style={styles.avatar}
            />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.accentText} />
            </View>
          </View>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.placeholder}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          autoComplete="name"
          textContentType="name"
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="Describe yourself, your fitness goals, or anything you like."
          placeholderTextColor={colors.placeholder}
          value={bio}
          onChangeText={setBio}
          maxLength={BIO_MAX}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.sectionHeader}>Body Stats</Text>

        <Text style={styles.label}>Gender</Text>
        <SegmentedControl options={GENDERS} value={gender} onChange={setGender} size="md" appearance="solid" />
        <Text style={styles.hint}>Strength Score and Endurance Score need this to compare your exercises.</Text>

        <Text style={styles.label}>Birthday</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateTap} onPress={() => setShowDatePicker(true)} accessibilityRole="button">
            <Text style={[styles.dateText, !birthDate && { color: colors.placeholder }]}>
              {birthDate
                ? birthDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                : 'Select birthday'}
            </Text>
          </TouchableOpacity>
          {birthDate && (
            <TouchableOpacity onPress={() => setBirthDate(null)} hitSlop={8} accessibilityLabel="Clear birthday">
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* iOS: modal wrapper so the picker doesn't push layout */}
        {Platform.OS === 'ios' ? (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <TouchableOpacity style={styles.pickerModal} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
              <View style={styles.pickerCard} onStartShouldSetResponder={() => true}>
                <TouchableOpacity style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
                {birthdayPicker}
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          showDatePicker && birthdayPicker
        )}

        <Text style={styles.label}>Height</Text>
        {metric ? (
          <TextInput
            style={styles.input}
            placeholder="cm"
            placeholderTextColor={colors.placeholder}
            value={heightCm}
            onChangeText={setHeightCm}
            keyboardType="decimal-pad"
            accessibilityLabel="Height in centimeters"
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.halfInputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="ft"
                placeholderTextColor={colors.placeholder}
                value={heightFt}
                onChangeText={setHeightFt}
                keyboardType="number-pad"
                accessibilityLabel="Height, feet"
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
                accessibilityLabel="Height, inches"
              />
            </View>
          </View>
        )}

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
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
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
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
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
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.md,
  },
  dateTap: { flex: 1, padding: spacing.md },
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
    paddingBottom: spacing.xl,
  },
  pickerDone: {
    alignItems: 'flex-end',
    padding: spacing.md,
  },
  pickerDoneText: { color: colors.accent, fontWeight: '600', fontSize: typography.fontSize.md },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  halfInputWrapper: {
    flex: 1,
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
