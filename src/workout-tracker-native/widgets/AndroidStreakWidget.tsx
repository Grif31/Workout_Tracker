import React from 'react';
import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';
import { DARK_BASE, LIGHT_BASE } from '../context/ThemeContext';

// Phase 0 spike (TODO.md section 19), the Android twin of StreakWidget.tsx.
// Unlike the iOS layout this is ordinary app JS, run by the library in a
// headless task, but it draws outside any React tree: no hooks or useTheme(),
// so each color scheme gets its own palette from the caller.
type Palette = { surface: HexColor; textPrimary: HexColor; textSecondary: HexColor };

// The library types colors as `#${string}`; the theme's are plain strings.
const toPalette = (base: typeof LIGHT_BASE): Palette => ({
  surface: base.surface as HexColor,
  textPrimary: base.textPrimary as HexColor,
  textSecondary: base.textSecondary as HexColor,
});

function StreakLayout({ weeks, palette }: { weeks: number; palette: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: palette.surface,
        borderRadius: 16,
      }}
    >
      <TextWidget text={String(weeks)} style={{ fontSize: 44, fontWeight: 'bold', color: palette.textPrimary }} />
      <TextWidget text="week streak" style={{ fontSize: 12, color: palette.textSecondary }} />
    </FlexWidget>
  );
}

export function renderStreakWidget(weeks: number) {
  return {
    light: <StreakLayout weeks={weeks} palette={toPalette(LIGHT_BASE)} />,
    dark: <StreakLayout weeks={weeks} palette={toPalette(DARK_BASE)} />,
  };
}
