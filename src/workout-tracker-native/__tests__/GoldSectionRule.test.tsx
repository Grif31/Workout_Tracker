import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import GoldSectionRule from '../components/GoldSectionRule';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

describe('GoldSectionRule', () => {
  it('renders the label', () => {
    const { getByText } = render(<GoldSectionRule icon="trophy-outline" label="Recent PRs" />);
    expect(getByText('Recent PRs')).toBeTruthy();
  });

  it('renders an optional trailing accessory', () => {
    const { getByText } = render(
      <GoldSectionRule icon="trophy-outline" label="Recent PRs" right={<Text>Loading</Text>} />,
    );
    expect(getByText('Loading')).toBeTruthy();
  });

  it('omits the trailing accessory when not provided', () => {
    const { queryByText } = render(<GoldSectionRule icon="trophy-outline" label="Recent PRs" />);
    expect(queryByText('Loading')).toBeNull();
  });
});
