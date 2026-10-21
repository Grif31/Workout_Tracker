import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressStackParamsList } from './types';
import ProgressScreen from '../screens/ProgressTab/ProgressScreen';
import ExerciseDetailScreen from '../screens/ProgressTab/ExerciseDetailScreen';
import StrengthScoreScreen from '../screens/ProgressTab/StrengthScoreScreen';
import EnduranceScoreScreen from '../screens/ProgressTab/EnduranceScoreScreen';
import WeeklySummaryScreen from '../screens/DashboardTab/WeeklySummaryScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<ProgressStackParamsList>();

export function ProgressStack() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top, backgroundColor: colors.background } }}>
      <Stack.Screen name="ProgressHome" component={ProgressScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ presentation: 'modal', contentStyle: { paddingTop: 0 } }} />
      <Stack.Screen name="StrengthScore" component={StrengthScoreScreen} />
      <Stack.Screen name="EnduranceScore" component={EnduranceScoreScreen} />
      <Stack.Screen name="WeeklySummary" component={WeeklySummaryScreen} options={{ contentStyle: { paddingTop: 0 } }} />
    </Stack.Navigator>
  );
}
