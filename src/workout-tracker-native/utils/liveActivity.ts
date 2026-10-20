import { Platform } from 'react-native';
import type { WorkoutLiveActivityProps } from '../widgets/WorkoutLiveActivity';
import type { GpsLiveActivityProps } from '../widgets/GpsLiveActivity';
import { WIDGET_LINKS } from './widgetProps';

// Two Live Activities, a lifting workout and a GPS run, each with its own
// layout. The app has one session at a time, so at most one of them runs.

type Activity<P> = {
  update(props: P, staleDate?: Date): Promise<void>;
  end(policy?: 'default' | 'immediate', props?: P): Promise<void>;
};
type Factory<P> = {
  start(props: P, url?: string, staleDate?: Date): Activity<P>;
  getInstances(): Activity<P>[];
};

// The widgets' white logo file, already in the App Group: the extension can only
// show an image from there. Copied once per launch; an activity without a logo
// draws fine, so a failed copy only costs the logo.
let logos: Promise<{ logo?: string }> | null = null;
function activityLogos() {
  return (logos ??= (async () => {
    try {
      const { logoDark } = await require('./widgetImages')
        .prepareWidgetImages(require('expo-widgets').widgetsDirectory);
      return logoDark ? { logo: logoDark } : {};
    } catch {
      return {};
    }
  })());
}

function controller<P extends { logo?: string }>(load: () => Factory<P>, url: string) {
  // Lazy-loaded for the same reason as utils/widgets.ts: createLiveActivity
  // touches its native module on import, which throws in Expo Go or a binary
  // built before the activity existed.
  let factory: Factory<P> | null = null;
  if (Platform.OS === 'ios') {
    try { factory = load(); } catch {}
  }

  // Whether the last start or update took
  let active = false;

  // Start, update and end apply in call order, like the notification queue.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const run = queue.then(op, op);
    queue = run.catch(() => {});
    return run;
  };

  const count = (): number => {
    try { return factory?.getInstances().length ?? 0; } catch { return 0; }
  };

  return {
    /** Starts the activity, or updates the running one. Resolves false when none could run. */
    startOrUpdate(props: Omit<P, 'logo'>, staleDate?: Date): Promise<boolean> {
      return enqueue(async () => {
        if (!factory) return false;
        try {
          const full = { ...props, ...(await activityLogos()) } as P;
          const running = factory.getInstances()[0];
          if (running) await running.update(full, staleDate);
          else factory.start(full, url, staleDate);
          active = true;
          return true;
        } catch {
          active = false;
          return false;
        }
      });
    },
    end(policy: 'default' | 'immediate' = 'immediate'): Promise<void> {
      return enqueue(async () => {
        // Inside the queue: a start queued before this must not set it back afterwards
        active = false;
        if (!factory) return;
        for (const a of factory.getInstances()) await a.end(policy).catch(() => {});
      });
    },
    // Also counts one left running by an earlier launch: a workout session
    // restores without WorkoutLog mounting, and the notification must not double it.
    isActive: () => active || count() > 0,
  };
}

const workout = controller<WorkoutLiveActivityProps>(() => require('../widgets/WorkoutLiveActivity').default, WIDGET_LINKS.workout);
const run = controller<GpsLiveActivityProps>(() => require('../widgets/GpsLiveActivity').default, WIDGET_LINKS.run);

// The lifting workout's activity. isLiveActivityActive decides whether the live
// workout notification posts: only when there is no activity to stand in for it.
export const startOrUpdateLiveActivity = workout.startOrUpdate;
export const endLiveActivity = workout.end;
export const isLiveActivityActive = workout.isActive;

// The GPS run's activity
export const startOrUpdateRunActivity = run.startOrUpdate;
export const endRunActivity = run.end;
