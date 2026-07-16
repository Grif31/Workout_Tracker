import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import WorkoutDetails from '../../components/WorkoutDetails';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'WorkoutDetails'>;

export default function WorkoutDetailScreen({ route, navigation }: Props) {
  return (
    <WorkoutDetails
      workoutId={route.params.workoutId}
      onBack={() => navigation.goBack()}
      onEdit={(prefill) => navigation.navigate('EditWorkout', { prefill, editMode: true })}
      onDelete={() => navigation.goBack()}
      onPerformAgain={(prefill) => navigation.navigate('EditWorkout', { prefill, editMode: false })}
      onSaveAsTemplate={() => {}}
    />
  );;
}
