import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Accent presets ────────────────────────────────────────────────────────────

export type AccentPreset = {
  name: string;
  value: string;     // dark-mode accent
  text: string;      // text color to use ON the dark-mode accent
  light: string;     // light-mode accent; the bright values fail WCAG contrast on light backgrounds
  lightText: string; // text color to use ON the light-mode accent
};

// No Yellow preset: it matched the Aretē rank gold (#FFD700) in dark mode, and a
// yellow dark enough to read in light mode lands on PR gold's hue. Gold means achievement.
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Green',  value: '#30D158', text: '#000000', light: '#1C7F35', lightText: '#FFFFFF' },
  { name: 'Blue',   value: '#007AFF', text: '#000000', light: '#006BE0', lightText: '#FFFFFF' },
  { name: 'Purple', value: '#BF5AF2', text: '#000000', light: '#A922EE', lightText: '#FFFFFF' },
  { name: 'Orange', value: '#FF9F0A', text: '#000000', light: '#C93400', lightText: '#FFFFFF' },
  { name: 'Red',    value: '#FF453A', text: '#000000', light: '#D70015', lightText: '#FFFFFF' },
  { name: 'Pink',   value: '#FF375F', text: '#000000', light: '#D30F45', lightText: '#FFFFFF' },
  { name: 'Teal',   value: '#5AC8FA', text: '#000000', light: '#0576AA', lightText: '#FFFFFF' },
  { name: 'Indigo', value: '#5E5CE6', text: '#FFFFFF', light: '#5E5CE6', lightText: '#FFFFFF' },
];

// ── Color type ────────────────────────────────────────────────────────────────

export type Colors = {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  placeholder: string;
  accent: string;     // primary action / highlight color
  accentText: string; // text on an accent-colored background
  accentDark: string; // accent for surfaces that stay dark in both themes (share cards)
  save: string;       // alias for accent (backwards compat)
  danger: string;
  warmup: string;     // warm-up set indicator
  dropset: string;    // drop set indicator
};

// ── Base palettes (no accent) ─────────────────────────────────────────────────

const LIGHT_BASE = {
  background:    '#F2F2F7',
  surface:       '#FFFFFF',
  border:        '#E5E5EA',
  textPrimary:   '#000000',
  textSecondary: '#6C6C70',
  placeholder:   '#AEAEB2',
  danger:        '#FF3B30',
  warmup:        '#FF9500',
  dropset:       '#AF52DE',
};

const DARK_BASE = {
  background:    '#141416',
  surface:       '#1C1C1E',
  border:        '#38383A',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
  placeholder:   '#636366',
  danger:        '#FF453A',
  warmup:        '#FF9500',
  dropset:       '#AF52DE',
};

function buildColors(mode: 'light' | 'dark', preset: AccentPreset): Colors {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  const accent = mode === 'light' ? preset.light : preset.value;
  return {
    ...base,
    accent,
    accentText: mode === 'light' ? preset.lightText : preset.text,
    accentDark: preset.value,
    save:       accent,
  };
}


// ── Context ───────────────────────────────────────────────────────────────────

type ThemeContextType = {
  colors:            Colors;
  mode:              'light' | 'dark';
  accentPreset:      AccentPreset;
  accentPresets:     AccentPreset[];
  toggleMode:        () => void;
  setAccentPreset:   (preset: AccentPreset) => void;
  resetAccent:       () => void;
  loadAccentForUser: (userId: number | string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType>(null!);

const KEY_MODE   = '@theme_mode';
export const KEY_ACCENT = '@theme_accent';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode]               = useState<'light' | 'dark'>('light');
  const [accentPreset, setAccentState] = useState<AccentPreset>(ACCENT_PRESETS[0]);
  const [ready, setReady]             = useState(false);
  // null = user has never explicitly chosen; follow system. 'light'|'dark' = pinned.
  const [pinnedMode, setPinnedMode]   = useState<'light' | 'dark' | null>(null);

  // Load persisted preferences on mount
  useEffect(() => {
    (async () => {
      const [savedMode, savedAccent] = await Promise.all([
        AsyncStorage.getItem(KEY_MODE),
        AsyncStorage.getItem(KEY_ACCENT),
      ]);
      if (savedMode === 'light' || savedMode === 'dark') {
        setPinnedMode(savedMode);
        setMode(savedMode);
      } else {
        // No saved preference — use the system setting
        const system = Appearance.getColorScheme();
        setMode(system === 'dark' ? 'dark' : 'light');
      }
      if (savedAccent) {
        const found = ACCENT_PRESETS.find(p => p.name === savedAccent);
        if (found) setAccentState(found);
      }
      setReady(true);
    })();
  }, []);

  // Follow system changes only when the user hasn't pinned a preference
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (pinnedMode === null) {
        setMode(colorScheme === 'dark' ? 'dark' : 'light');
      }
    });
    return () => sub.remove();
  }, [pinnedMode]);

  const toggleMode = useCallback(() => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    setPinnedMode(next);
    AsyncStorage.setItem(KEY_MODE, next);
  }, [mode]);

  const setAccentPreset = useCallback((preset: AccentPreset) => {
    setAccentState(preset);
    AsyncStorage.setItem(KEY_ACCENT, preset.name);
  }, []);

  const resetAccent = useCallback(() => {
    setAccentState(ACCENT_PRESETS[0]);
    AsyncStorage.removeItem(KEY_ACCENT);
  }, []);

  const loadAccentForUser = useCallback(async (userId: number | string) => {
    const saved = await AsyncStorage.getItem(`@theme_accent_${userId}`);
    if (saved) {
      const found = ACCENT_PRESETS.find(p => p.name === saved);
      if (found) {
        setAccentState(found);
        return;
      }
    }
    // No saved preference for this user — use default
    setAccentState(ACCENT_PRESETS[0]);
  }, []);

  const colors = useMemo(() => buildColors(mode, accentPreset), [mode, accentPreset]);

  // Memoized so consumers (nearly every screen/component in the app) don't
  // re-render on every ThemeProvider render — only when something about the
  // theme actually changes.
  const value = useMemo<ThemeContextType>(() => ({
    colors, mode, accentPreset, accentPresets: ACCENT_PRESETS,
    toggleMode, setAccentPreset, resetAccent, loadAccentForUser,
  }), [colors, mode, accentPreset, toggleMode, setAccentPreset, resetAccent, loadAccentForUser]);

  // Don't render until we've loaded saved preferences to avoid a flash
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
