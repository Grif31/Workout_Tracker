/**
 * Greek Rank intro: a static explainer reachable after the first workout and
 * from GreekRankScreen's info button. It takes no data, so what matters is
 * that it lists the ranks and that its back arrow leaves the screen.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import GreekRankIntroScreen from '../screens/DashboardTab/GreekRankIntroScreen';
import { GREEK_RANKS } from '../constants/greekRanks';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('GreekRankIntro');

function renderScreen() {
  const nav = createMockNavigation();
  return { ...render(<GreekRankIntroScreen navigation={nav as any} route={route as any} />), nav };
}

describe('GreekRankIntroScreen', () => {
  it('explains what the rank is and how it is earned', () => {
    const { getByText } = renderScreen();
    expect(getByText('What is Greek Rank?')).toBeTruthy();
    expect(getByText('How Ranks Are Earned')).toBeTruthy();
  });

  it('lists every rank on the path', () => {
    const { getAllByText } = renderScreen();
    for (const rank of GREEK_RANKS) {
      expect(getAllByText(rank.name).length).toBeGreaterThan(0);
    }
  });

  it('goes back to wherever it was opened from', () => {
    // From GreekRankScreen's info button, where navigating to the dashboard
    // would drop the user out of the Profile tab
    const nav = createMockNavigation({ canGoBack: jest.fn(() => true) });
    const { getByLabelText } = render(<GreekRankIntroScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByLabelText('Go back'));
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('falls back to the dashboard with nothing to go back to', () => {
    const { getByLabelText, nav } = renderScreen();
    fireEvent.press(getByLabelText('Go back'));
    expect(nav.navigate).toHaveBeenCalledWith('DashboardHome');
  });

  it('has no call to action button', () => {
    const { queryByText } = renderScreen();
    expect(queryByText('Start My Journey')).toBeNull();
  });

  it('describes the score without leaning on the reader being new', () => {
    const { getByText, queryByText } = renderScreen();
    expect(getByText(/a single score, from 0 to 100/)).toBeTruthy();
    expect(queryByText('Your first rank in the ancient order')).toBeNull();
  });
});
