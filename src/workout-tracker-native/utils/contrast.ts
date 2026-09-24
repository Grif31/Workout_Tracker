// Readable ink for text sitting on a solid color. Which ink wins has to be
// measured, not assumed: white clears WCAG AA on only one of the seven rank
// colors, and on Aretē gold it lands at 1.4:1.

const ON_LIGHT = '#1a1a1a';
const ON_DARK  = '#fff';

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return 0.2126 * channel(parseInt(full.slice(0, 2), 16))
       + 0.7152 * channel(parseInt(full.slice(2, 4), 16))
       + 0.0722 * channel(parseInt(full.slice(4, 6), 16));
}

const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Whichever of near-black or white contrasts better against `hex`. */
export function contrastTextColor(hex: string): string {
  const lum = relativeLuminance(hex);
  return ratio(lum, relativeLuminance(ON_LIGHT)) >= ratio(lum, relativeLuminance(ON_DARK))
    ? ON_LIGHT
    : ON_DARK;
}
