/**
 * Share cards are rendered off-screen and captured as an image, so nothing on
 * screen reveals a broken one: it ships as a blank or wrong PNG. These check
 * each card renders and puts the numbers it was given on the card.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import PRShareCard from '../components/share/PRShareCard';
import StrengthScoreShareCard from '../components/share/StrengthScoreShareCard';
import EnduranceScoreShareCard from '../components/share/EnduranceScoreShareCard';
import WeeklySummaryShareCard from '../components/share/WeeklySummaryShareCard';
import WorkoutShareCard from '../components/share/WorkoutShareCard';
import CardioShareCard from '../components/share/CardioShareCard';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const ACCENT = '#4F8EF7';

describe('share cards', () => {
  it('PR card shows the lift, the value and the improvement', () => {
    const { getByText } = render(
      <PRShareCard exerciseName="Bench Press" prLabel="Max Weight" value="245 lbs" delta="+10 lbs" date="Sep 20, 2026" accentColor={ACCENT} />,
    );
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('245 lbs')).toBeTruthy();
    expect(getByText(/\+10 lbs/)).toBeTruthy();   // rendered with a ▲ prefix
  });

  it('PR card leaves the delta off a first-ever PR', () => {
    const { queryByText, getByText } = render(
      <PRShareCard exerciseName="Squat" prLabel="Max Weight" value="315 lbs" delta={null} date="Sep 20, 2026" accentColor={ACCENT} />,
    );
    expect(getByText('315 lbs')).toBeTruthy();
    expect(queryByText(/^\+/)).toBeNull();
  });

  it('Strength Score card shows the score, rank and what it was based on', () => {
    const { getByText } = render(
      <StrengthScoreShareCard score={62} rankLabel="Advanced" exercisesUsed={4} muscleGroupsUsed={3} accentColor={ACCENT} date="Sep 20, 2026" />,
    );
    expect(getByText('62')).toBeTruthy();
    expect(getByText('Advanced')).toBeTruthy();
    expect(getByText('Exercises')).toBeTruthy();
  });

  it('Strength Score card singularises a one-exercise score', () => {
    const { getByText } = render(
      <StrengthScoreShareCard score={20} rankLabel="Novice" exercisesUsed={1} muscleGroupsUsed={1} accentColor={ACCENT} date="Sep 20, 2026" />,
    );
    expect(getByText('Exercise')).toBeTruthy();
    expect(getByText('Muscle Group')).toBeTruthy();
  });

  it('Endurance Score card shows the best time and its distance', () => {
    const { getByText } = render(
      <EnduranceScoreShareCard score={55} rankLabel="Intermediate" longestDistance="10K" bestTime="25:00" bestTimeLabel="5K Time" accentColor={ACCENT} date="Sep 20, 2026" />,
    );
    expect(getByText('55')).toBeTruthy();
    expect(getByText('25:00')).toBeTruthy();
    expect(getByText('5K Time')).toBeTruthy();
  });

  it('Weekly summary card shows the week and its totals', () => {
    const { getByText, queryByText } = render(
      <WeeklySummaryShareCard
        dateRange="Sep 14 - Sep 20" workouts={4} totalVolume={42000} totalReps={520}
        totalDurationMin={240} weightUnit="lbs" prCount={2} topMuscle="Chest" streak={3} accentColor={ACCENT}
      />,
    );
    expect(getByText('Sep 14 - Sep 20')).toBeTruthy();
    // The streak highlight carries the drawn flame, not a fire emoji
    expect(getByText('3 week streak')).toBeTruthy();
    expect(queryByText(/\u{1F525}/u)).toBeNull();
    expect(getByText('4')).toBeTruthy();
    expect(getByText('520')).toBeTruthy();
  });

  it('Workout card lists the workout and its exercises', () => {
    const { getByText } = render(
      <WorkoutShareCard
        workoutName="Push Day" date="Sep 20, 2026" totalVolume={12000} totalSets={16} totalReps={120}
        duration={62} weightUnit="lbs"
        exercises={[{ name: 'Bench Press', sets: 4 } as any]}
        prs={[{ exercise_name: 'Bench Press', pr_type: 'max_weight' }]}
        accentColor={ACCENT}
      />,
    );
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('Bench Press')).toBeTruthy();
  });

  it('Cardio card shows distance and duration, with no route needed', () => {
    const { getByText } = render(
      <CardioShareCard activityName="Running" date="Sep 20, 2026" distance={5} distanceUnit="km" durationMin={30} accentColor={ACCENT} />,
    );
    expect(getByText('Running')).toBeTruthy();
    expect(getByText(/5\.00/)).toBeTruthy();
  });

  it('Cardio card draws the route when one was recorded', () => {
    const coords = [
      { latitude: 40.0, longitude: -75.0 },
      { latitude: 40.01, longitude: -75.01 },
      { latitude: 40.02, longitude: -75.005 },
    ];
    const { getByText } = render(
      <CardioShareCard activityName="Trail Run" date="Sep 20, 2026" distance={3.1} distanceUnit="mi" durationMin={28} elevationM={120} coords={coords} accentColor={ACCENT} />,
    );
    expect(getByText('Trail Run')).toBeTruthy();
    expect(getByText(/3\.10/)).toBeTruthy();
  });
});
