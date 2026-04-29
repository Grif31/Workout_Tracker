import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, muscle: string) => void;
  muscleGroups: string[];
};

export default function NewExerciseForm({ visible, onClose, onSave, muscleGroups }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('Chest');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name, muscle);
    setName('');
    setMuscle('Chest');
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.topbar}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Add New Exercise</Text>
          <TextInput
            style={styles.input}
            placeholder="Exercise Name"
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={setName}
          />
          <Text style={styles.sectionTitle}>Select Muscle Group</Text>
          <FlatList
            data={muscleGroups}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.muscleItem, muscle === item && styles.muscleItemSelected]}
                onPress={() => setMuscle(item)}
              >
                <Text style={[styles.muscleText, muscle === item && styles.muscleTextSelected]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: { width: '85%', maxHeight: '80%', backgroundColor: colors.surface, borderRadius: spacing.sm, padding: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', marginBottom: spacing.lg, color: colors.textPrimary },
  input: { borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, borderRadius: spacing.sm, color: colors.textPrimary, backgroundColor: colors.background, fontSize: typography.fontSize.md },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  cancelText: { color: colors.textSecondary, fontSize: typography.fontSize.md },
  saveText: { color: colors.accent, fontWeight: 'bold', fontSize: typography.fontSize.md },
  muscleText: { fontSize: typography.fontSize.md, color: colors.textPrimary },
  muscleTextSelected: { fontWeight: 'bold', color: colors.accent },
  muscleItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 5, marginBottom: 6 },
  muscleItemSelected: { backgroundColor: colors.accent + '30' },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: '600', marginBottom: 8, color: colors.textPrimary },
});
