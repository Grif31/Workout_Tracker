import { useEffect } from 'react';
import { Linking } from 'react-native';
import { navigationRef } from './navigationRef';
import { widgetRouteFor } from '../utils/widgetProps';

// The launch URL is the same every time it's asked for, so a logout and login
// in one session would otherwise replay the widget tap that opened the app.
let launchUrlHandled = false;

function open(url: string | null) {
  const route = widgetRouteFor(url);
  if (!route || !navigationRef.isReady()) return;
  if (route.tab === 'ProfileTab') {
    navigationRef.navigate('ProfileTab', { screen: route.screen, initial: false });
  } else {
    navigationRef.navigate(route.tab);
  }
}

/**
 * Opens the screen a home screen widget was tapped for. Mounted in AppTabs,
 * which only exists once someone is logged in and the preload has finished, so
 * a tap made while logged out lands after the login rather than being lost.
 */
export function useWidgetLinks() {
  useEffect(() => {
    if (!launchUrlHandled) {
      launchUrlHandled = true;
      Linking.getInitialURL().then(open).catch(() => {});
    }
    const sub = Linking.addEventListener('url', e => open(e.url));
    return () => sub.remove();
  }, []);
}
