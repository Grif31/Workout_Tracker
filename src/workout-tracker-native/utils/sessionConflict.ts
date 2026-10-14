import { Alert } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';

// The app has one session at a time, a lifting workout or a tracked activity.
// Starting one while the other is open or minimized is refused with one of these,
// from the buttons that start it and again from the screens behind them, so
// every way in says the same thing.

type Options = {
  /** Runs before heading to the other session, e.g. leaving the screen that was just opened */
  beforeGo?: () => void;
  onCancel?: () => void;
  cancelable?: boolean;
};

export function alertWorkoutInProgress({ beforeGo, onCancel }: Options = {}) {
  Alert.alert(
    'Workout in progress',
    'Finish or discard your workout before tracking an activity.',
    [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      {
        text: 'Go to Workout',
        onPress: () => {
          beforeGo?.();
          navigationRef.navigate('DashboardTab', { screen: 'WorkoutLog', params: {}, initial: false });
        },
      },
    ],
  );
}

export function alertActivityInProgress({ beforeGo, onCancel, cancelable = true }: Options = {}) {
  Alert.alert(
    'Activity in progress',
    'Finish or discard your tracked activity before logging a workout.',
    [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      {
        text: 'Go to Activity',
        onPress: () => {
          beforeGo?.();
          navigationRef.navigate('DashboardTab', { screen: 'GPSCardio', initial: false });
        },
      },
    ],
    { cancelable },
  );
}
