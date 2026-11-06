import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncDistanceUnit, reportDistanceUnit } from '../utils/distanceUnitSync';
import { GPS_DISTANCE_UNIT_KEY } from '../utils/units';
import { apiFetch } from '../utils/api';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));
const mockApiFetch = apiFetch as jest.Mock;

const sentUnit = () => JSON.parse(mockApiFetch.mock.calls[0][1].body).distance_unit;

describe('distanceUnitSync', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApiFetch.mockReset().mockResolvedValue({ ok: true });
  });

  it('reports the unit with a PATCH to /api/me', () => {
    reportDistanceUnit('km');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/me', expect.objectContaining({ method: 'PATCH' }));
    expect(sentUnit()).toBe('km');
  });

  it('reports km when the phone says km and the server has nothing', async () => {
    await AsyncStorage.setItem(`${GPS_DISTANCE_UNIT_KEY}_7`, 'km');
    await syncDistanceUnit(7, null);
    expect(sentUnit()).toBe('km');
  });

  it('reports miles for an unset phone, which shows miles everywhere', async () => {
    await syncDistanceUnit(7, null);
    expect(sentUnit()).toBe('mi');
  });

  it('sends nothing when the server already agrees', async () => {
    await AsyncStorage.setItem(`${GPS_DISTANCE_UNIT_KEY}_7`, 'km');
    await syncDistanceUnit(7, 'km');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('never throws when the report fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    await expect(syncDistanceUnit(7, null)).resolves.toBeUndefined();
  });
});
