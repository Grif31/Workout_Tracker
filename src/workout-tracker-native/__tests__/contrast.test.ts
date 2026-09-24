import { contrastTextColor } from '../utils/contrast';
import { GREEK_RANK_COLORS } from '../constants/greekRanks';

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return 0.2126 * channel(parseInt(full.slice(0, 2), 16))
       + 0.7152 * channel(parseInt(full.slice(2, 4), 16))
       + 0.0722 * channel(parseInt(full.slice(4, 6), 16));
};
const ratio = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

describe('contrastTextColor', () => {
  it('picks dark ink on light backgrounds and white on dark ones', () => {
    expect(contrastTextColor('#FFD700')).toBe('#1a1a1a'); // Aretē gold
    expect(contrastTextColor('#9C27B0')).toBe('#fff');    // Olympian purple
  });

  it('beats plain white on every rank colour', () => {
    for (const [rank, color] of Object.entries(GREEK_RANK_COLORS)) {
      const picked = ratio(color, contrastTextColor(color));
      expect(`${rank}:${(picked >= ratio(color, '#fff')).toString()}`).toBe(`${rank}:true`);
    }
  });

  it('clears WCAG AA on all but the one colour that cannot', () => {
    const failing = Object.entries(GREEK_RANK_COLORS)
      .filter(([, color]) => ratio(color, contrastTextColor(color)) < 4.5)
      .map(([rank]) => rank);
    // Titan red tops out at 4.47:1 against either ink
    expect(failing).toEqual(['Titan']);
  });

  it('handles shorthand hex', () => {
    expect(contrastTextColor('#fff')).toBe('#1a1a1a');
    expect(contrastTextColor('#000')).toBe('#fff');
  });
});
