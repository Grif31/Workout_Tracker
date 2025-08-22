import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList } from 'react-native';
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
  const [reps, setReps] = useState(0)
  const [weight, setWeight] = useState(0.0)

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
    setCurrentSets([...currentSets, {reps: reps, weight: weight}]);
    setReps(0);
    setWeight(0.0);
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
        body: JSON.stringify({userid: 1,workoutName, notes, exercises})
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
    <View style={styles.container}>
      <Text style={styles.title}>Workout Log Screen</Text>
      <TextInput style={styles.input} placeholder='Workout Name' value={workoutName} onChangeText={setWorkoutName}/>
      <TextInput style={styles.input} placeholder='Notes' value={notes} onChangeText={setNotes}/>

      <Text style={styles.subtitle}>Select Exercise</Text>
      <Picker selectedValue={selectedExercise} onValueChange={(val) => setSelectedExercise(val)}>
        {exerciseList.map((ex) => (<Picker.Item key={ex.id} label={ex.name} value={ex.name}/>))}
      </Picker>
      <Text style={styles.subtitle}>Add Set for {selectedExercise}</Text>
      <Text style={styles.input} placeholder='Reps' value={reps}/>
      <TextInput style={styles.input} placeholder='Sets' value={sets}/>

    </View>
  );
}
const styles =StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, width: 1, borderColor: '#ccc', padding: 10 },
  input: { borderWidth: 10, marginBottom: 10, borderRadius: 5 }
});

