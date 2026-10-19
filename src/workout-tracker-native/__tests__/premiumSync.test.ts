import { Alert } from 'react-native';
import { syncServerPremium, handlePremiumRequired } from '../utils/premiumSync';
import { apiFetch } from '../utils/api';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));

describe('syncServerPremium', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts to the sync route', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true });
    await syncServerPremium();
    expect(apiFetch).toHaveBeenCalledWith('/api/premium/sync', { method: 'POST' });
  });

  it('never throws, even offline', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    await expect(syncServerPremium()).resolves.toBeUndefined();
  });
});

describe('handlePremiumRequired', () => {
  let alertSpy: jest.SpyInstance;
  const res = (status: number) => ({ status }) as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('on a 402 for a Premium user, syncs and asks them to try again', () => {
    expect(handlePremiumRequired(res(402), true)).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/premium/sync', { method: 'POST' });
    expect(alertSpy).toHaveBeenCalledWith('Almost There', expect.any(String));
  });

  it("leaves a free account's 402 to the caller", () => {
    expect(handlePremiumRequired(res(402), false)).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('ignores every other status', () => {
    for (const status of [200, 400, 429, 500]) expect(handlePremiumRequired(res(status), true)).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
