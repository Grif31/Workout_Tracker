import  { StatusBar }  from 'expo-status-bar';
import React, { JSX, useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import  RootNav  from '../workout-tracker-native/navigation/RootNav'
import { AuthProvider } from 'context/AuthContext';
import { ThemeProvider } from 'context/ThemeContext';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastBanner } from './components/ToastBanner';
import { navigationRef } from './navigation/navigationRef';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App(): JSX.Element {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'live_workout' && navigationRef.isReady()) {
        (navigationRef as any).navigate('DashboardTab', { screen: 'WorkoutLog', params: {} });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ActionSheetProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <AuthProvider>
                <View style={{ flex: 1 }}>
                  <RootNav />
                  <ToastBanner />
                </View>
              </AuthProvider>
            </GestureHandlerRootView>
          </ActionSheetProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

