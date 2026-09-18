export const toDisplayVolume = (val: number, _unit: string) => val;
export const roundTenth = (val: number) => Math.round(val * 10) / 10;
export type WeightUnit = 'lbs' | 'kg';
export const GPS_DISTANCE_UNIT_KEY = 'gps_distance_unit';
export type DistanceUnit = 'km' | 'mi';
// Real conversion: screens render distances straight from this, so a pass-through
// would hide unit bugs
export const toDisplayDistance = (km: number, unit: DistanceUnit) => (unit === 'mi' ? km * 0.621371 : km);
export const toKm = (value: number, unit: DistanceUnit) => (unit === 'mi' ? value * 1.60934 : value);
export const toDisplayPace = (minPerKm: number, unit: DistanceUnit) => (unit === 'mi' ? minPerKm * 1.60934 : minPerKm);
