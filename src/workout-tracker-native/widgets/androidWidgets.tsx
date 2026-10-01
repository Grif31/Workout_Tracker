import React from 'react';
import { FlexWidget, SvgWidget, TextWidget, type HexColor, type WidgetInfo } from 'react-native-android-widget';
import {
  Bar, Card, Days, Header, Icon, MEDIUM_MIN_WIDTH, PADDING, PALETTES, Placeholder, Ring, withAlpha, type Scheme,
} from './androidParts';
import {
  greekRankProps, upNextProps, weeklyGoalProps,
  type GreekRankProps, type UpNextProps, type WeeklyGoalProps, type WidgetImages,
} from '../utils/widgetProps';
import { muscleDiagramSvg, WIDGET_BODY_COLORS } from '../utils/muscleDiagramSvg';
import type { WidgetSnapshot } from '../utils/widgetSnapshot';

// The Android twins of the iOS widgets, drawn from the same props
// (utils/widgetProps.ts), so wording and numbers match on both platforms.
// Each is one resizable widget: at 2x2 it's the small layout, and from about
// 4 cells wide the medium one.

// Android bundles its logo images (androidParts), so none come through props
const NO_IMAGES: WidgetImages = { logoDark: null, logoLight: null };

type Size = { medium: boolean; contentWidth: number };

function sizeOf(info: Pick<WidgetInfo, 'width'>): Size {
  return { medium: info.width >= MEDIUM_MIN_WIDTH, contentWidth: Math.max(0, info.width - PADDING * 2) };
}

function WeeklyGoal({ p, scheme, size }: { p: WeeklyGoalProps; scheme: Scheme; size: Size }) {
  if (!p.loggedIn || !p.hasWeek) return <Placeholder uri={p.url} scheme={scheme} loggedIn={p.loggedIn} what="weekly goal" />;
  const palette = PALETTES[scheme];
  const accent = scheme === 'dark' ? p.accentDark : p.accentLight;
  const ringColor = p.stale ? withAlpha(accent, 0.45) : accent;
  const label = p.goalMet ? 'Goal met' : 'Weekly Goal';
  const fill = p.goal > 0 ? Math.min(1, p.done / p.goal) : 0;

  if (size.medium) {
    const rightWidth = size.contentWidth - 84 - 18;
    return (
      <Card uri={p.url} palette={palette} row>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGap: 8 }}>
          <Header label={label} color={p.stale ? palette.secondary : accent as HexColor} scheme={scheme} />
          <Ring size={84} fill={fill} done={p.done} goal={p.goal} color={ringColor} palette={palette} />
        </FlexWidget>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', flexGap: 10 }}>
          <FlexWidget style={{ width: rightWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TextWidget text={p.remainingLabel} style={{ fontSize: 17, fontWeight: '800', color: palette.text }} />
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 3 }}>
              <Icon kind="flame" size={12} color={palette.flame} />
              <TextWidget text={`${p.streakWeeks} week streak`} style={{ fontSize: 12, fontWeight: 'bold', color: palette.flame }} />
            </FlexWidget>
          </FlexWidget>
          <Days days={p.days} dot={8} letter={10} color={ringColor} palette={palette} width={rightWidth} />
          {p.stale ? (
            <TextWidget text={p.staleLabel} style={{ fontSize: 12, fontWeight: '600', color: palette.text }} maxLines={2} />
          ) : p.distance ? (
            <FlexWidget style={{ flexDirection: 'column', flexGap: 5 }}>
              <FlexWidget style={{ width: rightWidth, flexDirection: 'row', justifyContent: 'space-between' }}>
                <TextWidget text="Distance" style={{ fontSize: 12, fontWeight: '600', color: palette.secondary }} />
                <TextWidget text={p.distance.label} style={{ fontSize: 12, fontWeight: 'bold', color: palette.text }} />
              </FlexWidget>
              <Bar width={rightWidth} fill={p.distance.fill} height={5} color={accent} track={palette.faint} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      </Card>
    );
  }

  return (
    <Card uri={p.url} palette={palette}>
      <FlexWidget style={{ width: size.contentWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Header label={label} color={p.stale ? palette.secondary : accent as HexColor} scheme={scheme} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 2 }}>
          <Icon kind="flame" size={12} color={palette.flame} />
          <TextWidget text={String(p.streakWeeks)} style={{ fontSize: 12, fontWeight: 'bold', color: palette.flame }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ width: size.contentWidth, flexDirection: 'row', justifyContent: 'center' }}>
        <Ring size={64} fill={fill} done={p.done} goal={p.goal} color={ringColor} palette={palette} />
      </FlexWidget>
      {p.stale ? (
        <TextWidget text="Open Aretē to update" style={{ fontSize: 12, fontWeight: '600', color: palette.text, textAlign: 'center' }} />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>
          <Days days={p.days} dot={6} letter={9} color={accent} palette={palette} width={size.contentWidth} />
          {p.distance ? <Bar width={size.contentWidth} fill={p.distance.fill} height={4} color={accent} track={palette.faint} /> : null}
        </FlexWidget>
      )}
    </Card>
  );
}

function Badge({ p, size, scheme }: { p: GreekRankProps; size: number; scheme: Scheme }) {
  return (
    <FlexWidget style={{
      width: size, height: size, borderRadius: size / 2, borderWidth: size / 17, borderColor: p.color as HexColor,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <TextWidget text={p.letter} style={{ fontSize: size * 0.45, fontWeight: '800', color: (scheme === 'dark' ? p.textDark : p.textLight) as HexColor }} />
    </FlexWidget>
  );
}

function GreekRank({ p, scheme, size }: { p: GreekRankProps; scheme: Scheme; size: Size }) {
  if (!p.loggedIn || !p.hasRank) return <Placeholder uri={p.url} scheme={scheme} loggedIn={p.loggedIn} what="Greek Rank" />;
  const palette = PALETTES[scheme];
  const accent = scheme === 'dark' ? p.accentDark : p.accentLight;
  const rankText = (scheme === 'dark' ? p.textDark : p.textLight) as HexColor;
  const nameColor = p.stale ? withAlpha(rankText, 0.45) : rankText;
  const badge = size.medium ? 52 : 44;
  const leftWidth = size.medium && !p.heldByGate && !p.stale ? size.contentWidth - 128 - 18 : size.contentWidth;

  const identity = (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: badge / 4 }}>
      <Badge p={p} size={badge} scheme={scheme} />
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={p.rank} style={{ fontSize: size.medium ? 24 : 20, fontWeight: '800', color: nameColor }} maxLines={1} />
        <TextWidget text={p.pointsLabel} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  );

  // A stale note, "Excellence" at the top rank, the gate when one holds the
  // rank back, otherwise the bar toward the next rank.
  let footer: React.ReactNode;
  if (p.stale) {
    footer = <TextWidget text={size.medium ? p.staleLabel : 'Open Aretē to update'} style={{ fontSize: 12, fontWeight: '600', color: palette.text }} maxLines={2} />;
  } else if (p.isTop) {
    footer = <TextWidget text="EXCELLENCE" style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.12, color: rankText }} />;
  } else if (p.heldByGate && size.medium && p.gateDetail) {
    footer = (
      <FlexWidget style={{ width: leftWidth, flexDirection: 'row', alignItems: 'center', flexGap: 6, padding: 8, borderRadius: 10, backgroundColor: palette.chip }}>
        <Icon kind="lock" size={13} color={palette.secondary} />
        <TextWidget text={p.gateDetail} style={{ fontSize: 12, fontWeight: '600', color: palette.text }} maxLines={2} />
      </FlexWidget>
    );
  } else if (p.heldByGate) {
    footer = (
      <FlexWidget style={{ flexDirection: 'row', flexGap: 5 }}>
        <Icon kind="lock" size={12} color={palette.secondary} />
        <TextWidget text={p.smallCaption} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} maxLines={3} />
      </FlexWidget>
    );
  } else {
    footer = (
      <FlexWidget style={{ flexDirection: 'column', flexGap: 5 }}>
        <Bar width={leftWidth} fill={p.progress} height={6} color={p.color} track={palette.faint} />
        {size.medium ? (
          <FlexWidget style={{ width: leftWidth, flexDirection: 'row', justifyContent: 'space-between' }}>
            <TextWidget text={p.bandLowLabel} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} />
            <TextWidget text={p.bandHighLabel} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} />
          </FlexWidget>
        ) : (
          <TextWidget text={p.smallCaption} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} maxLines={2} />
        )}
      </FlexWidget>
    );
  }

  const left = (
    <FlexWidget style={{ width: leftWidth, height: 'match_parent', flexDirection: 'column', justifyContent: 'space-between' }}>
      <Header label="Greek Rank" color={p.stale ? palette.secondary : accent as HexColor} scheme={scheme} />
      {identity}
      {footer}
    </FlexWidget>
  );

  if (!size.medium || p.heldByGate || p.stale) {
    return <Card uri={p.url} palette={palette}>{left}</Card>;
  }
  return (
    <Card uri={p.url} palette={palette} row>
      {left}
      <FlexWidget style={{ width: 128, flexDirection: 'column', justifyContent: 'center', flexGap: 10 }}>
        {p.components.map(c => (
          <FlexWidget key={c.label} style={{ flexDirection: 'column', flexGap: 4 }}>
            <FlexWidget style={{ width: 128, flexDirection: 'row', justifyContent: 'space-between' }}>
              <TextWidget text={c.label} style={{ fontSize: 11, fontWeight: '600', color: palette.secondary }} />
              <TextWidget text={String(c.value)} style={{ fontSize: 11, fontWeight: 'bold', color: palette.text }} />
            </FlexWidget>
            <Bar width={128} fill={c.value / 100} height={4} color={palette.text} track={palette.faint} />
          </FlexWidget>
        ))}
      </FlexWidget>
    </Card>
  );
}

function UpNext({ p, scheme, size }: { p: UpNextProps; scheme: Scheme; size: Size }) {
  if (!p.loggedIn) return <Placeholder uri={p.url} scheme={scheme} loggedIn={false} what="next routine day" />;
  const palette = PALETTES[scheme];
  const accent = scheme === 'dark' ? p.accentDark : p.accentLight;
  const onAccent = (scheme === 'dark' ? p.onAccentDark : p.onAccentLight) as HexColor;
  const header = <Header label="Up Next" color={p.stale ? palette.secondary : accent as HexColor} scheme={scheme} />;
  const routine = <TextWidget text={p.routineName} style={{ fontSize: size.medium ? 12 : 11, fontWeight: '600', color: palette.secondary }} maxLines={1} />;
  const diagram = (px: number) => (p.muscles.length > 0
    ? <SvgWidget svg={muscleDiagramSvg(p.muscles, { body: WIDGET_BODY_COLORS[scheme], highlight: accent }, px)} style={{ width: px, height: px }} />
    : null);
  const start = p.stale ? (
    <TextWidget text={size.medium ? p.staleLabel : 'Open Aretē to update'} style={{ fontSize: 12, fontWeight: '600', color: palette.text }} maxLines={2} />
  ) : (
    <FlexWidget style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGap: 6,
      paddingVertical: size.medium ? 10 : 8, paddingHorizontal: 16, borderRadius: 20,
      backgroundColor: accent as HexColor, ...(size.medium ? {} : { width: size.contentWidth }),
    }}>
      <SvgWidget svg={`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="${onAccent}"/></svg>`} style={{ width: 12, height: 12 }} />
      <TextWidget text="Start" style={{ fontSize: size.medium ? 14 : 13, fontWeight: 'bold', color: onAccent }} />
    </FlexWidget>
  );
  const check = (px: number) => (
    <FlexWidget style={{ width: px, height: px, borderRadius: px / 2, backgroundColor: accent as HexColor, justifyContent: 'center', alignItems: 'center' }}>
      <SvgWidget svg={`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${onAccent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`} style={{ width: px / 2, height: px / 2 }} />
    </FlexWidget>
  );

  if (p.state === 'noRoutine') {
    return (
      <Card uri={p.url} palette={palette}>
        {header}
        <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
          <TextWidget text="Pick a routine" style={{ fontSize: size.medium ? 20 : 17, fontWeight: '800', color: palette.text }} />
          <TextWidget
            text={size.medium ? 'Choose one on the Coach tab and your next day shows up here.' : 'Choose one on the Coach tab.'}
            style={{ fontSize: 12, color: palette.secondary }} maxLines={3}
          />
        </FlexWidget>
      </Card>
    );
  }

  if (p.state === 'allDone') {
    return size.medium ? (
      <Card uri={p.url} palette={palette}>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>{header}{routine}</FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
          {check(36)}
          <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>
            <TextWidget text={`Great Job! ${p.doneLine}`} style={{ fontSize: 17, fontWeight: '800', color: palette.text }} maxLines={1} />
            <TextWidget text={p.mondayLine} style={{ fontSize: 12, color: palette.secondary }} maxLines={1} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ height: 1 }} />
      </Card>
    ) : (
      <Card uri={p.url} palette={palette}>
        {header}
        {check(34)}
        <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>
          <TextWidget text="Great Job!" style={{ fontSize: 17, fontWeight: '800', color: palette.text }} />
          <TextWidget text={p.doneLine} style={{ fontSize: 13, fontWeight: 'bold', color: palette.text }} maxLines={1} />
        </FlexWidget>
      </Card>
    );
  }

  if (size.medium) {
    const leftWidth = size.contentWidth - 84 - 12;
    return (
      <Card uri={p.url} palette={palette} row>
        <FlexWidget style={{ width: leftWidth, height: 'match_parent', flexDirection: 'column', justifyContent: 'space-between' }}>
          <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>{header}{routine}</FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
            <TextWidget text={p.dayTitle} style={{ fontSize: 22, fontWeight: '800', color: palette.text }} maxLines={1} />
            <TextWidget text={p.exercisesLine} style={{ fontSize: 12, color: palette.secondary }} maxLines={2} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ height: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
          {diagram(84)}
          {start}
        </FlexWidget>
      </Card>
    );
  }

  return (
    <Card uri={p.url} palette={palette}>
      {/* The header on its own row, as on iOS: beside the diagram it was cut off */}
      {header}
      <FlexWidget style={{ width: size.contentWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <FlexWidget style={{ width: size.contentWidth - 46 - 6, flexDirection: 'column', flexGap: 2 }}>
          {routine}
          <TextWidget text={p.dayTitle} style={{ fontSize: 17, fontWeight: '800', color: palette.text }} maxLines={2} />
        </FlexWidget>
        {diagram(46)}
      </FlexWidget>
      {start}
    </Card>
  );
}

type Renderer = (snapshot: WidgetSnapshot | null, info: Pick<WidgetInfo, 'width'>, now?: Date) => { light: React.JSX.Element; dark: React.JSX.Element };

/** Keyed by each widget's `name` in app.config.js's react-native-android-widget entry. */
export const ANDROID_WIDGETS: Record<string, Renderer> = {
  WeeklyGoal: (snapshot, info, now = new Date()) => {
    const p = weeklyGoalProps(snapshot, now, NO_IMAGES);
    const size = sizeOf(info);
    return { light: <WeeklyGoal p={p} scheme="light" size={size} />, dark: <WeeklyGoal p={p} scheme="dark" size={size} /> };
  },
  GreekRank: (snapshot, info, now = new Date()) => {
    const p = greekRankProps(snapshot, now, NO_IMAGES);
    const size = sizeOf(info);
    return { light: <GreekRank p={p} scheme="light" size={size} />, dark: <GreekRank p={p} scheme="dark" size={size} /> };
  },
  UpNext: (snapshot, info, now = new Date()) => {
    const p = upNextProps(snapshot, now, NO_IMAGES);
    const size = sizeOf(info);
    return { light: <UpNext p={p} scheme="light" size={size} />, dark: <UpNext p={p} scheme="dark" size={size} /> };
  },
};
