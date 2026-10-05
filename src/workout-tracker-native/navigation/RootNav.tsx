import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ActivityIndicator } from 'react-native';
import { needsOnboarding as checkNeedsOnboarding } from '../utils/onboarding';
import { AppTabs } from './AppTabs';
import { AuthStackScreen } from './AuthStack';
import { WorkoutSessionProvider } from '../context/WorkoutSessionContext';
import { navigationRef } from './navigationRef';
import { OnboardingStackParamsList, RootStackParamsList } from './types';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import OnboardingAboutYouScreen from '../screens/Auth/OnboardingAboutYouScreen';
import PaywallScreen from '../screens/PaywallScreen';
import PreloadScreen from '../screens/PreloadScreen';
import SplashView from '../components/SplashView';
import { appCache } from '../utils/appCache';

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamsList>();
const RootStack = createNativeStackNavigator<RootStackParamsList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { colors, mode } = useTheme();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [preloaded, setPreloaded] = useState(false);
  const prevUserId = useRef<number | null>(null);

  // Reset preload whenever a different user logs in
  useEffect(() => {
    if (user?.id !== prevUserId.current) {
      prevUserId.current = user?.id ?? null;
      // Also on logout, so the next account starts from the preload rather
      // than a render with the last account's preloaded flag still set
      setPreloaded(false);
      if (!user) appCache.clear();
    }
  }, [user?.id]);

  // Decided after the preload, which fetches recent workouts: an account
  // that has logged some skips onboarding (utils/onboarding.ts)
  useEffect(() => {
    if (!user) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }
    if (!preloaded) {
      setOnboardingChecked(false);
      return;
    }
    let cancelled = false;
    checkNeedsOnboarding(user.id, appCache.get('recent_workouts')).then(needs => {
      if (cancelled) return;
      setNeedsOnboarding(needs);
      setOnboardingChecked(true);
    });
    return () => { cancelled = true; };
  }, [user?.id, preloaded]);

  const handleOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  if (loading) {
    // Same look as the native splash so launch reads as one continuous screen
    return (
      <SplashView>
        <ActivityIndicator color="#fff" />
      </SplashView>
    );
  }

  const navTheme = {
    dark: mode === 'dark',
    colors: {
      primary:      colors.accent,
      background:   colors.background,
      card:         colors.surface,
      text:         colors.textPrimary,
      border:       colors.border,
      notification: colors.accent,
    },
    fonts: { regular: { fontFamily: 'System', fontWeight: '400' as const }, medium: { fontFamily: 'System', fontWeight: '500' as const }, bold: { fontFamily: 'System', fontWeight: '700' as const }, heavy: { fontFamily: 'System', fontWeight: '800' as const } },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <WorkoutSessionProvider>
        {!user ? (
          <AuthStackScreen />
        ) : !preloaded ? (
          <PreloadScreen onComplete={() => setPreloaded(true)} />
        ) : !onboardingChecked ? (
          <SplashView>
            <ActivityIndicator color="#fff" />
          </SplashView>
        ) : needsOnboarding ? (
          <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
            <OnboardingStack.Screen name="OnboardingAboutYou" component={OnboardingAboutYouScreen} />
            <OnboardingStack.Screen
              name="Onboarding"
              children={(props) => (
                <OnboardingScreen {...props} onComplete={handleOnboardingComplete} />
              )}
            />
          </OnboardingStack.Navigator>
        ) : (
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="AppTabs" component={AppTabs} />
            <RootStack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
          </RootStack.Navigator>
        )}
      </WorkoutSessionProvider>
    </NavigationContainer>
  );
}
