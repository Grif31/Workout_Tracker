import { syncServerPremium } from '../utils/premiumSync';
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
