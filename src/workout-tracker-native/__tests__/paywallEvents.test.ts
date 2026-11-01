import { planOf, resetUpsellsShown, trackPaywall, trackUpsellShown } from '../utils/paywallEvents';
import { apiFetch } from '../utils/api';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));

const sent = () => (apiFetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(init.body));

describe('paywallEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetUpsellsShown();
    (apiFetch as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('posts the event as JSON', async () => {
    await trackPaywall({ event: 'purchase', source: 'templates', plan: 'annual', trial: true, outcome: 'purchased' });
    expect(apiFetch).toHaveBeenCalledWith('/api/paywall/events', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }));
    expect(sent()).toEqual([{ event: 'purchase', source: 'templates', plan: 'annual', trial: true, outcome: 'purchased' }]);
  });

  it('never throws, even offline', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    await expect(trackPaywall({ event: 'paywall_viewed' })).resolves.toBeUndefined();
  });

  it('sends a teaser once per source per launch', async () => {
    trackUpsellShown('muscle_volume');
    trackUpsellShown('muscle_volume');
    trackUpsellShown('strength_score');
    await Promise.resolve();
    expect(sent()).toEqual([
      { event: 'upsell_shown', source: 'muscle_volume' },
      { event: 'upsell_shown', source: 'strength_score' },
    ]);
  });

  it.each([
    ['ANNUAL', 'annual'], ['MONTHLY', 'monthly'], ['LIFETIME', 'lifetime'], ['WEEKLY', null], [undefined, null],
  ])('names RevenueCat package type %s as %s', (type, plan) => {
    expect(planOf(type)).toBe(plan);
  });
});
