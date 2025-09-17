import React, { useState } from 'react';
import { View, Text, TextInput, Button, Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import NewExerciseForm from './NewExerciseForm';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Exercise = { id: number; name: string; muscle_group: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  exercises: Exercise[];
  onSelect: (exerciseName: string) => void;
  onAddExercise: (name: string, muscle: string) => void;
  muscleGroups: string[];
};

export default function ExerciseListModal({visible, onClose, exercises, onSelect, onAddExercise, muscleGroups}: Props){
    const [search, setSearch] = useState('');
    const [selectedMuscle, setSelectedMuscle] = useState('All'); 
    const [formVisible, setFormVisible] = useState(false)

    // To Search for a exercise by name or muscle group
    const filteredEx = exercises.filter(ex => {
    const searchMatch = ex.name.toLowerCase().includes(search.toLowerCase())
    const muscleMatch = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle 
    return searchMatch && muscleMatch;
    });

    return (
        <Modal visible={visible} animationType='slide' onRequestClose={onClose} >
            <View style={styles.container}>
                <Text style={styles.title}>Select Exercise</Text>
                <TextInput
                style={styles.input}
                placeholder="Search..."
                placeholderTextColor="#666"
                value={search}
                onChangeText={setSearch}
                />
                <View style={styles.muscleFilter}>
                {['All', ...muscleGroups].map(group => (
                    <TouchableOpacity
                    key={group}
                    style={[styles.muscleButton, selectedMuscle === group && styles.selectedButton]}
                    onPress={() => setSelectedMuscle(group)}
                    >
                    <Text>{group}</Text>
                    </TouchableOpacity>
                ))}
                </View>
                <Button title="➕ New Exercise" onPress={() => setFormVisible(true)} />
                <FlatList
                data={filteredEx}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.item} onPress={() => onSelect(item.name)}>
                    <Text>{item.name} ({item.muscle_group})</Text>
                    </TouchableOpacity>
                )}
                />
                <Button title="Close" onPress={onClose} />

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
const styles = StyleSheet.create({
    title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', marginBottom: spacing.lg },
    input: { borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, borderRadius: spacing.sm, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: typography.fontSize.md, },
    container: { padding: spacing.lg },
    muscleFilter: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
    muscleButton: { padding: spacing.sm, backgroundColor: colors.surface, borderRadius: spacing.sm, margin: spacing.sm },
    item: {padding: spacing.md, backgroundColor: colors.surface, marginBottom: spacing.sm, borderRadius: spacing.xs},
    selectedButton: { backgroundColor: '#cce5ff' },
});
