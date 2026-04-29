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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { ProfileStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<ProfileStackParamsList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { user, token, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicUri, setProfilePicUri] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [bodyweight, setBodyweight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
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
    if (user.bodyweight != null) {
      setBodyweight(String(user.bodyweight));
    }
    if (user.weight_unit) {
      setWeightUnit(user.weight_unit);
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
      quality: 0.7,
    });
    if (!result.canceled) {
      setProfilePicUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const totalInches =
      heightFt || heightIn
        ? parseInt(heightFt || '0') * 12 + parseFloat(heightIn || '0')
        : null;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          bio,
          profile_pic_url: profilePicUri,
          height: totalInches,
          bodyweight: bodyweight || null,
          weight_unit: weightUnit,
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
      <Text style={styles.title}>Edit Profile</Text>

      <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
        <Image
          source={
            profilePicUri
              ? { uri: profilePicUri }
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

      <Text style={styles.label}>Bodyweight</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.input}
            placeholder={weightUnit === 'lbs' ? 'e.g. 185' : 'e.g. 84'}
            placeholderTextColor={colors.placeholder}
            value={bodyweight}
            onChangeText={setBodyweight}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.unitToggle}>
          <TouchableOpacity
            style={[styles.unitBtn, weightUnit === 'lbs' && styles.unitBtnActive]}
            onPress={() => setWeightUnit('lbs')}
          >
            <Text style={[styles.unitBtnText, weightUnit === 'lbs' && styles.unitBtnTextActive]}>
              lbs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitBtn, weightUnit === 'kg' && styles.unitBtnActive]}
            onPress={() => setWeightUnit('kg')}
          >
            <Text style={[styles.unitBtnText, weightUnit === 'kg' && styles.unitBtnTextActive]}>
              kg
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
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
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#eee',
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
    color: '#fff',
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
    color: '#fff',
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
