import  { StatusBar }  from 'expo-status-bar';
import React, { JSX } from 'react';
import AppNavigator from './navigation/AppNavigator';
import  { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App(): JSX.Element {
  return (
      <GestureHandlerRootView style={{ flex: 1 }}>

      <AppNavigator />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
