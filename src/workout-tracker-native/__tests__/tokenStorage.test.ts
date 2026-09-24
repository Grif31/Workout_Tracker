import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { loadTokens, saveTokenPair, clearStoredTokens } from '../utils/tokenStorage';
import { TOKEN_KEY, REFRESH_TOKEN_KEY, TOKEN_STORE_READY_KEY } from '../constants/storageKeys';

const secure: Map<string, string> = require('expo-secure-store').__store;

describe('tokenStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    secure.clear();
  });

  // Builds before this one kept both tokens in plaintext AsyncStorage. The
  // update must carry them over, or every user is signed out by it.
  it('moves tokens from AsyncStorage on the first launch after the update', async () => {
    await AsyncStorage.multiSet([[TOKEN_KEY, 'acc'], [REFRESH_TOKEN_KEY, 'ref']]);

    expect(await loadTokens()).toEqual({ access: 'acc', refresh: 'ref' });
    expect(secure.get(TOKEN_KEY)).toBe('acc');
    expect(secure.get(REFRESH_TOKEN_KEY)).toBe('ref');
  });

  it('removes the plaintext copy once migrated', async () => {
    await AsyncStorage.multiSet([[TOKEN_KEY, 'acc'], [REFRESH_TOKEN_KEY, 'ref']]);
    await loadTokens();
    expect(await AsyncStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  // iOS keeps keychain items after the app is deleted, so without this a
  // reinstall would silently sign back in as whoever used it last.
  it('discards keychain tokens left by a previous install', async () => {
    secure.set(TOKEN_KEY, 'stale-acc');
    secure.set(REFRESH_TOKEN_KEY, 'stale-ref');

    expect(await loadTokens()).toEqual({ access: null, refresh: null });
    expect(secure.size).toBe(0);
  });

  it('reads saved tokens on later launches', async () => {
    await loadTokens(); // first launch sets the marker
    await saveTokenPair('acc', 'ref');
    expect(await loadTokens()).toEqual({ access: 'acc', refresh: 'ref' });
    expect(await AsyncStorage.getItem(TOKEN_STORE_READY_KEY)).toBe('1');
  });

  it('writes with a keychain class readable while the phone is locked', async () => {
    await saveTokenPair('acc', 'ref');
    for (const call of (SecureStore.setItemAsync as jest.Mock).mock.calls) {
      expect(call[2]).toEqual({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    }
  });

  it('reads an undecryptable item as signed out instead of throwing', async () => {
    await loadTokens();
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Could not decrypt'));
    await expect(loadTokens()).resolves.toEqual({ access: null, refresh: null });
  });

  it('clearStoredTokens removes both', async () => {
    await saveTokenPair('acc', 'ref');
    await clearStoredTokens();
    expect(secure.size).toBe(0);
  });
});
