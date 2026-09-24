/**
 * The range menu has to open at the chart's range button, not at a fixed spot
 * near the top of the screen (the old top: 120 placement).
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import RangePickerModal, { type MenuAnchor } from '../components/coach/RangePickerModal';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));

const { width: W, height: H } = Dimensions.get('window');
const MENU_HEIGHT = 180;

function renderMenu(anchor: MenuAnchor | null, onSelect = jest.fn()) {
  const utils = render(
    <RangePickerModal visible chartRange="30d" anchor={anchor} onSelect={onSelect} onClose={jest.fn()} />,
  );
  const menu = utils.getByTestId('range-menu');
  const style = () => StyleSheet.flatten(menu.props.style);
  const layout = () => fireEvent(menu, 'layout', { nativeEvent: { layout: { height: MENU_HEIGHT } } });
  return { ...utils, menu, style, layout, onSelect };
}

describe('RangePickerModal', () => {
  it('lists all four ranges, including 3 months', () => {
    const { getByText } = renderMenu({ x: 300, y: 400, width: 50, height: 24 });
    for (const label of ['Last 30 Days', 'Last 3 Months', 'Last 6 Months', 'Last Year']) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('opens just below the button, right edges aligned', () => {
    const anchor = { x: 300, y: 400, width: 50, height: 24 };
    const { style, layout } = renderMenu(anchor);
    layout();
    expect(style().top).toBe(400 + 24 + 4);
    expect(style().right).toBe(W - (300 + 50));
    expect(style().opacity).toBeUndefined();
  });

  it('flips above the button when there is no room below', () => {
    const anchor = { x: 300, y: H - 60, width: 50, height: 24 };
    const { style, layout } = renderMenu(anchor);
    layout();
    expect(style().top).toBe(H - 60 - 4 - MENU_HEIGHT);
  });

  it('stays hidden until both the button position and its own height are known', () => {
    expect(renderMenu(null).style().opacity).toBe(0);
    const measured = renderMenu({ x: 300, y: 400, width: 50, height: 24 });
    expect(measured.style().opacity).toBe(0);   // before onLayout
    measured.layout();
    expect(measured.style().opacity).toBeUndefined();
  });

  it('reports the picked range', () => {
    const { getByText, onSelect } = renderMenu({ x: 300, y: 400, width: 50, height: 24 });
    fireEvent.press(getByText('Last 3 Months'));
    expect(onSelect).toHaveBeenCalledWith('3m');
  });
});
