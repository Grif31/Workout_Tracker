import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamsList } from './types';
import WelcomeScreen from '../screens/Auth/WelcomeScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import ForgotPasswordScreen from '../screens/Auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/Auth/ResetPasswordScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamsList>();

export function AuthStackScreen() {
  return (
    <AuthStack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome"        component={WelcomeScreen} />
      <AuthStack.Screen name="Login"          component={LoginScreen} />
      <AuthStack.Screen name="Signup"         component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword"  component={ResetPasswordScreen} />
    </AuthStack.Navigator>
  );
}
