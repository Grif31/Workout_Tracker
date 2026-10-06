import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import { usePurchase } from '../context/PurchaseContext';
import AccountSettingsScreen from '../screens/ProfileTab/AccountSettingsScreen';

jest.mock('../context/PurchaseContext', () => ({ usePurchase: jest.fn() }));
jest.mock('../utils/links', () => ({ openExternalLink: jest.fn() }));

const { openExternalLink } = require('../utils/links');
const mockUsePurchase = usePurchase as jest.Mock;
const nav = createMockNavigation();
const renderScreen = () =>
  render(<AccountSettingsScreen navigation={nav as any} route={createMockRoute('AccountSettings') as any} />);

const sub = (over: Record<string, any>) => ({
  productId: 'com.aretefitness.app.sub.monthly', expiresAt: '2026-11-05T18:00:00Z', willRenew: true,
  managementURL: null, ...over,
});

describe('Account Settings premium row', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers Premium to a free account', () => {
    mockUsePurchase.mockReturnValue({ isPremium: false, subscription: null });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Get Aretē Premium'));
    expect(nav.navigate).toHaveBeenCalledWith('Paywall', { source: 'account' });
  });

  it("shows a subscriber's plan and renewal date, and opens Apple's manage page", () => {
    mockUsePurchase.mockReturnValue({ isPremium: true, subscription: sub({}) });
    const { getByText } = renderScreen();
    expect(getByText('Monthly · Renews Nov 5, 2026')).toBeTruthy();
    fireEvent.press(getByText('Manage Subscription'));
    expect(openExternalLink).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
  });

  it('says a cancelled subscription ends rather than renews', () => {
    mockUsePurchase.mockReturnValue({
      isPremium: true,
      subscription: sub({ productId: 'com.aretefitness.app.sub.annual', willRenew: false }),
    });
    expect(renderScreen().getByText('Annual · Ends Nov 5, 2026')).toBeTruthy();
  });

  it('has nothing to manage for Lifetime', () => {
    mockUsePurchase.mockReturnValue({
      isPremium: true,
      subscription: sub({ productId: 'com.aretefitness.app.prem.lifetime', expiresAt: null, willRenew: false }),
    });
    const { getByText, queryByText } = renderScreen();
    expect(getByText('Lifetime · Yours for good')).toBeTruthy();
    expect(queryByText('Manage Subscription')).toBeNull();
  });

  it("shows a beta tester's granted premium as complimentary, not as a subscription", () => {
    mockUsePurchase.mockReturnValue({
      isPremium: true,
      subscription: sub({ productId: 'rc_promo_premium_lifetime', expiresAt: '2226-10-01T00:00:00Z', willRenew: false }),
    });
    const { getByText, queryByText } = renderScreen();
    expect(getByText('Complimentary · Yours for good')).toBeTruthy();
    expect(queryByText('Manage Subscription')).toBeNull();
  });

  it('says premium comes with the build when there is no purchase behind it', () => {
    mockUsePurchase.mockReturnValue({ isPremium: true, subscription: null });
    expect(renderScreen().getByText('Included with this build')).toBeTruthy();
  });
});
