import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, FlatList, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Set} from '../types/models'
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import ExerciseListModal from '../components/ExerciseList';
import NewExerciseForm from '../components/NewExerciseForm';
import {PrefillWorkoutData} from './WorkoutDetails'
import { muscleGroups } from 'constants/muscleGroups';

type ExerciseEntry = {id?: string, name: string, sets: Set[]}
type Props =  {
    prefill?: PrefillWorkoutData 
    editMode?: boolean
    workoutId?: number
    onSubmit?: () => void
    onCancel?: () => void
};

export default function WorkoutLog({prefill, editMode, workoutId, onSubmit, onCancel }: Props) {
  const [workoutName, setWorkoutName] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [startTime, setStartTime] = useState<Date|null>(null)
  const [elapsed, setElapsed] = useState(0)


  const [exerciseList, setExerciseList] = useState<{id: number, name: string, muscle_group: string}[]>([])

  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [newExerciseFormVisible, setNewExerciseFormVisible] = useState(false);
  
  const  API_URL = process.env.EXPO_PUBLIC_API_URL;
  
  //Sets new Start Time 
  useEffect(() => {
    if (!editMode) {
     setStartTime(new Date()); // record the start time
    }
  }, [editMode]);

  useEffect(() => {
  if (startTime) {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000 / 60));
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }
}, [startTime]);


  //Updates each time it loads 
  useEffect(() => { fetchExercises();},[]);
  //Updates data if editing a workout 
  useEffect(() => { 
    if (prefill) {
      setWorkoutName(prefill.name);
      setNotes(prefill.notes);
      setExercises(
        prefill.exercises.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        sets: ex.sets.map((s: any) => ({
          id: s.id,
          reps: String(s.reps ?? ''),   
          weight: String(s.weight ?? '')
          }))
        }))
      );
    }else{
      setWorkoutName('');
      setNotes('');
      setExercises([])
    }
      
   }, [prefill]);

  // Updates master list of exercises
  const fetchExercises = async () => {
    try{
      const res = await fetch(`${API_URL}/api/exercises`);
      if (!res.ok) {
        Alert.alert('Error', 'Failed to load exercises');
        return;
      }
      const data = await res.json();
      setExerciseList(data);
    }catch(err){
      Alert.alert('Error', 'Failed to load exercises');
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

  // renders the slide to delete action
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
    const token = await AsyncStorage.getItem('token');
    if (!token) return;
    const endTime = new Date();
    let durationMin: number | undefined = undefined;
    if(startTime){
      const diffms = endTime.getTime() - startTime.getTime();
      durationMin = Math.floor(diffms / 1000 / 60);
    }

    const payload = {
        workoutName, 
        notes,
        date:  selectedDate.toISOString().split('T')[0],
        duration: durationMin,
        exercises: exercises.map((ex) => ({
          id: ex.id, 
          name: ex.name,
          sets: ex.sets.map((s) => ({
            id: s.id, 
            reps: Number(s.reps),
            weight: Number(s.weight),
          })),
        })),
      }
      const isEditing = Boolean(editMode && workoutId);
      const url = isEditing 
        ? `${API_URL}/api/workouts/${workoutId}`
        : `${API_URL}/api/workouts`;
      const method = isEditing ? 'PATCH' : 'POST';
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('Status:', res.status, 'Body:', data);
        if(!res.ok){
          Alert.alert('Error', data.message || 'Please try again')
        }
        if (onSubmit) {
          onSubmit();
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
      <TextInput style={styles.input} placeholder="Workout Name" value={workoutName} onChangeText={setWorkoutName}/>
      <TextInput style={styles.input} placeholder="Notes" value={notes} onChangeText={setNotes}/>
      <Text>Duration: {elapsed} min</Text>
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

      <Button title={editMode ? "Update Workout" : "Save Workout"} onPress={submitWorkout} />
      {onCancel && <Button title="Cancel" onPress={onCancel} />}
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
