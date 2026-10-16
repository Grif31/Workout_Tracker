import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import { needsOnboarding as checkNeedsOnboarding } from '../utils/onboarding';
import { AppTabs } from './AppTabs';
import { AuthStackScreen } from './AuthStack';
import { WorkoutSessionProvider } from '../context/WorkoutSessionContext';
import { GpsRunProvider } from '../context/GpsRunContext';
import { navigationRef } from './navigationRef';
import { OnboardingStackParamsList, RootStackParamsList } from './types';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import OnboardingAboutYouScreen from '../screens/Auth/OnboardingAboutYouScreen';
import PaywallScreen from '../screens/PaywallScreen';
import PreloadScreen from '../screens/PreloadScreen';
import SplashView from '../components/SplashView';
import SplashExit from '../components/SplashExit';
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

  // Every splash phase (auth load, preload, onboarding check) reads as one
  // screen; the zoom out plays once, when the last of them gives way. A layout
  // effect, so the overlay is up before the first frame of what's underneath.
  const splashUp = loading || (!!user && (!preloaded || !onboardingChecked));
  const [splashExiting, setSplashExiting] = useState(false);
  const wasSplashUp = useRef(splashUp);
  useLayoutEffect(() => {
    if (wasSplashUp.current && !splashUp) setSplashExiting(true);
    wasSplashUp.current = splashUp;
  }, [splashUp]);
  const endSplashExit = useCallback(() => setSplashExiting(false), []);
  const splashExit = splashExiting && <SplashExit onDone={endSplashExit} />;

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
    <View style={{ flex: 1 }}>
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <WorkoutSessionProvider>
        <GpsRunProvider>
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
        </GpsRunProvider>
      </WorkoutSessionProvider>
    </NavigationContainer>
    {splashExit}
    </View>
  );
}
