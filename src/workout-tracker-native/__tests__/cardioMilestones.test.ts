import fs from 'fs';
import path from 'path';
import {
  CARDIO_DISTANCE_MILESTONES,
  CARDIO_DURATION_MILESTONES,
} from '../constants/cardioMilestones';

// These floats are the weight_context a cardio PR row is written with. If the
// TS copy drifts from the Python source, the app writes PRs keyed to a value
// no lookup ever asks for and they silently vanish from every screen.
const SOURCE = path.join(__dirname, '..', '..', 'utils', 'endurance_standards.py');

function parsePythonList(source: string, name: string): [number, string][] {
  const block = new RegExp(`${name} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (!block) throw new Error(`${name} not found in endurance_standards.py`);
  return [...block[1].matchAll(/\(\s*([\d.]+)\s*,\s*'([^']+)'\s*\)/g)]
    .map(m => [parseFloat(m[1]), m[2]] as [number, string]);
}

describe('cardio milestones match the backend', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');

  it('uses the same distance milestones as endurance_standards.py', () => {
    expect(CARDIO_DISTANCE_MILESTONES).toEqual(parsePythonList(source, 'CARDIO_DISTANCE_MILESTONES'));
  });

  it('uses the same duration milestones as endurance_standards.py', () => {
    expect(CARDIO_DURATION_MILESTONES).toEqual(parsePythonList(source, 'CARDIO_DURATION_MILESTONES'));
  });
});
