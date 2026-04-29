import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';

const SET_TYPE_LABELS: Record<string, string> = { W: 'Warmup', D: 'Drop Set', F: 'Failure' };
const SET_TYPE_COLORS: Record<string, string> = { W: '#FF9500', D: '#AF52DE', F: '#FF3B30' };
import { Workout } from '../types/models';
import { useAuth } from '../context/AuthContext';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, type Colors } from '../context/ThemeContext';


const  API_URL = process.env.EXPO_PUBLIC_API_URL;

export type PrefillWorkoutData = {
    name: string;
    notes: string;
    exercises: { name: string; sets: { reps: string ; weight: string }[];}[];
};

type Props = {
    workoutId: number,
    onEdit?: (prefill: PrefillWorkoutData) => void;
    onDelete?: (workoutId: number) => void;
    onSaveAsRoutine?: (workout: Workout) => void;
    onPerformAgain?: (prefill: PrefillWorkoutData) => void;
 };

export default function WorkoutDetailsScreen({ workoutId, onEdit, onDelete, onSaveAsRoutine, onPerformAgain }: Props){
  const { colors } = useTheme();
  const [workout, setWorkout] = useState<Workout>();
  const { showActionSheetWithOptions } = useActionSheet();
  const { token, user } = useAuth();
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';
  const styles = useMemo(() => createStyles(colors), [colors]);


  useFocusEffect(
    useCallback(() => {
      fetchWorkout();
    }, [workoutId])
  );

  // Method to Prefill a blank workout form with the same exercises as the current workout
  // Edit will prefill the reps and weight 
  // perform will leave them empty 
  const buildPrefill = (mode: 'perform' | 'edit') : PrefillWorkoutData => {
    if(!workout){ throw new Error('no workout loaded')}
    return{
        name: workout.name,
        notes: workout.notes || '',
        exercises: workout.exercises.map((e) => ({
            name: e.name,
            sets: e.sets.map((s) => ({
                reps: mode === 'edit' ? s.reps : '',
                weight: mode === 'edit' ? s.weight : '',
            })),
            
        }))
    };
  };


  const fetchWorkout = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workouts/${workoutId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        Alert.alert('Error', 'Failed to load workout');
        return;
      }
      const data = await res.json();
      setWorkout(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to load workout');
    }
  };

  const openMenu = () => {
    const options = ['Edit Workout', 'Perform Again', 'Save as Rountine', 'Delete Workout']
    const destructiveButtonIndex = 3

    showActionSheetWithOptions( { options, destructiveButtonIndex },

        (buttonIndex) => {
            if(!workout) return;
            switch(buttonIndex){
                case 0: 
                    onEdit?.(buildPrefill('edit'))
                    break;
                case 1:
                    onPerformAgain?.(buildPrefill('perform'))
                    break;
                case 2:
                    onSaveAsRoutine?.(workout)
                    break;
                case 3:
                    confirmDelete();
                    break;
                
            }
        }
    )
  };
  const confirmDelete = () => {
        Alert.alert('Delete Workout', 'Are you sure you want to delete this workout?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout()},
    ]);
  };
  const deleteWorkout = async () => {
    if(!token) return;
    try{
      const res = await fetch(`${API_URL}/api/workouts/${workoutId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if(!res.ok){
        const err = await res.json();
        Alert.alert('Error', err.message || 'Failed to delete workout');
        return;
      }
      onDelete?.(workoutId);
    }catch(err){
      Alert.alert('Error', 'Failed to delete workout');
    }
  };


  if (!workout) return <Text>Loading...</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
      <Text style={styles.title}>{workout.name}</Text>
      <TouchableOpacity onPress={openMenu} style={{alignSelf:'flex-end'}}>
            <Ionicons name='ellipsis-vertical' size={24} color='black'/>
        </TouchableOpacity>
      <Text>{new Date(workout.date).toLocaleDateString()}</Text>
      <Text style={{ marginBottom: 10 }}>{workout.notes}</Text>
      </View>
      <FlatList
        data={workout.exercises}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.exerciseBlock}>
            <Text style={styles.exerciseName}>{item.name}</Text>
            {item.sets.map((s, i) => (
              <View key={i} style={styles.setRow}>
                <Text style={styles.setText}>Set {i + 1}</Text>
                {s.set_type && s.set_type !== 'N' && (
                  <View style={[styles.setTypeBadge, { backgroundColor: SET_TYPE_COLORS[s.set_type] }]}>
                    <Text style={styles.setTypeBadgeText}>{SET_TYPE_LABELS[s.set_type]}</Text>
                  </View>
                )}
                <Text style={styles.setText}>: {s.reps} reps @ {s.weight} {weightUnit}</Text>
              </View>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 5, color: colors.textPrimary },
  exerciseBlock: { marginBottom: 15 },
  exerciseName: { fontWeight: 'bold', fontSize: 16, color: colors.textPrimary },
  topbar: { alignItems: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  setText: { color: colors.textSecondary, fontSize: 14 },
  setTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  setTypeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});