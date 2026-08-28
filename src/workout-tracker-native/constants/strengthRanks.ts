// These are two separate ranking systems from GREEK_RANK_COLORS
// (constants/greekRanks.ts) — per-lift/overall percentile vs. the whole-
// account Greek rank — but an earlier version of this palette reused the
// exact same 5 non-gold hex values, so a badge's color alone couldn't tell
// you which system it belonged to. Noobie–Elite are now deliberately
// distinct from Greek's ramp; Legend keeps gold on purpose (top-tier still
// reads as gold, matching PR_GOLD/Aretē's established convention). `icon`
// gives every tier a second, color-independent differentiator (shape, not
// just hue) — helps colorblind users and anyone glancing at a small badge.
export const STRENGTH_TIERS = [
  { label: 'Noobie',       low: 0,  high: 10,  color: '#9CA3AF', icon: 'ellipse-outline'  as const },
  { label: 'Beginner',     low: 10, high: 30,  color: '#38BDF8', icon: 'triangle-outline' as const },
  { label: 'Intermediate', low: 30, high: 60,  color: '#34D399', icon: 'square-outline'   as const },
  { label: 'Advanced',     low: 60, high: 80,  color: '#FB923C', icon: 'diamond-outline'  as const },
  { label: 'Elite',        low: 80, high: 95,  color: '#C084FC', icon: 'star-outline'     as const },
  { label: 'Legend',       low: 95, high: 100, color: '#FFD700', icon: 'star'             as const },
];

export const SCORE_RANK_COLORS: Record<string, string> = Object.fromEntries(
  STRENGTH_TIERS.map(t => [t.label, t.color]),
);

export const SCORE_RANK_ICONS: Record<string, typeof STRENGTH_TIERS[number]['icon']> = Object.fromEntries(
  STRENGTH_TIERS.map(t => [t.label, t.icon]),
);
