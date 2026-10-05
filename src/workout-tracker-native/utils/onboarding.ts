import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_COMPLETE_KEY } from '../constants/storageKeys';

const keyFor = (userId: number | string) => `${ONBOARDING_COMPLETE_KEY}_${userId}`;

export async function markOnboardingComplete(userId: number | string): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), 'true');
}

/**
 * Whether this account still needs onboarding on this phone. The flag is per
 * account: one shared device-wide flag let a second account skip onboarding
 * entirely. An account that has already logged workouts isn't new, so it
 * skips onboarding on a new phone too.
 */
export async function needsOnboarding(userId: number | string, recentWorkouts: unknown): Promise<boolean> {
  const [[, own], [, legacy]] = await AsyncStorage.multiGet([keyFor(userId), ONBOARDING_COMPLETE_KEY]);
  if (own === 'true') return false;
  // Builds before the per-account flag set one flag for the phone. Whoever is
  // signed in when that build updates is the account that finished it.
  if (legacy === 'true') {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    await markOnboardingComplete(userId);
    return false;
  }
  if (Array.isArray(recentWorkouts) && recentWorkouts.length > 0) {
    await markOnboardingComplete(userId);
    return false;
  }
  return true;
}
