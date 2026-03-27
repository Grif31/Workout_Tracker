import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ExercisesStackParamsList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'ExerciseDetail'>;

export default function ExerciseDetailScreen({ route, navigation }: Props) {
  const { exerciseName, equipment, muscleGroup } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{exerciseName}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Primary Muscle Group</Text>
          <Text style={styles.value}>{muscleGroup}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Equipment</Text>
          <Text style={styles.value}>{equipment ?? 'Bodyweight / None'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Exercise Tips</Text>
          <Text style={styles.body}>
            Focus on a slow, controlled motion and keep your core engaged. Breathe evenly, avoid jerky movements, and stop if you feel pain.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  closeButton: {
    padding: spacing.sm,
  },
  content: {
    padding: spacing.md,
    paddingTop: 0,
  },
  title: {
    fontSize: typography.fontSize.lg,
    color: '#fff',
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: typography.fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  body: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
