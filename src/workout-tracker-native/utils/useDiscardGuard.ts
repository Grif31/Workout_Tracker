import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';

/**
 * Asks before a screen with unsaved changes is left, whether by its back
 * button, a swipe back or Android's back button. Returns `leave`, which runs a
 * navigation (e.g. goBack after a save) without the prompt: the screen must
 * stop blocking first, so the navigation waits for that render.
 */
export function useDiscardGuard(
  navigation: { dispatch: (action: any) => void },
  dirty: boolean,
  message: string,
) {
  const [exit, setExit] = useState<(() => void) | null>(null);
  usePreventRemove(dirty && !exit, ({ data }) => {
    Alert.alert('Discard changes?', message, [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { exit?.(); }, [exit]);
  return (go: () => void) => setExit(() => go);
}
