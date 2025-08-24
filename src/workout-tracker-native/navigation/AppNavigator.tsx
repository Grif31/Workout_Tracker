import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WorkoutLogScreen from '../screens/WorkoutLogScreen';
import SignupScreen from '../screens/SignupScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkoutDetailsScreen from '../screens/WorkoutDetailsScreen';

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Profile: undefined;
  Dashboard: undefined;
  WorkoutDetails: {workout_id: number};
  WorkoutLog: undefined;
};

const stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator(){
    return (
        <NavigationContainer>
            <stack.Navigator id={undefined} initialRouteName="Login" >
                <stack.Screen name="Login" component={LoginScreen}/>
                <stack.Screen name="Signup" component={SignupScreen}/>
                <stack.Screen name="Profile" component={ProfileScreen}/>
                <stack.Screen name="Dashboard" component={DashboardScreen}/>
                <stack.Screen name="WorkoutDetails" component={WorkoutDetailsScreen} />
                <stack.Screen name="WorkoutLog" component={WorkoutLogScreen}/>
            </stack.Navigator>
        </NavigationContainer>
    );
}
