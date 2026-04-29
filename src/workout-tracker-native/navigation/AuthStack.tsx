import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamsList } from './types';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamsList>();

export function AuthStackScreen() {
  return (
    <AuthStack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome"        component={WelcomeScreen} />
      <AuthStack.Screen name="Login"          component={LoginScreen} />
      <AuthStack.Screen name="Signup"         component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}
