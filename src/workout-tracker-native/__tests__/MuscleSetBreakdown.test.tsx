import React from 'react';
import { render } from '@testing-library/react-native';
import MuscleSetBreakdown from '../components/MuscleSetBreakdown';
import MuscleDiagram from '../components/MuscleDiagram';
import type { MuscleSetCount } from '../utils/muscleSetCounts';

const mockDiagramProps = jest.fn();
jest.mock('../components/MuscleDiagram', () => {
  const Actual = jest.requireActual('../components/MuscleDiagram').default;
  return { __esModule: true, default: (props: any) => { mockDiagramProps(props); return <Actual {...props} />; } };
});

const mockBodyProps = jest.fn();
jest.mock('react-native-body-highlighter', () => ({
  __esModule: true,
  default: (props: any) => { mockBodyProps(props); return null; },
}));

let mockGender: string | null = null;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, gender: mockGender } }),
}));

const counts: MuscleSetCount[] = [
  { muscle: 'Chest', done: 2, planned: 3, primary: true },
  { muscle: 'Triceps', done: 1, planned: 1.5, primary: false },
];

beforeEach(() => {
  mockDiagramProps.mockClear();
  mockBodyProps.mockClear();
  mockGender = null;
});

describe('MuscleSetBreakdown', () => {
  it('shows sets done of planned per muscle, with secondary movers under their own label', () => {
    const { getByLabelText, getByText } = render(<MuscleSetBreakdown counts={counts} />);
    expect(getByLabelText('Chest, 2 of 3 sets done')).toBeTruthy();
    expect(getByLabelText('Triceps, 1 of 1.5 sets done')).toBeTruthy();
    expect(getByText('Secondary')).toBeTruthy();
  });

  it('shows plain counts for a logged workout', () => {
    const { getByLabelText } = render(<MuscleSetBreakdown counts={counts} logged />);
    expect(getByLabelText('Chest, 2 sets')).toBeTruthy();
    expect(getByLabelText('Triceps, 1 set')).toBeTruthy();
  });

  it('shades the diagram by sets done', () => {
    render(<MuscleSetBreakdown counts={[...counts, { muscle: 'Biceps', done: 0, planned: 2, primary: true }]} />);
    const { muscleColors } = mockDiagramProps.mock.calls[0][0];
    // ThemeContext's jest mock accent, with each level's alpha
    const accent = muscleColors.Chest.slice(0, 7);
    expect(muscleColors).toEqual({ Biceps: `${accent}40`, Triceps: `${accent}73`, Chest: `${accent}73` });
  });
});

describe('MuscleDiagram figure', () => {
  it('draws the female figure for a female profile', () => {
    mockGender = 'female';
    render(<MuscleDiagram muscles={['Chest']} />);
    expect(mockBodyProps.mock.calls.map(c => c[0].gender)).toEqual(['female', 'female']);
  });

  it('keeps the male figure when no gender is set', () => {
    render(<MuscleDiagram muscles={['Chest']} />);
    expect(mockBodyProps.mock.calls.map(c => c[0].gender)).toEqual(['male', 'male']);
  });
});
