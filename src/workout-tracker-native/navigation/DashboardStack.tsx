import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardStackParamsList } from './types';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';
import WorkoutDetailScreen from '../screens/DashboardTab/WorkoutDetailsScreen';
import LogWorkoutScreen from '../screens/DashboardTab/WorkoutLogScreen';

const Stack = createNativeStackNavigator<DashboardStackParamsList>();

export function DashboardStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="WorkoutDetails" component={WorkoutDetailScreen} options={{ title: 'Workout Detail' }} />
      <Stack.Screen name="WorkoutLog" component={LogWorkoutScreen} options={{ title: 'Log Workout' }} />
    </Stack.Navigator>
  );
}
