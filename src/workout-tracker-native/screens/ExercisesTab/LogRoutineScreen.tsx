import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ExercisesStackParamsList } from '../../navigation/types';
import WorkoutLog from '../../components/WorkoutLog';

type Props = NativeStackScreenProps<ExercisesStackParamsList, 'LogRoutine'>;


export default function WorkoutLogScreen({ route, navigation }: Props) {
  return (
    <WorkoutLog
      prefill={route.params?.prefill}
      editMode={route.params?.editMode}
      workoutId={route.params?.workoutId}
      onSubmit={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  );
}
