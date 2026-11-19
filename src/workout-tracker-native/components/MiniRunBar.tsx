import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useGpsRun } from '../context/GpsRunContext';
import { useAppActive } from '../hooks/useAppActive';
import { navigationRef } from '../navigation/navigationRef';
import { GPS_DISTANCE_UNIT_KEY, toDisplayDistance } from '../utils/units';
import { fmtClock, runElapsedSeconds } from '../utils/gpsRun';
import MiniSessionBar from './MiniSessionBar';

// Stands in for GPSCardioScreen while a run is minimized, the way the workout
// mini bar stands in for WorkoutLog. Open goes back to the map; Discard asks
// first, since a tracked route can't be re-walked. Pause and Stop stay on the
// screen. It slides up each time it appears: on minimizing the run, and when a
// run comes back after a relaunch.

export default function MiniRunBar({ animateIn = true }: { animateIn?: boolean }) {
  const { user } = useAuth();
  const { trackingState, activity, run, timing, clearRun, screenOpen, recovered } = useGpsRun();
  const [unit, setUnit] = useState<'km' | 'mi'>('mi');
  const [, setTick] = useState(0);

  // Read when a run shows up rather than once, so a change in Settings is seen by the next run
  const active = trackingState !== 'idle';
  useEffect(() => {
    if (!active) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user?.id}`).then(v => setUnit(v === 'km' ? 'km' : 'mi')).catch(() => {});
  }, [active, user?.id]);

  // No ticking with the phone locked, as on the map screen; the time is right again on return
  const appActive = useAppActive();
  useEffect(() => {
    if (trackingState !== 'running' || screenOpen || !appActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [trackingState, screenOpen, appActive]);

  const visible = active && !screenOpen;
  if (!visible) return null;

  const elapsed = runElapsedSeconds(timing.base, timing.segmentStart, Date.now());
  const distance = toDisplayDistance(run.distanceKm, unit).toFixed(2);
  const paused = trackingState === 'paused';

  const resume = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('DashboardTab', { screen: 'GPSCardio', initial: false });
    }
  };

  const discard = () => Alert.alert(
    'Discard this activity?',
    "Its route and stats will be deleted and can't be recovered.",
    [
      { text: 'Keep It', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: clearRun },
    ],
  );

  return (
    <MiniSessionBar
      title={recovered ? `Unsaved ${activity}` : paused ? `${activity} paused` : activity}
      subtitle={`${distance} ${unit} · ${fmtClock(elapsed)}`}
      actionLabel={recovered ? 'Review' : 'Open'}
      actionIcon={recovered ? 'play' : 'chevron-up'}
      onOpen={resume}
      onDiscard={discard}
      openA11yLabel={recovered ? `Unsaved ${activity}. Review` : `${activity} in progress. Open`}
      discardA11yLabel="Discard activity"
      animateIn={animateIn}
    />
  );
}
