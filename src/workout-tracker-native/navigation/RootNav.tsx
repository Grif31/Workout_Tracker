import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTabs } from './AppTabs';
import { AuthStackScreen } from './AuthStack';
import { WorkoutSessionProvider } from '../context/WorkoutSessionContext';
import { navigationRef } from './navigationRef';
import { OnboardingStackParamsList } from './types';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import OnboardingTutorialScreen from '../screens/Auth/OnboardingTutorialScreen';

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamsList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (!user) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }
    AsyncStorage.getItem('onboarding_complete').then(val => {
      setNeedsOnboarding(val !== 'true');
      setOnboardingChecked(true);
    });
  }, [user]);

  const handleOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
  }, []);

  if (loading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <WorkoutSessionProvider>
        {!user ? (
          <AuthStackScreen />
        ) : needsOnboarding ? (
          <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
            <OnboardingStack.Screen name="Onboarding" component={OnboardingScreen} />
            <OnboardingStack.Screen
              name="OnboardingTutorial"
              children={(props) => (
                <OnboardingTutorialScreen {...props} onComplete={handleOnboardingComplete} />
              )}
            />
          </OnboardingStack.Navigator>
        ) : (
          <AppTabs />
        )}
      </WorkoutSessionProvider>
    </NavigationContainer>
  );
}
