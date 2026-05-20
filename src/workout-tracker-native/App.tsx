import  { StatusBar }  from 'expo-status-bar';
import React, { JSX, useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { setUpLiveWorkoutCategory } from './utils/notifications';
import { flushQueue, initPendingCount } from './utils/offlineQueue';
import { showToast } from './utils/toast';
import  RootNav  from '../workout-tracker-native/navigation/RootNav'
import { AuthProvider } from 'context/AuthContext';
import { ThemeProvider } from 'context/ThemeContext';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastBanner } from './components/ToastBanner';
import { navigationRef } from './navigation/navigationRef';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App(): JSX.Element {
  useEffect(() => {
    initPendingCount();
    const netUnsub = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        const synced = await flushQueue();
        if (synced > 0) showToast(`${synced} workout${synced > 1 ? 's' : ''} synced`);
      }
    });
    return () => netUnsub();
  }, []);

  useEffect(() => {
    setUpLiveWorkoutCategory();
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      const isLiveWorkout = data?.type === 'live_workout';
      const isResumeAction = response.actionIdentifier === 'resume_workout';
      if ((isLiveWorkout || isResumeAction) && navigationRef.isReady()) {
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

