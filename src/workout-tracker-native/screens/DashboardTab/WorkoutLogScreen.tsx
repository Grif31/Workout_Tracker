import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Set} from '../../types/models'
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import ExerciseListModal from '../../components/ExerciseList';
import NewExerciseForm from '../../components/NewExerciseForm';
import { DashboardStackParamsList } from 'navigation/types';

type ExerciseEntry = {name: string, sets: Set[]}
type Props =  NativeStackScreenProps<DashboardStackParamsList, 'WorkoutLog'>;

const muscleGroups = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core','Other']

export default function WorkoutLogScreen({navigation}: Props) {
  const [workoutName, setWorkoutName] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])

  const [exerciseList, setExerciseList] = useState<{id: number, name: string, muscle_group: string}[]>([])

  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);
  
  const  API_URL = process.env.EXPO_PUBLIC_API_URL;
  

  //Updates each time it loads 
  useEffect(() => { fetchExercises(); }, []);
  // Updates master list of exercises
  const fetchExercises = async () => {
    try{
      const res = await fetch(`${API_URL}/api/exercises`);
      const data = await res.json();
      setExerciseList(data);

    }catch(err){
      console.error(err)
    }
  }
  //add a new Exercises to master list
  const addNewExercise = async (name: string, muscle: string) => {
    if (!name.trim()) return;
    try { 
      const res = await fetch(`${API_URL}/api/exercises`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, muscle_group: muscle})
      })
      const data = await res.json();
      if (res.ok){
        fetchExercises();
        Alert.alert('Success', 'New Exercise Added')
      }else{
        Alert.alert('Error', data.message || 'Please try again')
      }
    } catch(err){
      Alert.alert('Error', 'Something went wrong')
    }
  }

  // Updates the reps and weight for current set
  const updateSetField = (exerciseIndex: number, setIndex: number, field: keyof Set, value: string) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets[setIndex][field] = value;
    setExercises(updated);
  };
  // adds a new blank set to exercise
  const addSetToExercise = (exerciseIndex: number) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets.push({ reps: '', weight: '' });
    setExercises(updated);
  };
  
  const deleteSet = (exerciseIndex: number, setIndex: number) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets.splice(setIndex, 1);
    setExercises(updated);
  };

  const deleteEx = (exIndex: number) => {
    const updated = [...exercises];
    updated.splice(exIndex, 1);
    setExercises(updated);
  };

  const renderDeleteAction = (onDelete: () => void) => (
  <TouchableOpacity
    style={{
      backgroundColor: 'red',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.sm,
    }}
    onPress={onDelete}
  >
    <Text style={{ color: 'white', fontWeight: 'bold' }}>Delete</Text>
  </TouchableOpacity>
);

  //Saves exercise to the current workout
  const addExToWorkout = (exerciseName: string) => {
    setExercises(prev => [
      ...prev,
      { name: exerciseName, sets: [{ reps: '', weight: '' }] }
    ]);
    setExerciseModalVisible(false);
  };



  // submits workout 
  const submitWorkout = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch('http://192.168.68.51:5000/api/workouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({name:workoutName, notes:notes, exercises:exercises})
      });
      const data = await res.json();
      console.log('Status:', res.status, 'Body:', data);
      if(res.ok){
        Alert.alert('Success', 'Workout Logged')
        navigation.navigate('DashboardHome')
      }else{
        Alert.alert('Error', data.message || 'Please try again')
      }
    }catch(err){
      Alert.alert('Error', 'Something went wrong')
    }
  }
  
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0} 
    >
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Log Workout</Text>
      <TextInput
        style={styles.input}
        placeholder="Workout Name"
        value={workoutName}
        onChangeText={setWorkoutName}
      />
      <TextInput
        style={styles.input}
        placeholder="Notes"
        value={notes}
        onChangeText={setNotes}
      />
      <Button title='Add Exercise' onPress={() => (setExerciseModalVisible(true))} />
      <ExerciseListModal
        visible={exerciseModalVisible}
        onClose={() => setExerciseModalVisible(false)}
        exercises={exerciseList}
        onSelect={(name) => {
          addExToWorkout(name);
          setExerciseModalVisible(false);
        }}
        onAddExercise={(name, muscle) => {
          addNewExercise(name, muscle);
          setNewExerciseFormVisible(false);
        }}
        muscleGroups={muscleGroups}
      />

      <NewExerciseForm
        visible={newExerciseFormVisible}
        onClose={() => setNewExerciseFormVisible(false)}
        onSave={(name, muscle) => {
          addNewExercise(name, muscle);
          setNewExerciseFormVisible(false);
        }}
        muscleGroups={muscleGroups}
      />

      <Text style={styles.subtitle}>Exercises</Text>
      {exercises.map((exercise, exIndex) => (
         
        <Swipeable
          key={exIndex}
          renderRightActions={() => renderDeleteAction(() => deleteEx(exIndex))}
        >
          <View key={exIndex} style={styles.exerciseBlock}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.sets.map((set, setIndex) => (
            <View key={setIndex} style={styles.setRow}>
              <Text>Set {setIndex + 1}:</Text>
              <TextInput
                style={styles.setInput}
                placeholder="Reps"
                keyboardType="numeric"
                value={set.reps}
                onChangeText={(val) => updateSetField(exIndex, setIndex, 'reps', val)}
              />
              <Text>x</Text>
              <TextInput
                style={styles.setInput}
                placeholder="Weight"
                keyboardType="numeric"
                value={set.weight}
                onChangeText={(val) => updateSetField(exIndex, setIndex, 'weight', val)}
              /><Text>lbs</Text>
              <TouchableOpacity onPress={() => deleteSet(exIndex, setIndex)}>
                <Text style={{ color: 'red', marginLeft: 10 }}>❌</Text>
              </TouchableOpacity>
            </View>
            
          ))}
          
          <Button title="Add Set" onPress={() => addSetToExercise(exIndex)} />
        
        </View>
        </Swipeable>
      ))}

      <Button title="Save Workout" onPress={submitWorkout} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}



const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  title: { fontSize: typography.fontSize.lg, fontWeight: 'bold', marginBottom: spacing.lg },
  subtitle: { fontSize: typography.fontSize.md, fontWeight: 'bold', marginTop: spacing.md, marginBottom: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, borderRadius: spacing.sm, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: typography.fontSize.md, },
  exerciseButton: { padding: spacing.md, backgroundColor: colors.surface, marginBottom: spacing.sm, borderRadius: spacing.sm },
  exerciseBlock: { marginBottom: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: spacing.sm, borderColor: colors.border},
  exerciseName: { fontWeight: 'bold', fontSize: typography.fontSize.md, marginBottom: spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  setInput: { borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginHorizontal: spacing.sm, width: 60, borderRadius: spacing.sm, marginBottom: spacing.sm },
  



});
