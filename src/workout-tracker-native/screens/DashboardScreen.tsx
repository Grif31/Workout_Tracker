import React, { JSX, useEffect, useState } from 'react';
import { View, Text, Button, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlatList } from 'react-native-gesture-handler';

type User = {
    id: number
    username: string
    email: string
};
type Workout = {
  id: number
  name: string
  notes: string
  date: Date
  exercises: Exercise[]
};

type Exercise = {
  id: number
  name: string
  sets: Set[]
};
type Set = {
  id: number
  reps: number
  weight: GLfloat
}

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: Props): JSX.Element {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [user, setUser] = useState<User>()
  
  useEffect( () => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={{ marginRight: 15, color: 'blue', fontWeight: 'bold' }}>Profile</Text>
        </TouchableOpacity>
      )
    });
    fetchUser();
    fetchRecentWorkouts();
  }, [])

  const fetchUser = async () =>{
    const token = await AsyncStorage.getItem('token');
    const res = await fetch('http://192.168.1.24:5000/api/me',{
      headers: {'Authorization': `Bearer ${token}`},
    });
    const data = await res.json();
    setUser(data);
  };
  const fetchRecentWorkouts = async () => {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch('http://192.168.1.24:5000/api/workouts/recent',{
      headers: {'Authorization': `Bearer ${token}`},
    });
    const data = await res.json();
    setWorkouts(data);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.username}</Text>

      <Button title="Log Workout" onPress={() => navigation.navigate('WorkoutLog')} />
      <Text>Recent Workouts</Text>
      <FlatList data={workouts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({item}) => ( <TouchableOpacity
            style={styles.workoutCard}
            onPress={() => navigation.navigate('WorkoutDetails', { workout_id: item.id })}
          >
            <Text style={styles.workoutName}>{item.name}</Text>
            <Text>{new Date(item.date).toLocaleDateString()}</Text>
            <Text numberOfLines={1}>{item.notes}</Text>
          </TouchableOpacity>
        )}

      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  workoutCard: { marginBottom: 15, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 5 },
  workoutName: { fontSize: 16, fontWeight: 'bold' }
});

