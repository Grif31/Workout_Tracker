// Shared cardio stat formatters — used by detail screens and share cards.
import { toDisplayPace, type DistanceUnit } from './units';

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.round((minutes % 1) * 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// m:ss from a pace that is already per display unit. Rounding the seconds can
// land on 60 (4.999 min/km), which has to carry into the minute or the pace
// renders as "4:60".
export function fmtPaceValue(paceMin: number): string {
  if (!isFinite(paceMin) || paceMin <= 0) return '--:--';
  let m = Math.floor(paceMin);
  let s = Math.round((paceMin - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPace(durationMin: number, distance: number): string {
  if (distance <= 0) return '--:--';
  return fmtPaceValue(durationMin / distance);
}

// Finish time for a race distance: m:ss, or h:mm:ss from an hour up
// (a marathon reads 3:45:10, not 225:10). Seconds carry like fmtPaceValue.
export function fmtRaceTime(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return '--:--';
  const totalSec = Math.round(minutes * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Endurance paces are stored per km; the reader sees their own GPS unit.
export function fmtPaceForUnit(minPerKm: number, unit: DistanceUnit): string {
  return fmtPaceValue(toDisplayPace(minPerKm, unit));
}
