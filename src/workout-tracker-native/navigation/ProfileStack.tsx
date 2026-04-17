import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileStackParamsList } from './types';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';
import EditProfileScreen from '../screens/ProfileTab/EditProfileScreen';
import EditWorkoutScreen from '../screens/ProfileTab/EditWorkoutScreen';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';
import WorkoutDetails from '../screens/ProfileTab/WorkoutDetails';
import BodyweightScreen from '../screens/ProfileTab/BodyweightScreen';
import { useAuth } from 'context/AuthContext';

const Stack = createNativeStackNavigator<ProfileStackParamsList>();

export function ProfileStack() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top } }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="WorkoutDetails" component={WorkoutDetails} />
      <Stack.Screen name="EditWorkout" component={EditWorkoutScreen} />
      <Stack.Screen name="BodyweightLog" component={BodyweightScreen} />
    </Stack.Navigator>
  );
}
