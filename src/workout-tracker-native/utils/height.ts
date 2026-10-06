// Height is stored in inches. These turn it into what the form fields show.

/** Whole feet and inches. Rounds the total first, so 71.6 in is 6 ft 0, never 5 ft 12. */
export function inchesToFtIn(inches: number): { ft: number; inch: number } {
  const total = Math.round(inches);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

export const inchesToCm = (inches: number): number => Math.round(inches * 2.54);

/** Inches from the ft/in fields, or null when both are empty. */
export function ftInToInches(ft: string, inch: string): number | null {
  if (!ft.trim() && !inch.trim()) return null;
  return (parseInt(ft || '0', 10) || 0) * 12 + (parseFloat(inch || '0') || 0);
}

/** Inches from the cm field, or null when it is empty. */
export function cmToInches(cm: string): number | null {
  const n = parseFloat(cm);
  return cm.trim() && n > 0 ? n / 2.54 : null;
}
