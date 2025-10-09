import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from './types';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';
import EditProfileScreen from '../screens/ProfileTab/EditProfileScreen';
import EditWorkoutScreen from '../screens/ProfileTab/EditWorkoutScreen';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';
import WorkoutDetails from '../screens/ProfileTab/WorkoutDetails'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from 'context/AuthContext';

const Stack = createNativeStackNavigator<ProfileStackParamsList>();

export function ProfileStack() {
    const {user} = useAuth()


  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: user?.username }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change Password' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="WorkoutDetails" component={WorkoutDetails} options={{title: 'Workout Details' }}/>
      <Stack.Screen name="EditWorkout" component={EditWorkoutScreen} options={{title: 'Edit Workout' }}/>
    </Stack.Navigator>
  );
}
