export const GREEK_RANK_COLORS: Record<string, string> = {
  Neophyte: '#888888',
  Athlete:  '#4A9EFF',
  Hero:     '#4CAF50',
  Demigod:  '#FF9800',
  Olympian: '#9C27B0',
  Titan:    '#E53935',
  'Aretē':  '#FFD700',
};

export const GREEK_RANKS = [
  { name: 'Neophyte', color: GREEK_RANK_COLORS.Neophyte, low: 0,  high: 12,  icon: 'N' },
  { name: 'Athlete',  color: GREEK_RANK_COLORS.Athlete,  low: 12, high: 28,  icon: 'A' },
  { name: 'Hero',     color: GREEK_RANK_COLORS.Hero,     low: 28, high: 48,  icon: 'H' },
  { name: 'Demigod',  color: GREEK_RANK_COLORS.Demigod,  low: 48, high: 65,  icon: 'D' },
  { name: 'Olympian', color: GREEK_RANK_COLORS.Olympian, low: 65, high: 80,  icon: 'O' },
  { name: 'Titan',    color: GREEK_RANK_COLORS.Titan,    low: 80, high: 92,  icon: 'T' },
  { name: 'Aretē',    color: GREEK_RANK_COLORS['Aretē'], low: 92, high: 100, icon: 'Ā' },
];
