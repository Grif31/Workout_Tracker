import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';
import { GPS_DISTANCE_UNIT_KEY, type DistanceUnit } from './units';

// The distance unit is chosen on the phone, but the server's distance badges
// need the same ladder (TODO §27), so every change is reported. Fire and
// forget: the startup check below retries a report that didn't land.
export function reportDistanceUnit(unit: DistanceUnit): void {
  apiFetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distance_unit: unit }),
  }).catch(() => {});
}

// Unset reads as miles everywhere in the app, so that's what gets reported
export async function syncDistanceUnit(userId: number, serverUnit: string | null | undefined): Promise<void> {
  const stored = await AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${userId}`).catch(() => null);
  const unit: DistanceUnit = stored === 'km' ? 'km' : 'mi';
  if (unit !== serverUnit) reportDistanceUnit(unit);
}
