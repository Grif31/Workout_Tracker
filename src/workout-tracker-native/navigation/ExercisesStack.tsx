import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExercisesStackParamsList } from './types';
import ExercisesScreen from '../screens/ExercisesTab/ExercisesScreen';
import CreateRoutineScreen from '../screens/ExercisesTab/CreateRoutineScreen';
import RoutineDetailScreen from '../screens/ExercisesTab/RoutineDetailScreen';
import LogRoutineScreen from '../screens/ExercisesTab/LogRoutineScreen';

const Stack = createNativeStackNavigator<ExercisesStackParamsList>();

export function ExercisesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ExercisesHome" component={ExercisesScreen} options={{ title: 'Exercises' }} />
      <Stack.Screen name="CreateRoutine" component={CreateRoutineScreen} options={{ title: 'Create Routine' }} />
      <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} options={{ title: 'Routine' }} />
      <Stack.Screen name="LogRoutine" component={LogRoutineScreen} options={{ title: 'Log Workout' }} />
    </Stack.Navigator>
  );
}
