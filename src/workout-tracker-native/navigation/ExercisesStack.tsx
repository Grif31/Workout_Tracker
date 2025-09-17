import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExercisesStackParamsList } from './types';
import ExercisesScreen from '../screens/ExercisesTab/ExercisesScreen';
import CreateRoutineScreen from '../screens/ExercisesTab/CreateRoutineScreen';

const Stack = createNativeStackNavigator<ExercisesStackParamsList>();

export function ExercisesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ExercisesHome" component={ExercisesScreen} options={{ title: 'Exercises' }} />
      <Stack.Screen name="CreateRoutine" component={CreateRoutineScreen} options={{ title: 'Create Routine' }} />
    </Stack.Navigator>
  );
}
