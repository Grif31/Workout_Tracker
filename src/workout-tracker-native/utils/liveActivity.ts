import { Platform } from 'react-native';
import type { WorkoutLiveActivityProps } from '../widgets/WorkoutLiveActivity';
import { WIDGET_LINKS } from './widgetProps';

// Lazy-loaded for the same reason as utils/widgets.ts: createLiveActivity
// touches its native module on import, which throws in Expo Go or a binary
// built before the activity existed.
type Activity = {
  update(props: WorkoutLiveActivityProps, staleDate?: Date): Promise<void>;
  end(policy?: 'default' | 'immediate', props?: WorkoutLiveActivityProps): Promise<void>;
};
type Factory = {
  start(props: WorkoutLiveActivityProps, url?: string, staleDate?: Date): Activity;
  getInstances(): Activity[];
};
let factory: Factory | null = null;
if (Platform.OS === 'ios') {
  try { factory = require('../widgets/WorkoutLiveActivity').default; } catch {}
}

// Whether the last start or update took, so the live workout notification only
// posts when there is no activity to stand in for it.
let active = false;
// Also counts one left running by an earlier launch: the session restores
// without WorkoutLog mounting, and the notification must not double it.
export const isLiveActivityActive = () => active || liveActivityCount() > 0;

// Start, update and end apply in call order, like the notification queue.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => {});
  return run;
}

// The widgets' white logo file, already in the App Group: the extension can only
// show an image from there. Copied once per launch; an activity without a logo
// draws fine, so a failed copy only costs the logo.
let logos: Promise<Pick<WorkoutLiveActivityProps, 'logo'>> | null = null;
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

/** Starts the activity, or updates the running one. Resolves false when none could run. */
export function startOrUpdateLiveActivity(props: Omit<WorkoutLiveActivityProps, 'logo'>, staleDate?: Date): Promise<boolean> {
  return enqueue(async () => {
    if (!factory) return false;
    try {
      const full = { ...props, ...(await activityLogos()) };
      const running = factory.getInstances()[0];
      if (running) await running.update(full, staleDate);
      else factory.start(full, WIDGET_LINKS.workout, staleDate);
      active = true;
      return true;
    } catch {
      active = false;
      return false;
    }
  });
}

export function endLiveActivity(policy: 'default' | 'immediate' = 'immediate'): Promise<void> {
  return enqueue(async () => {
    // Inside the queue: a start queued before this must not set it back afterwards
    active = false;
    if (!factory) return;
    for (const a of factory.getInstances()) await a.end(policy).catch(() => {});
  });
}

/** How many activities the system is still showing, for the spike's kill-and-relaunch check. */
export function liveActivityCount(): number {
  try { return factory?.getInstances().length ?? 0; } catch { return 0; }
}
