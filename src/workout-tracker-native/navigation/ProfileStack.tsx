import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from './types';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';
import EditProfileScreen from '../screens/ProfileTab/EditProfileScreen';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';

const Stack = createNativeStackNavigator<ProfileStackParamsList>();

export function ProfileStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change Password' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}
