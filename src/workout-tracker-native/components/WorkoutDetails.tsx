import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout } from '../types/models';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';


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
  const [workout, setWorkout] = useState<Workout>();
  const { showActionSheetWithOptions } = useActionSheet();


  useEffect(() => {
    fetchWorkout();
  }, []);

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
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setWorkout(data);
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
            { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(workoutId) },
    ]);
  };
  const deleteWorkout = async () => {
    const token = await AsyncStorage.getItem('token');
    await fetch(`${API_URL}/api/workouts/${workoutId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  };


  if (!workout) return <Text>Loading...</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{workout.name}</Text>
      <Text>{new Date(workout.date).toLocaleDateString()}</Text>
      <TouchableOpacity onPress={openMenu}>
            <Ionicons name='ellipsis-vertical' size={24} color='black'/>
        </TouchableOpacity>
      <Text style={{ marginBottom: 10 }}>{workout.notes}</Text>

      <FlatList
        data={workout.exercises}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.exerciseBlock}>
            <Text style={styles.exerciseName}>{item.name}</Text>
            {item.sets.map((s, i) => (
              <Text key={i}>Set {i + 1}: {s.reps} reps @ {s.weight}lbs</Text>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
  exerciseBlock: { marginBottom: 15 },
  exerciseName: { fontWeight: 'bold', fontSize: 16 }
});