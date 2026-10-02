// Weekly working-set landmarks per muscle (Renaissance Periodization):
// MEV is the least that still grows a muscle, MAV the most productive range's
// top, MRV the most that can be recovered from. MEV and MRV are mirrored by
// MUSCLE_MEV / MUSCLE_MRV in routes/ai_routes.py so the AI coach judges the
// same numbers the chart shows; __tests__/volumeLandmarks.test.ts fails if
// they drift (Hamstrings MRV was once 16 there and 20 here).
export type VolumeLandmarks = { mev: number; mav: number; mrv: number };

export const MUSCLE_STANDARDS: Record<string, VolumeLandmarks> = {
  Chest:      { mev: 8,  mav: 16, mrv: 20 },
  Back:       { mev: 10, mav: 22, mrv: 25 },
  Shoulders:  { mev: 8,  mav: 22, mrv: 26 },
  Biceps:     { mev: 8,  mav: 20, mrv: 26 },
  Triceps:    { mev: 6,  mav: 14, mrv: 20 },
  Forearms:   { mev: 4,  mav: 14, mrv: 20 },
  Quads:      { mev: 8,  mav: 18, mrv: 20 },
  Hamstrings: { mev: 6,  mav: 16, mrv: 20 },
  Glutes:     { mev: 4,  mav: 12, mrv: 16 },
  Calves:     { mev: 8,  mav: 20, mrv: 30 },
  Core:       { mev: 6,  mav: 20, mrv: 25 },
};

export type VolumeZone =
  | { kind: 'over' | 'atLimit' | 'high' | 'onTrack' | 'below'; label: string }
  | { kind: 'toGo'; label: string; remaining: number }
  | { kind: 'none'; label: '' };

// Secondary muscles count half a set, so a remainder can be 1.5
const fmtSets = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Where a muscle's sets for the Monday-to-Sunday week stand. Until the week
 * is over, a muscle under its MEV reads as how many sets are left rather than
 * a verdict, since one more session can still get it there. Going over MRV is
 * flagged straight away: extra sets can't be taken back.
 */
export function volumeZone(sets: number, std: VolumeLandmarks, weekOver: boolean): VolumeZone {
  if (sets > std.mrv) return { kind: 'over', label: 'Over limit' };
  if (sets === std.mrv) return { kind: 'atLimit', label: 'At limit' };
  if (sets > std.mav) return { kind: 'high', label: 'High' };
  if (sets >= std.mev) return { kind: 'onTrack', label: 'On track' };
  if (sets <= 0) return { kind: 'none', label: '' };
  if (weekOver) return { kind: 'below', label: 'Below target' };
  const remaining = std.mev - sets;
  return { kind: 'toGo', label: `${fmtSets(remaining)} to go`, remaining };
}
