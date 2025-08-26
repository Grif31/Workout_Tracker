import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Exercise, Set} from '../types/models'
import Swipeable from 'react-native-gesture-handler/Swipeable';


type ExerciseEntry = {name: string, sets: Set[]}
type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutLog'>;

const muscleGroups = ['All', 'Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core','Other']

export default function WorkoutLogScreen({navigation}: Props) {
  const [workoutName, setWorkoutName] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])

  const [exerciseList, setExerciseList] = useState<{id: number, name: string, muscle_group: string}[]>([])
  const [newExercise, setNewExercise] = useState('')
  const [newExMuscle, setNewExMuscle] = useState('')
  
  const [currentSets, setCurrentSets] = useState<Set[]>([]);
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState('All')

  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);

  useEffect(() => {
    fetchExercises();
  }, []);
// Updates master list of exercises
  const fetchExercises = async () => {
    try{
      const res = await fetch('http://192.168.1.24:5000/api/exercises');
      const data = await res.json();
      setExerciseList(data);

    }catch(err){
      console.error(err)
    }
  }
  //add a new Exercises to master list
  const addNewExercise = async () => {
    if (!newExercise.trim()) return;
    try { 
      const res = await fetch('http://192.168.1.24:5000/api/exercises', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: newExercise, muscle_group: newExMuscle})
      })
      const data = await res.json();
      if (res.ok){
        setNewExercise('');
        setNewExMuscle('')
        fetchExercises();
        Alert.alert('Success', 'New Exercise Added')
      }else{
        Alert.alert('Error', data.message || 'Please try again')
      }
    } catch(err){
      Alert.alert('Error', 'Something went wrong')
    }
  }

  // Add set to current exercise
  const updateSetField = (exerciseIndex: number, setIndex: number, field: keyof Set, value: string) => {
    const updated = [...exercises];
    updated[exerciseIndex].sets[setIndex][field] = value;
    setExercises(updated);
  };
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
      paddingHorizontal: 20,
      borderRadius: 5
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
  const filteredEx = exerciseList.filter(ex => {
    const searchMatch = ex.name.toLowerCase().includes(searchQuery.toLowerCase())
    const muscleMatch = selectedMuscle === 'All' || ex.muscle_group === selectedMuscle 
    return searchMatch && muscleMatch;
  });

  // submits workout 
  const submitWorkout = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch('http://192.168.1.24:5000/api/workouts', {
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
        navigation.navigate('Dashboard')
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
      <Modal visible={exerciseModalVisible} animationType='fade'>
        <View style={styles.modal}>
          <Text style={styles.subtitle}>Select Exercise</Text>
          <TextInput style={styles.input} placeholder='search for exercise' value={searchQuery} onChangeText={setSearchQuery}/>
          <View style={styles.muscleFilter}>
            {muscleGroups.map(muscle => (
              <TouchableOpacity key={muscle} style={[
                  styles.muscleButton,
                  selectedMuscle === muscle && styles.muscleButtonSelected
                ]} onPress={() => setSelectedMuscle(muscle)}>
                <Text>{muscle}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList data={filteredEx} keyExtractor={(ex) => ex.id.toString()}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.exerciseButton} onPress={() => addExToWorkout(item.name)}>
                <Text>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <Text style={styles.subtitle}>Add New Exercise</Text>
          <TextInput
            style={styles.input}
            placeholder="Exercise Name"
            value={newExercise}
            onChangeText={setNewExercise}
          />
          <TextInput
            style={styles.input}
            placeholder="Muscle Group"
            value={newExMuscle}
            onChangeText={setNewExMuscle}
          />
          <Button title="Save Exercise" onPress={addNewExercise} />

          <Button title="Close" onPress={() => setExerciseModalVisible(false)} />
        </View>
      </Modal>
      <Text style={styles.subtitle}>Exercises</Text>
      {exercises.map((exercise, exIndex) => (
        

        <View key={exIndex} style={styles.exerciseBlock}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {exercise.sets.map((set, setIndex) => (
            <Swipeable
              key={setIndex}
              renderRightActions={() => renderDeleteAction(() => deleteSet(exIndex, setIndex))}
            >
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
            </Swipeable>
          ))}
          <Button title="Add Set" onPress={() => addSetToExercise(exIndex)} />
        </View>
      ))}

      <Button title="Save Workout" onPress={submitWorkout} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 5, color:'#353434ff' },
  exerciseButton: { padding: 10, backgroundColor: '#eee', marginBottom: 5, borderRadius: 5 },
  exerciseBlock: { marginBottom: 20, padding: 10, backgroundColor: '#f9f9f9', borderRadius: 5 },
  exerciseName: { fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  setInput: { borderWidth: 1, borderColor: '#ccc', padding: 5, marginHorizontal: 5, width: 60, borderRadius: 5, marginBottom: 5 },
  modal: { flex: 1, padding: 20 },
  muscleFilter: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  muscleButton: { padding: 8, backgroundColor: '#eee', borderRadius: 5, margin: 3 },
  muscleButtonSelected: { backgroundColor: '#cce5ff' },

});
