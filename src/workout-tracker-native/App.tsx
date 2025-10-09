import  { StatusBar }  from 'expo-status-bar';
import React, { JSX } from 'react';
import  { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import  RootNav  from '../workout-tracker-native/navigation/RootNav'
import { AuthProvider } from 'context/AuthContext';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';

export default function App(): JSX.Element {
  return (
    <ActionSheetProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider><RootNav /></AuthProvider>
    </GestureHandlerRootView>
    </ActionSheetProvider>
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
