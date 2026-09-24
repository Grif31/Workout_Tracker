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
