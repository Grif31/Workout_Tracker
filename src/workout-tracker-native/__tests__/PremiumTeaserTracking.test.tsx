/**
 * A locked teaser tells the admin's Paywall page a free user saw it, so the
 * page can count how many who saw it went on to open the paywall.
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import PremiumTeaser from '../components/PremiumTeaser';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('../utils/paywallEvents', () => ({ trackUpsellShown: jest.fn() }));
const { trackUpsellShown } = require('../utils/paywallEvents');

const teaser = (locked: boolean) => (
  <PremiumTeaser locked={locked} source="muscle_volume" title="Muscle volume" body="See your zones">
    <Text>Chest 12 sets</Text>
  </PremiumTeaser>
);

describe('PremiumTeaser tracking', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records a locked teaser with its source', () => {
    render(teaser(true));
    expect(trackUpsellShown).toHaveBeenCalledWith('muscle_volume');
  });

  it('records nothing for a subscriber', () => {
    render(teaser(false));
    expect(trackUpsellShown).not.toHaveBeenCalled();
  });
});
