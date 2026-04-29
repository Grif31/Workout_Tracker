import  { StatusBar }  from 'expo-status-bar';
import React, { JSX } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import  RootNav  from '../workout-tracker-native/navigation/RootNav'
import { AuthProvider } from 'context/AuthContext';
import { ThemeProvider } from 'context/ThemeContext';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ActionSheetProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider><RootNav /></AuthProvider>
          </GestureHandlerRootView>
        </ActionSheetProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

