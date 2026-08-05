import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import { usePurchase } from '../context/PurchaseContext';
import PaywallScreen from '../screens/PaywallScreen';

jest.mock('../context/PurchaseContext', () => ({
  usePurchase: jest.fn(),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const mockUsePurchase = usePurchase as jest.Mock;
const { showToast } = require('../utils/toast');

const nav = createMockNavigation();
const route = createMockRoute('Paywall');

function makePackage(packageType: string, priceString: string) {
  return { packageType, product: { priceString } } as any;
}

const THREE_PACKAGES = [
  makePackage('ANNUAL', '$59.99/yr'),
  makePackage('MONTHLY', '$9.99/mo'),
  makePackage('LIFETIME', '$149.99'),
];

function withOfferings(packages: any[]) {
  return { current: { availablePackages: packages }, all: { default: { availablePackages: packages } } };
}

describe('PaywallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePurchase.mockReturnValue({
      offerings: null,
      purchasePackage: jest.fn(() => Promise.resolve(true)),
      restorePurchases: jest.fn(() => Promise.resolve(true)),
    });
  });

  it('renders without crashing when offerings have not loaded yet', () => {
    render(<PaywallScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the feature list', () => {
    const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Strength Score & lifter ranking')).toBeTruthy();
    expect(getByText('AI Coach — generate routines & templates')).toBeTruthy();
    expect(getByText('Unlimited templates & routines')).toBeTruthy();
  });

  it('shows the tier price once offerings load', () => {
    mockUsePurchase.mockReturnValue({
      offerings: withOfferings(THREE_PACKAGES),
      purchasePackage: jest.fn(() => Promise.resolve(true)),
      restorePurchases: jest.fn(() => Promise.resolve(true)),
    });
    const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
    expect(getByText('$59.99/yr')).toBeTruthy();
    expect(getByText('$9.99/mo')).toBeTruthy();
    expect(getByText('$149.99')).toBeTruthy();
  });

  it('closing the paywall navigates back', () => {
    const { UNSAFE_getAllByType } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(nav.goBack).toHaveBeenCalled();
  });

  describe('purchase', () => {
    it('does not attempt a purchase when no packages have loaded', () => {
      const purchasePackage = jest.fn(() => Promise.resolve(true));
      mockUsePurchase.mockReturnValue({ offerings: null, purchasePackage, restorePurchases: jest.fn() });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Get Premium'));
      expect(purchasePackage).not.toHaveBeenCalled();
    });

    it('purchases the first (Annual) tier by default', async () => {
      const purchasePackage = jest.fn(() => Promise.resolve(true));
      mockUsePurchase.mockReturnValue({
        offerings: withOfferings(THREE_PACKAGES), purchasePackage, restorePurchases: jest.fn(),
      });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Get Premium'));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith(THREE_PACKAGES[0]));
    });

    it('purchases the selected tier after switching selection', async () => {
      const purchasePackage = jest.fn(() => Promise.resolve(true));
      mockUsePurchase.mockReturnValue({
        offerings: withOfferings(THREE_PACKAGES), purchasePackage, restorePurchases: jest.fn(),
      });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('$149.99')); // Lifetime tier card
      fireEvent.press(getByText('Get Premium'));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith(THREE_PACKAGES[2]));
    });

    it('shows a success toast and navigates back on a successful purchase', async () => {
      const purchasePackage = jest.fn(() => Promise.resolve(true));
      mockUsePurchase.mockReturnValue({
        offerings: withOfferings(THREE_PACKAGES), purchasePackage, restorePurchases: jest.fn(),
      });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Get Premium'));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('Welcome to Premium!'));
      expect(nav.goBack).toHaveBeenCalled();
    });

    it('does not navigate or toast success when the purchase fails or is cancelled', async () => {
      const purchasePackage = jest.fn(() => Promise.resolve(false));
      mockUsePurchase.mockReturnValue({
        offerings: withOfferings(THREE_PACKAGES), purchasePackage, restorePurchases: jest.fn(),
      });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Get Premium'));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalled());
      expect(showToast).not.toHaveBeenCalledWith('Welcome to Premium!');
      expect(nav.goBack).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('shows a success toast and navigates back when a purchase is restored', async () => {
      const restorePurchases = jest.fn(() => Promise.resolve(true));
      mockUsePurchase.mockReturnValue({ offerings: null, purchasePackage: jest.fn(), restorePurchases });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Restore Purchases'));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('Purchases restored!'));
      expect(nav.goBack).toHaveBeenCalled();
    });

    it('shows a "no purchases found" toast and does not navigate when nothing is restored', async () => {
      const restorePurchases = jest.fn(() => Promise.resolve(false));
      mockUsePurchase.mockReturnValue({ offerings: null, purchasePackage: jest.fn(), restorePurchases });
      const { getByText } = render(<PaywallScreen navigation={nav as any} route={route as any} />);
      fireEvent.press(getByText('Restore Purchases'));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('No purchases found'));
      expect(nav.goBack).not.toHaveBeenCalled();
    });
  });
});
