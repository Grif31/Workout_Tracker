import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from './toast';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

// Converts a stored relative path (/static/...) to a full URL using the current API base.
// Passes through already-absolute URLs (http/https) and local file URIs unchanged.
// Safe to call on null/undefined — returns undefined so <Image source> is skipped.
export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('file://') || path.startsWith('content://')) return path;
  return `${BASE}${path}`;
}
const NETWORK_ERROR_MSG = 'Network error. Check your connection and try again.';

// Module-level token store — lives outside React so apiFetch can read the
// latest tokens without needing a context ref or prop drilling.
let _access = '';
let _refresh = '';

// Registered by AuthContext on mount. Called when the refresh token is expired
// or invalid so the context can clear user state and show the login screen.
let _onUnauthenticated: (() => void) | null = null;

// Called by AuthContext after login or on app start (restoring from AsyncStorage).
export function setTokens(access: string, refresh: string) {
  _access = access;
  _refresh = refresh;
}

// Called by AuthContext on logout.
export function clearTokens() {
  _access = '';
  _refresh = '';
}

// Lets AuthContext register a callback that fires when the session is no longer
// recoverable (both access and refresh tokens are invalid/expired).
export function registerUnauthCallback(cb: () => void) {
  _onUnauthenticated = cb;
}

// Exchanges the refresh token for a new access token, updates the module store
// and AsyncStorage, then returns the new token. Returns null on any failure.
async function doRefresh(): Promise<string | null> {
  if (!_refresh) return null;
  try {
    const res = await fetch(`${BASE}/api/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_refresh}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newAccess = data.access_token as string;
    _access = newAccess;
    await AsyncStorage.setItem('token', newAccess);
    if (data.refresh_token) {
      _refresh = data.refresh_token as string;
      await AsyncStorage.setItem('refresh_token', data.refresh_token);
    }
    return newAccess;
  } catch {
    return null;
  }
}

// Drop-in replacement for fetch() that handles auth transparently:
//   • Injects the Authorization header automatically
//   • On 401: silently refreshes the access token and retries once
//   • If refresh fails: wipes tokens and fires the unauthenticated callback
//   • On network failure: shows a toast and throws (callers should catch)
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (_access) headers.set('Authorization', `Bearer ${_access}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    // Network unreachable — no HTTP response at all.
    showToast(NETWORK_ERROR_MSG);
    throw new Error('Network request failed');
  }

  if (res.status === 401 && _refresh) {
    const newAccess = await doRefresh();
    if (newAccess) {
      // Retry the original request with the refreshed token.
      headers.set('Authorization', `Bearer ${newAccess}`);
      try {
        res = await fetch(`${BASE}${path}`, { ...init, headers });
      } catch {
        showToast(NETWORK_ERROR_MSG);
        throw new Error('Network request failed');
      }
    } else {
      // Refresh token is expired or invalid — session is unrecoverable.
      // Wipe everything and send the user back to the login screen.
      clearTokens();
      await AsyncStorage.multiRemove(['token', 'refresh_token', 'user']);
      _onUnauthenticated?.();
    }
  }

  return res;
}
