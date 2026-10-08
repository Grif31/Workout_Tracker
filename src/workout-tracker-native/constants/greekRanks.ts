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

// Each rank's color when it is TEXT (the rank name on a widget), per
// background. GREEK_RANK_COLORS stays the badge and bar color; as text it fails
// 4.5:1 on one side or the other (Olympian purple on dark 2.7:1, Hero green,
// Athlete blue and Demigod orange on white under 3:1). Each value here is 4.5:1
// or better on the widget surfaces, #1C1C1E and #FFFFFF.
export const GREEK_RANK_TEXT_COLORS: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    Neophyte: '#A1A1A6',
    Athlete:  '#4A9EFF',
    Hero:     '#4CAF50',
    Demigod:  '#FF9800',
    Olympian: '#CE82E0',
    Titan:    '#FF6B66',
    'Aretē':  '#FFD700',
  },
  light: {
    Neophyte: '#6C6C70',
    Athlete:  '#0A63C9',
    Hero:     '#2E7D32',
    Demigod:  '#A85A00',
    Olympian: '#8E24AA',
    Titan:    '#C62828',
    'Aretē':  '#8A6D00',
  },
};
