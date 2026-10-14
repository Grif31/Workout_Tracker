import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from '../../navigation/types';
import WorkoutLog from '../../components/WorkoutLog';
import { useGpsRun } from '../../context/GpsRunContext';
import { navigationRef } from '../../navigation/navigationRef';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'WorkoutLog'>;

export default function WorkoutLogScreen({ route, navigation }: Props) {
  // The app has one session at a time: a new workout can't start over a GPS run
  // that is running or minimized. Every way into a new workout comes through here.
  const { trackingState } = useGpsRun();
  const blockedByRun = !route.params?.editMode && trackingState !== 'idle';
  useEffect(() => {
    if (!blockedByRun) return;
    Alert.alert(
      'Activity in progress',
      'Finish or discard your tracked activity before logging a workout.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: 'Go to Activity',
          onPress: () => {
            navigation.goBack();
            navigationRef.navigate('DashboardTab', { screen: 'GPSCardio', initial: false });
          },
        },
      ],
      { cancelable: false },
    );
  }, []);
  if (blockedByRun) return null;

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
            isBestVolume: summary.isBestVolume,
            isBestReps: summary.isBestReps,
          });
        } else {
          navigation.goBack();
        }
      }}
      onCancel={() => navigation.goBack()}
      onViewExerciseHistory={(exerciseName, exerciseTemplateId, meta) => {
        navigation.navigate('ExerciseDetail', {
          exerciseId: exerciseTemplateId ?? 0,
          exerciseName,
          muscleGroup: meta?.muscleGroup,
          equipment: meta?.equipment,
          imageUrl: meta?.imageUrl,
        });
      }}
    />
  );
}
