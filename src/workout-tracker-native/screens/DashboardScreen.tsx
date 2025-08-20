import React, { JSX } from 'react';
import { View, Text, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: Props): JSX.Element {
    return (
    <View>
      <Text>Dashboard</Text>
      <Button title="Log Workout" onPress={() => navigation.navigate('WorkoutLog')} />
    </View>
  );
}
