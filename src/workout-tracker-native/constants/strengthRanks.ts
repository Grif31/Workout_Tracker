export const STRENGTH_TIERS = [
  { label: 'Noobie',       low: 0,  high: 10,  color: '#888888' },
  { label: 'Beginner',     low: 10, high: 30,  color: '#4A9EFF' },
  { label: 'Intermediate', low: 30, high: 60,  color: '#4CAF50' },
  { label: 'Advanced',     low: 60, high: 80,  color: '#FF9800' },
  { label: 'Elite',        low: 80, high: 95,  color: '#9C27B0' },
  { label: 'Legend',       low: 95, high: 100, color: '#FFD700' },
];

export const SCORE_RANK_COLORS: Record<string, string> = Object.fromEntries(
  STRENGTH_TIERS.map(t => [t.label, t.color]),
);
