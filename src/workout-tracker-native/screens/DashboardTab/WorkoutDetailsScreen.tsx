import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout } from '../../types/models';
import { DashboardStackParamsList } from '../../navigation/types';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
const  API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutDetails'>;

export default function WorkoutDetailsScreen({ route, navigation }: Props){
  const { workoutId } = route.params;
  const [workout, setWorkout] = useState<Workout>();

  useEffect(() => {
    fetchWorkout();
  }, []);

  const fetchWorkout = async () => {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/workouts/${workoutId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setWorkout(data);
  };

  if (!workout) return <Text>Loading...</Text>;
  if(workout.exercises)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{workout.name}</Text>
      <Text>{new Date(workout.date).toLocaleDateString()}</Text>
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