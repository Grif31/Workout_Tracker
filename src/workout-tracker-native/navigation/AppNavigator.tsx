import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WorkoutLogScreen from '../screens/WorkoutLogScreen';
import SignupScreen from '../screens/SignupScreen';

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Dashboard: undefined;
  WorkoutLog: undefined;
};

const stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator(){
    return (
        <NavigationContainer>
            <stack.Navigator id={undefined} initialRouteName="Login" >
                <stack.Screen name="Login" component={LoginScreen}/>
                <stack.Screen name="Signup" component={SignupScreen}/>
                <stack.Screen name="Dashboard" component={DashboardScreen}/>
                <stack.Screen name="WorkoutLog" component={WorkoutLogScreen}/>
            </stack.Navigator>
        </NavigationContainer>
    );
}
