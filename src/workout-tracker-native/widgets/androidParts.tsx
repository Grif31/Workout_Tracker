import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, SvgWidget, TextWidget, type HexColor } from 'react-native-android-widget';
import { DARK_BASE, LIGHT_BASE } from '../context/ThemeContext';

// Building blocks the Android widgets share. These draw outside any React tree
// (react-native-android-widget turns them into RemoteViews), so no hooks or
// useTheme(): each widget is drawn once per color scheme with its palette.

export type Scheme = 'light' | 'dark';

type Palette = {
  surface: HexColor;
  text: HexColor;
  secondary: HexColor;
  faint: HexColor;
  chip: HexColor;
  /** The streak flame; a darker orange on light, where #FF9500 is 2.2:1. */
  flame: HexColor;
};

const hex = (c: string) => c as HexColor;
export const PALETTES: Record<Scheme, Palette> = {
  dark: {
    surface: hex(DARK_BASE.surface), text: hex(DARK_BASE.textPrimary), secondary: hex(DARK_BASE.textSecondary),
    faint: hex(DARK_BASE.border), chip: '#2C2C2E', flame: '#FF9F0A',
  },
  light: {
    surface: hex(LIGHT_BASE.surface), text: hex(LIGHT_BASE.textPrimary), secondary: hex(LIGHT_BASE.textSecondary),
    faint: hex(LIGHT_BASE.border), chip: '#F2F2F7', flame: '#C93400',
  },
};

// Same logos the iOS widgets copy into the App Group; Android reads them bundled
const LOGOS = {
  dark: require('../assets/widgets/logo_on_dark.png'),
  light: require('../assets/widgets/logo_on_light.png'),
};

/** Widgets at least this wide (dp) get the medium layout: about 4 cells. */
export const MEDIUM_MIN_WIDTH = 220;
export const PADDING = 14;

/** `#RRGGBB` at an alpha, for the dimmed stale state: RemoteViews have no opacity. */
export function withAlpha(color: string, alpha: number): `rgba(${number}, ${number}, ${number}, ${number})` {
  const n = parseInt(color.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function Card({ uri, palette, row, children }: { uri: string; palette: Palette; row?: boolean; children: React.ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.surface,
        borderRadius: 22,
        padding: PADDING,
        flexDirection: row ? 'row' : 'column',
        justifyContent: 'space-between',
        flexGap: row ? 18 : 0,
      }}
    >
      {children}
    </FlexWidget>
  );
}

export function Header({ label, color, scheme }: { label: string; color: HexColor | `rgba(${number}, ${number}, ${number}, ${number})`; scheme: Scheme }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 5 }}>
      <ImageWidget image={LOGOS[scheme]} imageWidth={14} imageHeight={14} resizeMode="contain" />
      <TextWidget text={label.toUpperCase()} style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: 0.08, color }} />
    </FlexWidget>
  );
}

export function Logo({ scheme, size }: { scheme: Scheme; size: number }) {
  return <ImageWidget image={LOGOS[scheme]} imageWidth={size} imageHeight={size} resizeMode="contain" />;
}

function ringSvg(size: number, stroke: number, fill: number, track: string, color: string) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  // No arc at 0: a round cap on a zero-length dash still draws a dot
  const arc = fill > 0
    ? `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c} ${c}" stroke-dashoffset="${c * (1 - Math.min(1, fill))}" transform="rotate(-90 ${mid} ${mid})"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>${arc}</svg>`;
}

/** The goal ring with "2/3" in the middle. */
export function Ring({ size, fill, done, goal, color, palette }: {
  size: number; fill: number; done: number; goal: number; color: string; palette: Palette;
}) {
  return (
    <OverlapWidget style={{ width: size, height: size }}>
      <SvgWidget svg={ringSvg(size, size > 70 ? 8 : 7, fill, palette.faint, color)} style={{ width: size, height: size }} />
      <FlexWidget style={{ width: size, height: size, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        <TextWidget text={String(done)} style={{ fontSize: size * 0.31, fontWeight: '800', color: palette.text }} />
        <TextWidget text={`/${goal}`} style={{ fontSize: size * 0.17, fontWeight: '700', color: palette.secondary, marginTop: size * 0.06 }} />
      </FlexWidget>
    </OverlapWidget>
  );
}

/** A progress bar across `width` dp. RemoteViews can't size a child by percent, so the fill gets a width in dp. */
export function Bar({ width, fill, height, color, track }: { width: number; fill: number; height: number; color: string; track: string }) {
  const filled = Math.round(width * Math.max(0, Math.min(1, fill)));
  return (
    <FlexWidget style={{ width, height, borderRadius: height / 2, backgroundColor: track as HexColor, flexDirection: 'row' }}>
      {filled > 0 ? <FlexWidget style={{ width: filled, height, borderRadius: height / 2, backgroundColor: color as HexColor }} /> : null}
    </FlexWidget>
  );
}

export function Days({ days, dot, letter, color, palette, width }: {
  days: { letter: string; trained: boolean; today: boolean }[];
  dot: number; letter: number; color: string; palette: Palette; width: number;
}) {
  return (
    <FlexWidget style={{ width, flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d, i) => (
        <FlexWidget key={i} style={{ flexDirection: 'column', alignItems: 'center', flexGap: 3, width: 16 }}>
          <TextWidget text={d.letter} style={{ fontSize: letter, fontWeight: d.today ? 'bold' : '600', color: d.today ? palette.text : palette.secondary }} />
          <FlexWidget style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: (d.trained ? color : palette.faint) as HexColor }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

const FLAME_PATH = 'M12 22c4 0 7-2.8 7-7 0-3.5-2.3-6-4-8-.4 2.4-1.6 3.6-3 4 .4-3.2-1-6.4-3.5-9C8.2 5.5 5 8.6 5 15c0 4.2 3 7 7 7z';
const LOCK_PATHS = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';

export function Icon({ kind, size, color }: { kind: 'flame' | 'lock'; size: number; color: string }) {
  const body = kind === 'flame'
    ? `<path d="${FLAME_PATH}" fill="${color}"/>`
    : `<g fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${LOCK_PATHS}</g>`;
  return <SvgWidget svg={`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`} style={{ width: size, height: size }} />;
}

/** Logged out, or logged in with nothing written yet. */
export function Placeholder({ uri, scheme, loggedIn, what }: { uri: string; scheme: Scheme; loggedIn: boolean; what: string }) {
  const palette = PALETTES[scheme];
  return (
    <Card uri={uri} palette={palette}>
      <Logo scheme={scheme} size={36} />
      <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
        <TextWidget text={loggedIn ? 'Open Aretē' : 'Log in to Aretē'} style={{ fontSize: 16, fontWeight: '800', color: palette.text }} maxLines={1} />
        <TextWidget text={`Your ${what} shows here once you do.`} style={{ fontSize: 12, color: palette.secondary }} maxLines={3} />
      </FlexWidget>
    </Card>
  );
}
