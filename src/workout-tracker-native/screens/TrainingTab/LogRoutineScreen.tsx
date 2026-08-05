import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TrainingStackParamsList } from '../../navigation/types';
import WorkoutLog from '../../components/WorkoutLog';

type Props = NativeStackScreenProps<TrainingStackParamsList, 'LogRoutine'>;

export default function LogRoutineScreen({ route, navigation }: Props) {
  return (
    <WorkoutLog
      prefill={route.params?.prefill}
      editMode={route.params?.editMode}
      workoutId={route.params?.workoutId}
      onSubmit={(newId, summary) => {
        if (!route.params?.editMode && newId && summary) {
          navigation.replace('WorkoutSummary', {
            workoutId: newId,
            workoutName: summary.workoutName,
            prs: summary.prs,
            totalVolume: summary.totalVolume,
            totalReps: summary.totalReps,
            totalSets: summary.totalSets,
            muscles: summary.muscles,
            isFirstWorkout: summary.isFirstWorkout,
          });
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
