import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardStackParamsList } from './types';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';
import WorkoutDetailScreen from '../screens/DashboardTab/WorkoutDetailsScreen';
import LogWorkoutScreen from '../screens/DashboardTab/WorkoutLogScreen';
import GPSCardioScreen from '../screens/DashboardTab/GPSCardioScreen';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<DashboardStackParamsList>();

export function DashboardStack() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top, backgroundColor: colors.background } }}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} />
      <Stack.Screen name="WorkoutDetails" component={WorkoutDetailScreen} />
      <Stack.Screen name="WorkoutLog" component={LogWorkoutScreen} />
      <Stack.Screen name="GPSCardio" component={GPSCardioScreen} options={{ contentStyle: { paddingTop: 0 } }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen as any} options={{ presentation: 'modal', contentStyle: { paddingTop: 0 } }} />
    </Stack.Navigator>
  );
}
