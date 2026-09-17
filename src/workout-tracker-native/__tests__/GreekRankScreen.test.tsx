import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import GreekRankScreen from '../screens/ProfileTab/GreekRankScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('GreekRank');

// The 45% performance slot is max(strength, endurance). `overall` and
// `endurance_overall` are null when the user has no data for that side.
function payload(strength: number | null, endurance: number | null) {
  const s = strength ?? 0;
  const e = endurance ?? 0;
  return {
    greek_rank: 'Hoplite',
    greek_score: 40,
    overall: strength,
    endurance_overall: endurance,
    greek_score_components: {
      consistency: 60,
      strength: s,
      endurance: e,
      performance: Math.max(s, e),
      dedication: 30,
      volume: 50,
    },
  };
}

async function renderWith(strength: number | null, endurance: number | null) {
  mockFetch(payload(strength, endurance));
  const nav = createMockNavigation();
  const utils = render(<GreekRankScreen navigation={nav as any} route={route as any} />);
  await waitFor(() => expect(utils.getByText('Performance')).toBeTruthy());
  return { ...utils, nav };
}

describe('GreekRankScreen score breakdown', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('highlights Endurance for a cardio-only user and dashes the missing Strength score', async () => {
    const { getByTestId, queryByTestId, getByText, getAllByText } = await renderWith(null, 67);
    expect(getByTestId('greek-leg-endurance-counts')).toBeTruthy();
    expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
    expect(getByText('–')).toBeTruthy();
    // Once on Performance (which took the endurance score) and once on Endurance
    expect(getAllByText('67')).toHaveLength(2);
  });

  it('highlights Strength for a lifter who has never run', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderWith(72, null);
    expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
    expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    expect(getByText('–')).toBeTruthy();
  });

  it('highlights the higher score for a hybrid athlete', async () => {
    const { getByTestId, queryByTestId } = await renderWith(41, 67);
    expect(getByTestId('greek-leg-endurance-counts')).toBeTruthy();
    expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
  });

  it('gives a tie to Strength, matching the backend', async () => {
    const { getByTestId, queryByTestId } = await renderWith(55, 55);
    expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
    expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
  });

  it('highlights neither when there is no data on either side', async () => {
    const { queryByTestId, getAllByText } = await renderWith(null, null);
    expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
    expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    expect(getAllByText('–')).toHaveLength(2);
  });

  it('links to both full score screens', async () => {
    const { getByText, nav } = await renderWith(41, 67);
    fireEvent.press(getByText('Strength Score'));
    expect(nav.navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'StrengthScore', initial: false });
    fireEvent.press(getByText('Endurance Score'));
    expect(nav.navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'EnduranceScore', initial: false });
  });
});
