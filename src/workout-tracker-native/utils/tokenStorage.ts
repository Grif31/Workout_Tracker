import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY, REFRESH_TOKEN_KEY, TOKEN_STORE_READY_KEY } from '../constants/storageKeys';

// The only place the auth tokens touch disk. They used to sit in AsyncStorage,
// which is plaintext and ends up in unencrypted device backups.

// AFTER_FIRST_UNLOCK, not the default WHEN_UNLOCKED: apiFetch rotates the pair
// on refresh, and that can happen mid-run with the screen locked (GPS cardio
// keeps working in the background). A WHEN_UNLOCKED write would throw there.
const WRITE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function deleteStored() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveTokenPair(access: string, refresh: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, access, WRITE_OPTS);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh, WRITE_OPTS);
}

export async function saveAccessToken(access: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, access, WRITE_OPTS);
}

export async function loadTokens(): Promise<{ access: string | null; refresh: string | null }> {
  // iOS keeps keychain items after the app is deleted; AsyncStorage doesn't. No
  // marker therefore means a fresh install, and anything in the keychain was
  // left by a previous one: drop it so a reinstall still starts signed out.
  if (!(await AsyncStorage.getItem(TOKEN_STORE_READY_KEY))) {
    await deleteStored();
    // Earlier builds kept the pair in AsyncStorage; carry it over once so the
    // update doesn't sign anyone out, then remove the plaintext copy.
    const [[, access], [, refresh]] = await AsyncStorage.multiGet([TOKEN_KEY, REFRESH_TOKEN_KEY]);
    if (access) await saveTokenPair(access, refresh ?? '');
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY]);
    await AsyncStorage.setItem(TOKEN_STORE_READY_KEY, '1');
  }
  try {
    return {
      access: await SecureStore.getItemAsync(TOKEN_KEY),
      refresh: await SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    };
  } catch {
    // A keystore item that can no longer be decrypted (its key was lost, e.g.
    // after a device restore) reads as signed out rather than a crash at launch.
    return { access: null, refresh: null };
  }
}

export async function clearStoredTokens() {
  await deleteStored();
}
