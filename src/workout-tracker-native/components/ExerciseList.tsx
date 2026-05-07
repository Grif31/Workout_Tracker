import React, { useMemo, useState } from 'react';
import { useTheme, type Colors } from '../context/ThemeContext';
import {
  View,
  Text,
  TextInput,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SectionList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NewExerciseForm from './NewExerciseForm';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Exercise = {
  id: number;
  name: string;
  muscle_group: string;
  equipment?: string;
  image_url?: string;
  exercise_type?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  exercises: Exercise[];
  recentExerciseNames?: string[];
  onSelect: (exercise: { id: number; name: string; equipment?: string; image_url?: string; exercise_type?: string }) => void;
  onAddExercise: (name: string, muscle: string) => void;
  muscleGroups: string[];
};

export default function ExerciseListModal({
  visible,
  onClose,
  exercises,
  recentExerciseNames = [],
  onSelect,
  onAddExercise,
  muscleGroups,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [formVisible, setFormVisible] = useState(false);

  const displayName = (ex: Exercise) =>
    ex.equipment ? `${ex.name} (${ex.equipment})` : ex.name;

  const strengthExercises = useMemo(
    () => exercises.filter(ex => (ex.exercise_type || 'strength') === 'strength'),
    [exercises],
  );
  const cardioExercises = useMemo(
    () => exercises.filter(ex => ex.exercise_type === 'cardio'),
    [exercises],
  );

  const strengthFiltered = useMemo(() => {
    if (selectedMuscle === 'Cardio') return [];
    return strengthExercises.filter(ex => {
      const searchMatch = displayName(ex).toLowerCase().includes(search.toLowerCase());
      const muscleMatch = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle;
      return searchMatch && muscleMatch;
    });
  }, [strengthExercises, search, selectedMuscle]);

  const cardioFiltered = useMemo(() => cardioExercises.filter(ex =>
    displayName(ex).toLowerCase().includes(search.toLowerCase())
  ), [cardioExercises, search]);

  const recentFiltered = useMemo(() => {
    if (search) return [];
    return recentExerciseNames
      .map(name => exercises.find(ex => displayName(ex) === name || ex.name === name))
      .filter((ex): ex is Exercise => ex !== undefined)
      .filter(ex => {
        if (selectedMuscle === 'Cardio') return ex.exercise_type === 'cardio';
        return selectedMuscle === 'All' || ex.muscle_group === selectedMuscle || ex.exercise_type === 'cardio';
      })
      .slice(0, 5);
  }, [recentExerciseNames, exercises, search, selectedMuscle]);

  const sections = useMemo(() => {
    if (search) {
      const allResults = selectedMuscle === 'Cardio'
        ? cardioFiltered
        : [...strengthFiltered, ...cardioFiltered];
      return [{ title: 'Results', data: allResults }];
    }
    return [
      ...(recentFiltered.length > 0 ? [{ title: 'Recent', data: recentFiltered }] : []),
      ...(strengthFiltered.length > 0 ? [{ title: 'All Exercises', data: strengthFiltered }] : []),
      ...(cardioFiltered.length > 0 ? [{ title: 'Cardio', data: cardioFiltered }] : []),
    ];
  }, [search, strengthFiltered, cardioFiltered, recentFiltered, selectedMuscle]);

  const handleClose = () => {
    setSearch('');
    setSelectedMuscle('All');
    onClose();
  };

  const handleSelect = (ex: Exercise) => {
    onSelect({
      id: ex.id,
      name: ex.name,
      equipment: ex.equipment,
      image_url: ex.image_url,
      exercise_type: ex.exercise_type,
    });
    setSearch('');
    setSelectedMuscle('All');
  };

  const renderCard = ({ item }: { item: Exercise }) => {
    const isCardio = item.exercise_type === 'cardio';
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons
              name={isCardio ? 'bicycle-outline' : 'barbell-outline'}
              size={24}
              color={colors.textSecondary}
            />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{displayName(item)}</Text>
          <Text style={styles.cardMuscle}>{isCardio ? 'Cardio' : item.muscle_group}</Text>
        </View>
        <Ionicons name="add-circle-outline" size={22} color={colors.save} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Exercise</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Search row */}
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.createBtn} onPress={() => setFormVisible(true)}>
            <Text style={styles.createBtnText}>+ Create</Text>
          </TouchableOpacity>
          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor={colors.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {search !== '' && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Muscle filter chips (strength only) */}
        <View style={styles.chipContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {['All', 'Cardio', ...muscleGroups].map(group => (
              <TouchableOpacity
                key={group}
                style={[styles.chip, selectedMuscle === group && styles.chipActive]}
                onPress={() => setSelectedMuscle(group)}
              >
                <Text style={[styles.chipText, selectedMuscle === group && styles.chipTextActive]}>
                  {group}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Exercise list */}
        <SectionList
          sections={sections}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={renderCard}
          ListEmptyComponent={<Text style={styles.emptyText}>No exercises found</Text>}
          stickySectionHeadersEnabled={false}
        />

        <NewExerciseForm
          visible={formVisible}
          onClose={() => setFormVisible(false)}
          onSave={(name, muscle) => {
            onAddExercise(name, muscle);
            setFormVisible(false);
          }}
          muscleGroups={muscleGroups}
        />
      </View>
    </Modal>
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
  closeBtn: { padding: 4, width: 60 },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: typography.fontSize.sm,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    height: 40,
    padding: 0,
  },
  chipContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    height: 48,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: spacing.xs,
    backgroundColor: colors.border,
  },
  cardImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: spacing.xs,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardMuscle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    fontSize: typography.fontSize.sm,
  },
});
