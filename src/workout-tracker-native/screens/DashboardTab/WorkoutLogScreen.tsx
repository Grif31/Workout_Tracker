import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import WorkoutLog from '../../components/WorkoutLog';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutLog'>;

export default function WorkoutLogScreen({ route, navigation }: Props) {
  return (
    <WorkoutLog
      prefill={route.params?.prefill}
      editMode={route.params?.editMode}
      workoutId={route.params?.workoutId}
      onSubmit={(newId) => {
        if (!route.params?.editMode && newId) {
          navigation.replace('WorkoutDetails', { workoutId: newId });
        } else {
          navigation.goBack();
        }
      }}
      onCancel={() => navigation.goBack()}
      onViewExerciseHistory={(exerciseName, exerciseTemplateId) => {
        navigation.navigate('ExerciseDetail', {
          exerciseId: exerciseTemplateId ?? 0,
          exerciseName,
        });
      }}
    />
  );
}
