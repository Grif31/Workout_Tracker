import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import WorkoutDetails from '../../components/WorkoutDetails';
import EditUnlockSheet from '../../components/achievements/EditUnlockSheet';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'WorkoutDetails'>;

export default function WorkoutDetailScreen({ route, navigation }: Props) {
  return (
    <>
      <WorkoutDetails
        workoutId={route.params.workoutId}
        onBack={() => navigation.goBack()}
        // Without the id WorkoutLog isn't editing: Save posted a second copy of the workout
        onEdit={(prefill) => navigation.navigate('EditWorkout', { prefill, workoutId: route.params.workoutId, editMode: true })}
        onDelete={() => navigation.goBack()}
        onPerformAgain={(prefill) => navigation.navigate('EditWorkout', { prefill, editMode: false })}
        onSaveAsTemplate={() => {}}
      />
      <EditUnlockSheet
        items={route.params.newAchievements}
        onTaken={() => navigation.setParams({ newAchievements: undefined })}
      />
    </>
  );
}
