import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import WorkoutDetails from '../../components/WorkoutDetails';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutDetails'>;

export default function WorkoutDetailScreen({ route, navigation }: Props) {
  return (
    <WorkoutDetails
      workoutId={route.params.workoutId}
      onBack={() => navigation.goBack()}
      onEdit={(prefill) => navigation.navigate('WorkoutLog', { prefill, workoutId: route.params.workoutId, editMode: true })}
      onDelete={() => navigation.goBack()}
      onPerformAgain={(prefill) => navigation.navigate('WorkoutLog', { prefill, editMode: false })}
      onSaveAsTemplate={() => {}}
    />
  );
}
