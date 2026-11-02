// These are two separate ranking systems from GREEK_RANK_COLORS
// (constants/greekRanks.ts) — per-lift/overall percentile vs. the whole-
// account Greek rank — but an earlier version of this palette reused the
// exact same 5 non-gold hex values, so a badge's color alone couldn't tell
// you which system it belonged to. Novice–Elite are now deliberately
// distinct from Greek's ramp; Legend keeps gold on purpose (top-tier still
// reads as gold, matching PR_GOLD/Aretē's established convention). `icon`
// gives every tier a second, color-independent differentiator (shape, not
// just hue) — helps colorblind users and anyone glancing at a small badge.
export const STRENGTH_TIERS = [
  { label: 'Novice',       low: 0,  high: 10,  color: '#9CA3AF', icon: 'ellipse-outline'  as const },
  { label: 'Beginner',     low: 10, high: 30,  color: '#38BDF8', icon: 'triangle-outline' as const },
  { label: 'Intermediate', low: 30, high: 60,  color: '#34D399', icon: 'square-outline'   as const },
  { label: 'Advanced',     low: 60, high: 80,  color: '#FB923C', icon: 'diamond-outline'  as const },
  { label: 'Elite',        low: 80, high: 95,  color: '#C084FC', icon: 'star-outline'     as const },
  { label: 'Legend',       low: 95, high: 100, color: '#FFD700', icon: 'star'             as const },
];

export const SCORE_RANK_COLORS: Record<string, string> = Object.fromEntries(
  STRENGTH_TIERS.map(t => [t.label, t.color]),
);

// The tier colors as TEXT (rank names, the ring's numeral, badge icons) in
// light mode, where the bright ones are 1.4 to 2.6:1 on white. Each is 4.5:1 or
// better on the light background and surface. Dark mode keeps the tier color
// (6.4:1 or better on its surface), and rings, bars and borders always do.
const SCORE_RANK_LIGHT_TEXT: Record<string, string> = {
  Novice:       '#4B5563',
  Beginner:     '#0369A1',
  Intermediate: '#047857',
  Advanced:     '#C2410C',
  Elite:        '#7E22CE',
  Legend:       '#7A6000',
};

export function scoreRankTextColor(label: string | undefined, mode: 'dark' | 'light', fallback: string): string {
  if (!label || !(label in SCORE_RANK_COLORS)) return fallback;
  return mode === 'light' ? SCORE_RANK_LIGHT_TEXT[label] : SCORE_RANK_COLORS[label];
}

export const SCORE_RANK_ICONS: Record<string, typeof STRENGTH_TIERS[number]['icon']> = Object.fromEntries(
  STRENGTH_TIERS.map(t => [t.label, t.icon]),
);
