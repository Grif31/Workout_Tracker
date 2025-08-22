import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type SetEntry = {reps: number, weight: number}
type ExerciseEntry = { name: string, sets: SetEntry[]}

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutLog'>;

export default function WorkoutLogScreen({navigation}: Props) {
  const [workoutName, setWorkoutName] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])

  const [exerciseList, setExerciseList] = useState<{id: number, name: string}[]>([])
  const [selectedExercise, setSelectedExercise] = useState('')
  const [newExercise, setNewExercise] = useState('')
  
  const [currentSets, setCurrentSets] = useState<SetEntry[]>([]);
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')

   const [exerciseModalVisible, setExerciseModalVisible] = useState(false);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try{
      const res = await fetch('http://192.168.1.24:5000/api/exercises');
      const data = await res.json();
      setExerciseList(data);

      if(data.length > 0 ) setSelectedExercise(data[0].name)

    }catch(err){
      console.error(err)
    }
  }

  const addNewExercise = async () => {
    if (!newExercise.trim()) return;
    try { 
      const res = await fetch('http://192.168.1.24:5000/api/exercises', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: newExercise})
      })
      const data = await res.json();
      if (res.ok){
        setNewExercise('');
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
  const addSet = () => {
    if (!reps || !weight) return;
    setCurrentSets([...currentSets, {reps: Number(reps), weight: Number(weight)}]);
    setReps('');
    setWeight('');
  }
  //Saves exercise to the current workout with all of its sets
  const saveExToWorkout = () => {
    if(!selectedExercise || currentSets.length === 0) return;
    setExercises([...exercises, {name: selectedExercise, sets: currentSets}])
    setSelectedExercise(exerciseList.length > 0 ? exerciseList[0].name : '');
    setCurrentSets([]);
  }
  // submits workout 
  const submitWorkout = async () => {
    try {
      const res = await fetch('http://192.168.1.24:5000/api/workouts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userid, workoutName, notes, exercises})
      });
      const data = await res.json();
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
     <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Log Workout</Text>
      <TextInput style={styles.input} placeholder="Workout Name" value={workoutName} onChangeText={setWorkoutName} />
      <TextInput style={styles.input} placeholder="Notes" value={notes} onChangeText={setNotes} />

      <Button title="Add Exercise" onPress={() => setExerciseModalVisible(true)} />

      <Text style={styles.subtitle}>Exercises in Workout</Text>
      <FlatList
        data={exercises}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.exerciseBlock}>
            <Text style={{ fontWeight: 'bold' }}>{item.name}</Text>
            {item.sets.map((s, i) => (
              <Text key={i}>Set {i + 1}: {s.reps} reps @ {s.weight}kg</Text>
            ))}
          </View>
        )}
      />

      <Button title="Save Workout" onPress={submitWorkout} />

      {/* Exercise Picker Modal */}
      <Modal visible={exerciseModalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <Text style={styles.subtitle}>Select Exercise</Text>
          <FlatList
            data={exerciseList}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.exerciseItem,
                  selectedExercise === item.name && styles.selectedExercise
                ]}
                onPress={() => setSelectedExercise(item.name)}
              >
                <Text>{item.name}</Text>
              </TouchableOpacity>
            )}
          />

          <Text style={styles.subtitle}>Add New Exercise</Text>
          <TextInput
            style={styles.input}
            placeholder="New Exercise Name"
            value={newExercise}
            onChangeText={setNewExercise}
          />
          <Button title="Add to List" onPress={addNewExercise} />

          {selectedExercise ? (
            <>
              <Text style={styles.subtitle}>Add Sets for {selectedExercise}</Text>
              <TextInput style={styles.input} placeholder="Reps" keyboardType="numeric" value={reps} onChangeText={setReps} />
              <TextInput style={styles.input} placeholder="Weight" keyboardType="numeric" value={weight} onChangeText={setWeight} />
              <Button title="Add Set" onPress={addSet} />

              <FlatList
                data={currentSets}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item, index }) => (
                  <Text>Set {index + 1}: {item.reps} reps @ {item.weight}kg</Text>
                )}
              />

              <Button title="Save Exercise to Workout" onPress={saveExToWorkout} />
            </>
          ) : null}

          <Button title="Close" onPress={() => setExerciseModalVisible(false)} />
        </View>
      </Modal>
    </ScrollView>
  );
}
const styles =StyleSheet.create({
  container: { flex: 1, padding: 5 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, width: 1, borderColor: '#181717ff', padding: 10 },
  input: { borderWidth: 1, marginBottom: 10, borderRadius: 5 },
  exerciseBlock: { marginBottom: 15 },
  modalContainer: { flex: 1, padding: 20 },
  exerciseItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  selectedExercise: { backgroundColor: '#e0e0e0' }
});

