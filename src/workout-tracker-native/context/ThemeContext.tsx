import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Accent presets ────────────────────────────────────────────────────────────

export type AccentPreset = {
  name: string;
  value: string;
  text: string; // text color to use ON an accent-colored background
};

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Green',  value: '#30D158', text: '#000000' },
  { name: 'Blue',   value: '#007AFF', text: '#FFFFFF' },
  { name: 'Purple', value: '#BF5AF2', text: '#FFFFFF' },
  { name: 'Orange', value: '#FF9F0A', text: '#000000' },
  { name: 'Red',    value: '#FF453A', text: '#FFFFFF' },
  { name: 'Pink',   value: '#FF375F', text: '#FFFFFF' },
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
  save: string;       // alias for accent (backwards compat)
  danger: string;
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
};

const DARK_BASE = {
  background:    '#000000',
  surface:       '#1C1C1E',
  border:        '#38383A',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
  placeholder:   '#636366',
  danger:        '#FF453A',
};

function buildColors(mode: 'light' | 'dark', preset: AccentPreset): Colors {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  return {
    ...base,
    accent:     preset.value,
    accentText: preset.text,
    save:       preset.value,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

type ThemeContextType = {
  colors:         Colors;
  mode:           'light' | 'dark';
  accentPreset:   AccentPreset;
  accentPresets:  AccentPreset[];
  toggleMode:     () => void;
  setAccentPreset:(preset: AccentPreset) => void;
};

const ThemeContext = createContext<ThemeContextType>(null!);

const KEY_MODE   = '@theme_mode';
const KEY_ACCENT = '@theme_accent';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode]               = useState<'light' | 'dark'>('light');
  const [accentPreset, setAccentState] = useState<AccentPreset>(ACCENT_PRESETS[0]);
  const [ready, setReady]             = useState(false);

  // Load persisted preferences on mount
  useEffect(() => {
    (async () => {
      const [savedMode, savedAccent] = await Promise.all([
        AsyncStorage.getItem(KEY_MODE),
        AsyncStorage.getItem(KEY_ACCENT),
      ]);
      if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
      if (savedAccent) {
        const found = ACCENT_PRESETS.find(p => p.name === savedAccent);
        if (found) setAccentState(found);
      }
      setReady(true);
    })();
  }, []);

  const toggleMode = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    AsyncStorage.setItem(KEY_MODE, next);
  };

  const setAccentPreset = (preset: AccentPreset) => {
    setAccentState(preset);
    AsyncStorage.setItem(KEY_ACCENT, preset.name);
  };

  const colors = useMemo(() => buildColors(mode, accentPreset), [mode, accentPreset]);

  // Don't render until we've loaded saved preferences to avoid a flash
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ colors, mode, accentPreset, accentPresets: ACCENT_PRESETS, toggleMode, setAccentPreset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
