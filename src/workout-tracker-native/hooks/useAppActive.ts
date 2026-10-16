import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is in the foreground, kept current. A screen that keeps
 * doing visible work with the phone locked (a GPS run left on the map) uses it
 * to stop that work until the app is back: iOS can end an app for what it does
 * in the background. Anything but 'background' or 'inactive' counts as active,
 * so a state iOS hasn't reported yet doesn't freeze the screen at launch.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
