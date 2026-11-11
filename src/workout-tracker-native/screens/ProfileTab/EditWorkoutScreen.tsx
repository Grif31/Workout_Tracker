import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import WorkoutLog from '../../components/WorkoutLog';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'EditWorkout'>;

export default function EditWorkoutScreen({ route, navigation }: Props) {
  return (
    <WorkoutLog
      prefill={route.params?.prefill}
      editMode={route.params?.editMode}
      workoutId={route.params?.workoutId}
      onSubmit={(workoutId, _summary, newAchievements) => {
        if (route.params?.editMode && workoutId && newAchievements?.length) {
          navigation.popTo('WorkoutDetails', { workoutId, newAchievements });
        } else {
          navigation.goBack();
        }
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}
