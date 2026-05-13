import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExercisesStackParamsList } from './types';
import ExercisesScreen from '../screens/ExercisesTab/ExercisesScreen';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<ExercisesStackParamsList>();

export function ExercisesStack() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top, backgroundColor: colors.background } }}>
      <Stack.Screen name="ExercisesHome" component={ExercisesScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ presentation: 'modal', contentStyle: { paddingTop: 0 } }} />
    </Stack.Navigator>
  );
}
