import React, {useState} from 'react';
import { View, Text, TextInput, Button, Modal, StyleSheet, FlatList, TouchableOpacity} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
    visible: boolean;
    onClose: () => void;
    onSave: (name: string, muscle: string) => void;
    muscleGroups: string[];
};

export default function NewExerciseForm({visible, onClose, onSave, muscleGroups}: Props){
    const [name, setName] = useState('');
    const [muscle, setMuscle] = useState('Chest');

    const handleSave = () => {
        if(!name.trim()) return;
        onSave(name, muscle);
        setName('');
        setMuscle('Chest');
    };

    return (
        <Modal transparent animationType='fade' visible={visible} onRequestClose={onClose}>
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
                    placeholderTextColor="#666"
                    value={name}
                    onChangeText={setName}
                  />
                  <Text style={styles.sectionTitle}>Select Muscle Group</Text>
                  <FlatList
                    data={muscleGroups}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.muscleItem,
                          muscle === item && styles.muscleItemSelected
                        ]}
                        onPress={() => setMuscle(item)}
                      >
                        <Text
                          style={[
                            styles.muscleText,
                            muscle === item && styles.muscleTextSelected
                          ]}
                        >
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
const styles = StyleSheet.create({
      overlay:{flex: 1, backgroundColor: colors.background, justifyContent:'center', alignItems: 'center'},
      card:{width: '85%', maxHeight: '80%', backgroundColor: colors.surface, borderRadius: spacing.sm, elevation:spacing.xs, padding:spacing.md },
      title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', marginBottom: spacing.lg },
      input: { borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, borderRadius: spacing.sm, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: typography.fontSize.md, },
      topbar: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md},
      cancelText: {color: colors.textSecondary, fontSize: spacing.md},
      saveText: {color: colors.save, fontWeight: 'bold', fontSize: spacing.md},
      muscleText: {fontSize: spacing.md, color: '#333'},
      muscleTextSelected: {fontWeight: 'bold', color: '#0056b3'},
      muscleItem: {paddingVertical: 10, paddingHorizontal: 12, borderRadius: 5,marginBottom: 6},
      muscleItemSelected: {backgroundColor: '#b2d5fbff'},
      sectionTitle:{fontSize: spacing.md, fontWeight: '600', marginBottom: 8}
    });