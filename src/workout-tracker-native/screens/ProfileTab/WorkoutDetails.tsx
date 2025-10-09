import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import WorkoutDetails from '../../components/WorkoutDetails';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'WorkoutDetails'>;

export default function WorkoutDetailScreen({ route, navigation }: Props) {
  return <WorkoutDetails workoutId={route.params.workoutId} onEdit={(prefill) => navigation.navigate('EditWorkout', { prefill: prefill, editMode: true })}
  onPerformAgain={(prefill) => navigation.navigate('EditWorkout', { prefill: prefill, editMode: false })}/>;
}
