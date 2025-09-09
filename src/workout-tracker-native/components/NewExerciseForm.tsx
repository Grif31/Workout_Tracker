import React, {useState} from 'react';
import { View, Text, TextInput, Button, Modal, StyleSheet} from 'react-native';
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
                <Text style={styles.title}>Add New Exercise</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Exercise Name"
                    placeholderTextColor="#666"
                    value={name}
                    onChangeText={setName}
                  />
                  <View style={styles.pickerContainer}>
                    <Picker selectedValue={muscle} onValueChange={setMuscle}
                      style={styles.picker} dropdownIconColor={colors.textPrimary}
                    >
                    {['Chest', 'Back', 'Legs', 'Arms', 'Shoulders','Core'].map((group) => (
                      <Picker.Item  label={group} value={group} key={group}/>
                    ))}
                    </Picker>
                  </View>
                <Button title='Cancel' onPress={onClose} color="#999"/>
                <Button title="Save" onPress={handleSave} />
                  </View>
            </Modal>
    );
}
const styles = StyleSheet.create({
      overlay:{flex: 1, backgroundColor: colors.background, justifyContent:'center', alignItems: 'center'},
      title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', marginBottom: spacing.lg },
      input: { borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, borderRadius: spacing.sm, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: typography.fontSize.md, },
      picker: { color: colors.textPrimary, fontSize: typography.fontSize.md,},
      pickerContainer: {  borderWidth: 1, borderColor: colors.border, borderRadius: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.surface, overflow: 'hidden',},
    });