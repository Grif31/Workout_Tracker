import { useEffect } from 'react';
import { Linking } from 'react-native';
import { navigationRef } from './navigationRef';
import { apiFetch } from '../utils/api';
import { buildTemplatePrefill, parseProgramming, type TemplateExercise } from '../utils/templatePrefill';
import { widgetRouteFor } from '../utils/widgetProps';

// The launch URL is the same every time it's asked for, so a logout and login
// in one session would otherwise replay the widget tap that opened the app.
let launchUrlHandled = false;

type RoutineDay = {
  day_order: number;
  label: string;
  workout_template: { exercises: TemplateExercise[]; programming_json?: string | null };
};

/**
 * Up Next's Start: the day the widget showed, filled in the way Home's routine
 * card fills it. Fetched rather than read from the snapshot, which keeps only
 * names; the day's exercises need their ids, sets and reps. Lands on Home if
 * the routine or day is gone (deleted, or edited down since the widget drew).
 */
async function startRoutineDay(routineId: number, dayIndex: number) {
  try {
    const res = await apiFetch(`/api/routines/${routineId}`);
    const routine = res.ok ? await res.json() : null;
    const day: RoutineDay | undefined = [...(routine?.days ?? [])]
      .sort((a: RoutineDay, b: RoutineDay) => a.day_order - b.day_order)[dayIndex];
    if (!day || !navigationRef.isReady()) {
      if (navigationRef.isReady()) navigationRef.navigate('DashboardTab');
      return;
    }
    navigationRef.navigate('DashboardTab', {
      screen: 'WorkoutLog',
      params: {
        prefill: buildTemplatePrefill(day.label, day.workout_template.exercises, parseProgramming(day.workout_template.programming_json)),
        editMode: false,
      },
      initial: false,
    });
  } catch {
    if (navigationRef.isReady()) navigationRef.navigate('DashboardTab');
  }
}

function open(url: string | null) {
  const route = widgetRouteFor(url);
  if (!route || !navigationRef.isReady()) return;
  if ('start' in route) {
    startRoutineDay(route.start.routineId, route.start.dayIndex);
  } else if ('resumeWorkout' in route) {
    // Same as the mini bar's Resume. Already on the log means the tap came
    // from the lock screen with the workout open: navigating again would reset its params.
    if (navigationRef.getCurrentRoute()?.name !== 'WorkoutLog') {
      navigationRef.navigate('DashboardTab', { screen: 'WorkoutLog', params: {}, initial: false });
    }
  } else if (route.tab === 'ProfileTab') {
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
