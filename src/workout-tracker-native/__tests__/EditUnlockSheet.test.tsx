import React from 'react';
import { act, render } from '@testing-library/react-native';
import EditUnlockSheet from '../components/achievements/EditUnlockSheet';

let mockSheet: any = null;
jest.mock('../components/achievements/AchievementUnlockSheet', () => (props: any) => { mockSheet = props; return null; });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, weight_unit: 'kg' } }) }));
jest.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const badge = { key: 'plates_bench_1', title: '1 Plate Bench', earned_at: '2026-11-09T10:00:00', workout_id: 3 } as any;

describe('EditUnlockSheet', () => {
  beforeEach(() => { mockSheet = null; jest.useFakeTimers(); });
  afterEach(() => jest.useRealTimers());

  it('shows nothing when the edit earned nothing', () => {
    const onTaken = jest.fn();
    render(<EditUnlockSheet items={undefined} onTaken={onTaken} />);
    expect(mockSheet).toBeNull();
    expect(onTaken).not.toHaveBeenCalled();
  });

  it('takes the badges off the route and opens once the editor has popped', () => {
    const onTaken = jest.fn();
    const { rerender } = render(<EditUnlockSheet items={[badge]} onTaken={onTaken} />);
    expect(onTaken).toHaveBeenCalledTimes(1);
    // The route param is cleared; the sheet keeps what it was handed
    rerender(<EditUnlockSheet items={undefined} onTaken={onTaken} />);
    expect(mockSheet.visible).toBe(false);
    act(() => { jest.advanceTimersByTime(500); });
    expect(mockSheet.visible).toBe(true);
    expect(mockSheet.items).toEqual([badge]);
    expect(mockSheet.weightUnit).toBe('kg');
    act(() => mockSheet.onClose());
    expect(mockSheet.visible).toBe(false);
  });
});
