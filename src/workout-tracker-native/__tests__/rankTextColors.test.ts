/**
 * Rank names are text, and the bright rank colors fail as text in light mode
 * (Aretē gold 1.4:1 on white). These hold every rank's text color to WCAG AA,
 * 4.5:1, on the backgrounds it is drawn on.
 */
import { GREEK_RANKS, rankTextColor } from '../constants/greekRanks';
import { STRENGTH_TIERS, scoreRankTextColor } from '../constants/strengthRanks';
// jest.setup.ts mocks ThemeContext; these are the real palettes
const { LIGHT_BASE, DARK_BASE } = jest.requireActual('../context/ThemeContext');

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = {
  light: [LIGHT_BASE.surface, LIGHT_BASE.background],
  dark: [DARK_BASE.surface, DARK_BASE.background],
} as const;

describe.each(['light', 'dark'] as const)('rank text in %s mode', mode => {
  it.each(GREEK_RANKS.map(r => [r.name, r.color]))('Greek Rank %s reads at 4.5:1', (name, color) => {
    for (const bg of BACKGROUNDS[mode]) expect(contrast(rankTextColor(name, color, mode), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STRENGTH_TIERS.map(t => [t.label]))('score tier %s reads at 4.5:1', label => {
    for (const bg of BACKGROUNDS[mode]) expect(contrast(scoreRankTextColor(label, mode, '#000000'), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

it('falls back for a name that is not a rank', () => {
  expect(rankTextColor('Unknown', '#123456', 'light')).toBe('#123456');
  expect(scoreRankTextColor(undefined, 'light', '#123456')).toBe('#123456');
});

it.each(['light', 'dark'] as const)('set-type markers read at 4.5:1 in %s mode', mode => {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  expect(contrast(base.warmup, base.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(base.dropset, base.surface)).toBeGreaterThanOrEqual(4.5);
});
