import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import { usePurchase } from '../context/PurchaseContext';
import PaywallScreen from '../screens/PaywallScreen';

jest.mock('../context/PurchaseContext', () => ({
  usePurchase: jest.fn(),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../utils/links', () => ({ openExternalLink: jest.fn() }));
jest.mock('../utils/notifications', () => ({ scheduleTrialReminder: jest.fn() }));

const mockUsePurchase = usePurchase as jest.Mock;
const { showToast } = require('../utils/toast');
const { openExternalLink } = require('../utils/links');
const { scheduleTrialReminder } = require('../utils/notifications');

const nav = createMockNavigation();

function makePackage(packageType: string, price: number) {
  return {
    packageType,
    product: { identifier: packageType.toLowerCase(), price, priceString: `$${price}`, currencyCode: 'USD' },
  } as any;
}

const ANNUAL = makePackage('ANNUAL', 59.99);
const MONTHLY = makePackage('MONTHLY', 9.99);
const LIFETIME = makePackage('LIFETIME', 149.99);
const THREE_PACKAGES = [ANNUAL, MONTHLY, LIFETIME];

const withTrial = (pkg: any, periodUnit = 'WEEK', periodNumberOfUnits = 1) => ({
  ...pkg,
  product: { ...pkg.product, introPrice: { price: 0, periodUnit, periodNumberOfUnits } },
});

function withOfferings(packages: any[]) {
  return { current: { availablePackages: packages }, all: { default: { availablePackages: packages } } };
}

// The purchase context the paywall sees; each test overrides what it's about
function purchase(overrides: Record<string, any> = {}) {
  const value = {
    isPremium: false,
    offerings: withOfferings(THREE_PACKAGES),
    offeringsState: 'ready',
    reloadOfferings: jest.fn(() => Promise.resolve()),
    checkTrialEligibility: jest.fn(() => Promise.resolve({})),
    purchasePackage: jest.fn(() => Promise.resolve('purchased')),
    restorePurchases: jest.fn(() => Promise.resolve('restored')),
    ...overrides,
  };
  mockUsePurchase.mockReturnValue(value);
  return value;
}

const renderPaywall = (source?: string) =>
  render(<PaywallScreen navigation={nav as any} route={createMockRoute('Paywall', source ? { source } : undefined) as any} />);

const BUY_ANNUAL = 'Subscribe for $59.99/year';

describe('PaywallScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    purchase();
  });
  afterEach(() => alertSpy.mockRestore());

  it('renders without crashing when offerings have not loaded yet', () => {
    purchase({ offerings: null, offeringsState: 'loading' });
    renderPaywall();
  });

  it('lists each feature with what it does for you', () => {
    const { getByText } = renderPaywall();
    expect(getByText('Strength Score')).toBeTruthy();
    expect(getByText(/where your lifts rank based on your bodyweight/)).toBeTruthy();
    expect(getByText('AI Coach')).toBeTruthy();
    expect(getByText('Unlimited templates and routines')).toBeTruthy();
  });

  it('shows each plan price once offerings load', () => {
    const { getByText } = renderPaywall();
    expect(getByText('$59.99')).toBeTruthy();
    expect(getByText('$9.99')).toBeTruthy();
    expect(getByText('$149.99')).toBeTruthy();
  });

  it('closing the paywall navigates back', () => {
    const { getByLabelText } = renderPaywall();
    fireEvent.press(getByLabelText('Close'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  describe('the pitch follows what was tapped', () => {
    it('has a general headline when opened from nowhere in particular', () => {
      const { getByText } = renderPaywall();
      expect(getByText('Reach your peak')).toBeTruthy();
    });

    it('names the locked feature and lists it first', () => {
      const { getByText, getAllByText } = renderPaywall('endurance_score');
      expect(getByText('Endurance Score is part of Premium')).toBeTruthy();
      const labels = getAllByText(/^(AI Coach|Training insights|Strength Score|Endurance Score|Muscle volume zones)$/)
        .map(n => n.props.children);
      expect(labels[0]).toBe('Endurance Score');
      expect(labels).toHaveLength(5);
    });

    it('pitches the weekly review when that is what was tapped', () => {
      const { getByText, getAllByText } = renderPaywall('weekly_review');
      expect(getByText('The full weekly review is part of Premium')).toBeTruthy();
      const labels = getAllByText(/^(AI Coach|Training insights|Strength Score|Endurance Score|Muscle volume zones)$/)
        .map(n => n.props.children);
      expect(labels[0]).toBe('Training insights');
    });

    it('says which free limit was reached for templates and routines', () => {
      expect(renderPaywall('templates').getByText("You've used your 5 free templates")).toBeTruthy();
      expect(renderPaywall('routines').getByText("You've used your 2 free routines")).toBeTruthy();
    });
  });

  describe('annual savings', () => {
    it('shows the saving and the monthly equivalent from the store prices', () => {
      // $59.99 a year against 12 × $9.99
      const { getByText, queryByText } = renderPaywall();
      expect(getByText('Save 50%')).toBeTruthy();
      expect(getByText('$5.00/mo, billed yearly')).toBeTruthy();
      expect(queryByText('Best Value')).toBeNull();
    });

    it('falls back to Best Value when there is no monthly plan to compare with', () => {
      purchase({ offerings: withOfferings([ANNUAL, LIFETIME]) });
      const { getByText, queryByText } = renderPaywall();
      expect(getByText('Best Value')).toBeTruthy();
      expect(queryByText(/billed yearly/)).toBeNull();
    });
  });

  describe('purchase', () => {
    it('does not attempt a purchase when no packages have loaded', () => {
      const { purchasePackage } = purchase({ offerings: null, offeringsState: 'loading' });
      const { getByText } = renderPaywall();
      fireEvent.press(getByText('Get Premium'));
      expect(purchasePackage).not.toHaveBeenCalled();
    });

    it('the button names the plan and price, and buys Annual by default', async () => {
      const { purchasePackage } = purchase();
      const { getByText } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith(ANNUAL));
    });

    it('follows the selected plan', async () => {
      const { purchasePackage } = purchase();
      const { getByText } = renderPaywall();
      fireEvent.press(getByText('Monthly'));
      expect(getByText('Subscribe for $9.99/month')).toBeTruthy();
      fireEvent.press(getByText('Lifetime'));
      fireEvent.press(getByText('Buy Lifetime for $149.99'));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith(LIFETIME));
    });

    it('welcomes a new subscriber with what just unlocked, and closes on Done', async () => {
      const { getByText, findByTestId, findByText } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      expect(await findByTestId('purchase-success')).toBeTruthy();
      expect(await findByText('Welcome to Aretē Premium')).toBeTruthy();
      // Stays up until dismissed: it is a screen now, not a toast
      expect(nav.goBack).not.toHaveBeenCalled();
      fireEvent.press(getByText('Done'));
      expect(nav.goBack).toHaveBeenCalled();
    });

    it('opens an unlocked feature straight from the welcome screen', async () => {
      const { navigationRef } = require('../navigation/navigationRef');
      jest.spyOn(navigationRef, 'isReady').mockReturnValue(true);
      const navigate = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => {});
      const { getByText, findByText } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      await findByText('Welcome to Aretē Premium');
      fireEvent.press(getByText('See how every lift ranks'));
      expect(nav.goBack).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'StrengthScore', initial: false });
    });

    it('says nothing when the user cancels', async () => {
      const { purchasePackage } = purchase({ purchasePackage: jest.fn(() => Promise.resolve('cancelled')) });
      const { getByText } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      await waitFor(() => expect(purchasePackage).toHaveBeenCalled());
      expect(alertSpy).not.toHaveBeenCalled();
      expect(nav.goBack).not.toHaveBeenCalled();
    });

    it.each([
      ['pending', 'Waiting for Approval'],
      ['network', "Couldn't Reach the App Store"],
      ['already_owned', 'Already Purchased'],
      ['failed', "Purchase Didn't Go Through"],
    ])('explains a purchase that ends %s', async (outcome, title) => {
      purchase({ purchasePackage: jest.fn(() => Promise.resolve(outcome)) });
      const { getByText, queryByTestId } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(title, expect.any(String)));
      expect(queryByTestId('purchase-success')).toBeNull();
      expect(nav.goBack).not.toHaveBeenCalled();
    });
  });

  describe('plans and free trial', () => {
    it('renders only the plans configured in RevenueCat once offerings load', () => {
      purchase({ offerings: withOfferings([ANNUAL, MONTHLY]) });
      const { queryByText } = renderPaywall();
      expect(queryByText('Annual')).toBeTruthy();
      expect(queryByText('Lifetime')).toBeNull();
    });

    it('advertises the trial to an eligible user', async () => {
      purchase({
        offerings: withOfferings([withTrial(ANNUAL), MONTHLY]),
        checkTrialEligibility: jest.fn(() => Promise.resolve({ annual: true })),
      });
      const { findByText, getByText } = renderPaywall();
      expect(await findByText('1 week free, then $59.99')).toBeTruthy();
      expect(getByText('Start 7-Day Free Trial')).toBeTruthy();
    });

    it('goes back to a plain subscribe button for a plan with no trial', async () => {
      purchase({
        offerings: withOfferings([withTrial(ANNUAL), MONTHLY]),
        checkTrialEligibility: jest.fn(() => Promise.resolve({ annual: true })),
      });
      const { findByText, getByText, queryByText } = renderPaywall();
      await findByText('Start 7-Day Free Trial');
      fireEvent.press(getByText('Monthly'));
      expect(queryByText(/Free Trial/)).toBeNull();
      expect(getByText('Subscribe for $9.99/month')).toBeTruthy();
    });

    it('schedules a reminder before the first charge when a trial starts', async () => {
      purchase({
        offerings: withOfferings([withTrial(ANNUAL)]),
        checkTrialEligibility: jest.fn(() => Promise.resolve({ annual: true })),
      });
      const { findByText } = renderPaywall();
      fireEvent.press(await findByText('Start 7-Day Free Trial'));
      await waitFor(() => expect(scheduleTrialReminder).toHaveBeenCalledWith(5, expect.stringContaining('$59.99')));
    });

    it('schedules no reminder for a purchase without a trial', async () => {
      const { getByText, findByTestId } = renderPaywall();
      fireEvent.press(getByText(BUY_ANNUAL));
      await findByTestId('purchase-success');
      expect(scheduleTrialReminder).not.toHaveBeenCalled();
    });

    it('does not advertise the trial to a user who already used it', async () => {
      const { checkTrialEligibility } = purchase({
        offerings: withOfferings([withTrial(ANNUAL)]),
        checkTrialEligibility: jest.fn(() => Promise.resolve({ annual: false })),
      });
      const { getByText, queryByText } = renderPaywall();
      await waitFor(() => expect(checkTrialEligibility).toHaveBeenCalledWith(['annual']));
      expect(getByText('$59.99')).toBeTruthy();
      expect(queryByText(/Free Trial/)).toBeNull();
    });
  });

  describe('restore', () => {
    it('shows the welcome screen when a purchase is restored', async () => {
      const { getByText, findByText } = renderPaywall();
      fireEvent.press(getByText('Restore Purchases'));
      expect(await findByText('Premium Restored')).toBeTruthy();
    });

    it('shows a "no purchases found" toast and does not navigate when nothing is restored', async () => {
      purchase({ restorePurchases: jest.fn(() => Promise.resolve('none')) });
      const { getByText } = renderPaywall();
      fireEvent.press(getByText('Restore Purchases'));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('No purchases found'));
      expect(nav.goBack).not.toHaveBeenCalled();
    });

    it('tells a failed restore apart from having nothing to restore', async () => {
      purchase({ restorePurchases: jest.fn(() => Promise.resolve('failed')) });
      const { getByText } = renderPaywall();
      fireEvent.press(getByText('Restore Purchases'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Restore", expect.any(String)));
      expect(showToast).not.toHaveBeenCalledWith('No purchases found');
    });
  });

  describe('when the plans did not load', () => {
    it('retries on open, says so, and offers Try Again instead of spinning', () => {
      const { reloadOfferings } = purchase({ offerings: null, offeringsState: 'failed' });
      const { getByText, queryByText } = renderPaywall();
      expect(reloadOfferings).toHaveBeenCalledTimes(1);
      expect(getByText(/Couldn't load the plans/)).toBeTruthy();
      expect(queryByText('Annual')).toBeNull();
      fireEvent.press(getByText('Try Again'));
      expect(reloadOfferings).toHaveBeenCalledTimes(2);
    });

    it('says purchases are unavailable where there is no store', () => {
      purchase({ offerings: null, offeringsState: 'unavailable' });
      const { getByText, queryByText } = renderPaywall();
      expect(getByText(/can't be purchased on this device/)).toBeTruthy();
      expect(queryByText('Try Again')).toBeNull();
    });
  });

  it('drops the renewal wording for the one-time Lifetime plan', () => {
    const { getByText, queryByText } = renderPaywall();
    expect(getByText(/automatically renew/)).toBeTruthy();
    fireEvent.press(getByText('Lifetime'));
    expect(queryByText(/automatically renew/)).toBeNull();
    expect(getByText(/one-time purchase/)).toBeTruthy();
  });

  it('tells someone who is already premium so, with nothing to buy', () => {
    purchase({ isPremium: true });
    const { getByText, queryByText } = renderPaywall('strength_score');
    expect(getByText("You're Premium")).toBeTruthy();
    expect(queryByText('Annual')).toBeNull();
    expect(queryByText('Restore Purchases')).toBeNull();
    fireEvent.press(getByText('Done'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  // Apple rejects subscription apps whose purchase screen lacks these (guideline 3.1.2)
  it('links to the Terms of Use and Privacy Policy', () => {
    const { getByText } = renderPaywall();
    fireEvent.press(getByText('Terms of Use'));
    expect(openExternalLink).toHaveBeenCalledWith('https://aretefitnessapp.com/terms');
    fireEvent.press(getByText('Privacy Policy'));
    expect(openExternalLink).toHaveBeenCalledWith('https://aretefitnessapp.com/privacy');
  });
});
