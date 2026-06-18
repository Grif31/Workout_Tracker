import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrainingStackParamsList } from './types';
import CoachScreen from '../screens/TrainingTab/CoachScreen';
import CreateRoutineScreen from '../screens/ExercisesTab/CreateRoutineScreen';
import RoutineDetailScreen from '../screens/ExercisesTab/RoutineDetailScreen';
import TemplateDetailScreen from '../screens/ExercisesTab/TemplateDetailScreen';
import LogRoutineScreen from '../screens/ExercisesTab/LogRoutineScreen';
import WorkoutDetailScreen from '../screens/DashboardTab/WorkoutDetailsScreen';
import WorkoutSummaryScreen from '../screens/DashboardTab/WorkoutSummaryScreen';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';
import StrengthScoreScreen from '../screens/TrainingTab/StrengthScoreScreen';
import AIWorkoutPreviewScreen from '../screens/TrainingTab/AIWorkoutPreviewScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<TrainingStackParamsList>();

export function TrainingStack() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top, backgroundColor: colors.background } }}>
      <Stack.Screen name="TrainingHome" component={CoachScreen} />
      <Stack.Screen name="CreateRoutine" component={CreateRoutineScreen} />
      <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} />
      <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} />
      <Stack.Screen name="LogRoutine" component={LogRoutineScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="WorkoutDetails" component={WorkoutDetailScreen} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ contentStyle: { paddingTop: 0 } }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ presentation: 'modal', contentStyle: { paddingTop: 0 } }} />
      <Stack.Screen name="StrengthScore" component={StrengthScoreScreen} />
      <Stack.Screen name="AIWorkoutPreview" component={AIWorkoutPreviewScreen} />
    </Stack.Navigator>
  );
}
