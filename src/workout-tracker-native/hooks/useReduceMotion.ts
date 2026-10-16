import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system Reduce Motion setting, kept current if it changes while the
 * screen is open. null until the first answer arrives (a tick after mount), so
 * a celebration can wait for it instead of starting and then being cut.
 */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(value => { if (alive) setReduce(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}
