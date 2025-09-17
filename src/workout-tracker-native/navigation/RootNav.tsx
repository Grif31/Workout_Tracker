import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import {AppTabs} from './AppTabs'
import {AuthStackScreen} from './AuthStack'



const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, loading } = useAuth(); // null if not logged in

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
        {user ? <AppTabs /> : <AuthStackScreen />}
    </NavigationContainer>
  );
}
