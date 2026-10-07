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
        workoutName="Push Day" date="Sep 20, 2026" volumeText="5,443" totalSets={16} totalReps={120}
        duration={62} weightUnit="kg"
        exercises={[{ name: 'Bench Press', bestSet: { reps: 5, weight: 100 } }]}
        prs={[{ exercise_name: 'Bench Press', pr_type: 'max_weight' }]}
        accentColor={ACCENT}
      />,
    );
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('Bench Press')).toBeTruthy();
    // Shown as given: the caller already converted the API's lbs total
    expect(getByText('5,443')).toBeTruthy();
    expect(getByText('Total Volume (kg)')).toBeTruthy();
    // Reps first, like the workout log
    expect(getByText('5 × 100 kg')).toBeTruthy();
  });

  it('Workout card leads with reps when there is no volume', () => {
    const { getByText, queryByText } = render(
      <WorkoutShareCard
        workoutName="Calisthenics" date="Sep 20, 2026" volumeText={null} totalSets={6} totalReps={90}
        weightUnit="lbs" exercises={[]} prs={[]} accentColor={ACCENT}
      />,
    );
    expect(getByText('Total Reps')).toBeTruthy();
    expect(queryByText(/Total Volume/)).toBeNull();
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

  describe('never leads with a zero', () => {
    it('a cardio-only week leads with its distance', () => {
      const { getByText, queryByText } = render(
        <WeeklySummaryShareCard
          dateRange="Sep 14 - Sep 20" workouts={3} totalVolume={0} totalReps={0} totalDurationMin={95}
          weightUnit="lbs" distance={12.44} distanceUnit="mi" prCount={0} accentColor={ACCENT}
        />,
      );
      expect(getByText('12.4')).toBeTruthy();
      expect(getByText('Distance (mi)')).toBeTruthy();
      expect(queryByText('Total Reps')).toBeNull();
      expect(queryByText('Reps')).toBeNull();
    });

    it('a week with nothing to total leads with its workouts', () => {
      const { getByText } = render(
        <WeeklySummaryShareCard
          dateRange="Sep 14 - Sep 20" workouts={2} totalVolume={0} totalReps={0} totalDurationMin={40}
          weightUnit="lbs" prCount={0} accentColor={ACCENT}
        />,
      );
      // Once, as the headline: not again in the stats row
      expect(getByText('Workouts')).toBeTruthy();
      expect(getByText('Training Time')).toBeTruthy();
    });

    it('a lifting week still shows the distance run beside its totals', () => {
      const { getByText } = render(
        <WeeklySummaryShareCard
          dateRange="Sep 14 - Sep 20" workouts={4} totalVolume={42000} totalReps={520} totalDurationMin={240}
          weightUnit="lbs" distance={5} distanceUnit="km" prCount={0} accentColor={ACCENT}
        />,
      );
      expect(getByText('Total Volume (lbs)')).toBeTruthy();
      expect(getByText('Km')).toBeTruthy();
      expect(getByText('5.0')).toBeTruthy();
    });

    it('a session of holds leads with time under tension', () => {
      const { getByText, queryByText } = render(
        <WorkoutShareCard
          workoutName="Core" date="Sep 20, 2026" volumeText={null} totalSets={4} totalReps={0} holdMinutes={3.5}
          weightUnit="lbs" exercises={[{ name: 'Plank', bestSet: null }]} prs={[]} accentColor={ACCENT}
        />,
      );
      expect(getByText('3:30')).toBeTruthy();
      expect(getByText('Total Hold Time')).toBeTruthy();
      expect(queryByText('Total Reps')).toBeNull();
      expect(queryByText('Reps')).toBeNull();
      expect(getByText('4')).toBeTruthy();   // the sets still count
    });

    it('time-only cardio leads with the duration, with no pace', () => {
      const { getByText, queryByText } = render(
        <CardioShareCard activityName="Stair Climber" date="Sep 20, 2026" distance={0} distanceUnit="mi" durationMin={25} accentColor={ACCENT} />,
      );
      expect(getByText('25m 0s')).toBeTruthy();
      expect(getByText('Duration')).toBeTruthy();
      expect(queryByText(/0\.00/)).toBeNull();
      expect(queryByText(/Pace/)).toBeNull();
    });
  });

  it('Cardio card gives elevation in feet to a miles user and metres to a km user', () => {
    const card = (unit: 'mi' | 'km') => render(
      <CardioShareCard activityName="Hill Run" date="Sep 20, 2026" distance={3} distanceUnit={unit} durationMin={30} elevationM={120} accentColor={ACCENT} />,
    );
    expect(card('mi').getByText('394 ft')).toBeTruthy();
    expect(card('km').getByText('120 m')).toBeTruthy();
  });

  it('score cards say what the number means', () => {
    expect(render(
      <StrengthScoreShareCard score={62} rankLabel="Advanced" exercisesUsed={4} muscleGroupsUsed={3} accentColor={ACCENT} date="Sep 20, 2026" />,
    ).getByText('Stronger than 62% of lifters')).toBeTruthy();
    expect(render(
      <EnduranceScoreShareCard score={55.4} rankLabel="Intermediate" longestDistance="10K" bestTime="25:00" bestTimeLabel="5K Time" accentColor={ACCENT} date="Sep 20, 2026" />,
    ).getByText('Faster than 55% of runners')).toBeTruthy();
  });
});
