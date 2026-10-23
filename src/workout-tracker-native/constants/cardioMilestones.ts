// Mirrors CARDIO_DISTANCE_MILESTONES / CARDIO_DURATION_MILESTONES in
// src/utils/endurance_standards.py. These exact floats are the `weight_context`
// join key that cardio PR rows are written with, so a value that drifts from
// the Python list writes PRs nothing can ever read back. __tests__/
// cardioMilestones.test.ts parses the Python file and fails if they diverge.

export const CARDIO_DISTANCE_MILESTONES: [number, string][] = [
  [0.4, '400m'],
  [0.8, '800m'],
  [1.0, '1K'],
  [1.60934, '1 Mile'],
  [5.0, '5K'],
  [10.0, '10K'],
  [21.0975, 'Half Marathon'],
  [42.195, 'Marathon'],
];

export const CARDIO_DURATION_MILESTONES: [number, string][] = [
  [10.0, '10 min'],
  [20.0, '20 min'],
  [30.0, '30 min'],
  [60.0, '60 min'],
];

// Rides' own milestones, mirroring CYCLING_DISTANCE_MILESTONES /
// CYCLING_DURATION_MILESTONES (same test). Which list an exercise uses is
// isCycling on its name, on both sides.
export const CYCLING_DISTANCE_MILESTONES: [number, string][] = [
  [5.0, '5K'],
  [10.0, '10K'],
  [16.0934, '10 Mile'],
  [20.0, '20K'],
  [40.0, '40K'],
  [50.0, '50K'],
  [80.4672, '50 Mile'],
  [100.0, '100K'],
  [160.934, '100 Mile'],
];

export const CYCLING_DURATION_MILESTONES: [number, string][] = [
  [10.0, '10 min'],
  [20.0, '20 min'],
  [30.0, '30 min'],
  [60.0, '60 min'],
  [120.0, '2 hr'],
];
