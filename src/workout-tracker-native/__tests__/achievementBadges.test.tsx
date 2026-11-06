import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  LADDER_ART, ONE_OFF_ART, badgeAccessibilityLabel, badgeLook, metalFor, stampFor,
} from '../constants/achievements';
import { BADGE_ART } from '../constants/badgeArt';
import AchievementBadge from '../components/achievements/AchievementBadge';
import BadgeBack, { backLines, fitBack } from '../components/achievements/BadgeBack';
import { amountText, earnedLine, goalText } from '../utils/achievements';
import FlipBadge from '../components/achievements/FlipBadge';
import { estimateWidth, layoutBack } from '../utils/badgeBackLayout';
import { setReduceMotionForTests } from '../utils/motion';

// The server's catalogue (src/utils/achievements.py) is the source of keys;
// every badge it can award needs art here, with the same number of rungs
const SERVER = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'achievements.py'), 'utf8');

function serverLadders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of SERVER.matchAll(/Ladder\('(\w+)',[\s\S]*?\{'(?:any|lbs|mi)': \[([^\]]*)\]/g)) {
    out[m[1]] = m[2].split(',').filter(s => s.trim()).length;
  }
  for (const m of SERVER.matchAll(/_plates\('[^']+', '(\w+)'\)/g)) out[`plates_${m[1].toLowerCase()}`] = 4;
  return out;
}
const serverOneOffs = () => [...SERVER.matchAll(/^ {4}'((?:feat|hidden)_\w+)': +[({']/gm)].map(m => m[1]);

describe('catalogue mirror', () => {
  it('has art for every ladder the server awards, with the same rung count', () => {
    const ladders = serverLadders();
    expect(Object.keys(ladders).length).toBe(12);
    for (const [track, rungs] of Object.entries(ladders)) {
      expect(LADDER_ART[track]).toBeDefined();
      expect(LADDER_ART[track].rungs).toBe(rungs);
    }
  });

  it('has art for every feat and hidden badge the server awards', () => {
    const keys = serverOneOffs();
    expect(keys.length).toBeGreaterThanOrEqual(14);
    for (const key of keys) {
      expect(ONE_OFF_ART[key]).toBeDefined();
      expect(BADGE_ART[ONE_OFF_ART[key].art]).toBeDefined();
    }
  });
});

describe('badgeLook', () => {
  it('runs bronze, silver, gold, then marble on top', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(r => metalFor(r, 8)))
      .toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'gold', 'marble']);
    expect([1, 2, 3, 4].map(r => metalFor(r, 4))).toEqual(['bronze', 'silver', 'gold', 'marble']);
    expect(metalFor(6, 6)).toBe('marble');
  });

  it('stamps the threshold short', () => {
    expect(stampFor(1)).toBe('1');
    expect(stampFor(26.2)).toBe('26.2');
    expect(stampFor(1000)).toBe('1K');
    expect(stampFor(2500)).toBe('2.5K');
    expect(stampFor(5_000_000)).toBe('5M');
  });

  it('crowns only the top rung', () => {
    expect(badgeLook('workouts_8', { threshold: 1000 })).toMatchObject({ art: 'work', metal: 'marble', stamp: '1K', top: true });
    expect(badgeLook('workouts_7', { threshold: 500 }).top).toBe(false);
  });

  it('draws plates with the lift and the plate count, and mountains with no stamp', () => {
    expect(badgeLook('plates_deadlift_3', { threshold: 140 })).toMatchObject({ art: 'plate', label: 'DEADLIFT', plates: 3, stamp: '140' });
    expect(badgeLook('elevation_4', { threshold: 2917 }).stamp).toBe('');
  });

  it('stamps the club in the user’s unit', () => {
    expect(badgeLook('feat_1000_club').stamp).toBe('1000');
    expect(badgeLook('feat_1000_club', { weightUnit: 'kg' }).stamp).toBe('450');
  });

  it('keeps shape and stamp when locked, in the locked greys', () => {
    expect(badgeLook('workouts_6', { threshold: 250, locked: true })).toMatchObject({ art: 'work', metal: 'locked', stamp: '250' });
  });

  it('draws an unknown key as the plain shard, never guessing', () => {
    expect(badgeLook('workouts_99').art).toBe('hidden');
    expect(badgeLook('nonsense').art).toBe('hidden');
  });
});

describe('badgeAccessibilityLabel', () => {
  it('says when it was earned, on the workout’s own day', () => {
    expect(badgeAccessibilityLabel('Hekaton', { earnedAt: '2026-09-28T00:00:00' })).toBe('Hekaton, earned September 28');
  });
  it('says how far along a locked badge is', () => {
    expect(badgeAccessibilityLabel('Phalanx', { value: 137, threshold: 250 })).toBe('Phalanx, locked, 137 of 250');
  });
  it('gives nothing away for an unfound hidden badge', () => {
    expect(badgeAccessibilityLabel('Pi', { hiddenUnfound: true })).toBe('Hidden badge, not found yet');
  });
});

describe('AchievementBadge', () => {
  const paths = (tree: ReturnType<typeof render>) =>
    tree.UNSAFE_root.findAll(n => typeof n.props.d === 'string').map(n => n.props.d as string);

  it('wears the olive crown only on a marble top rung', () => {
    const top = render(<AchievementBadge badgeKey="workouts_8" threshold={1000} size={64} />);
    const lower = render(<AchievementBadge badgeKey="workouts_7" threshold={500} size={64} />);
    const lockedTop = render(<AchievementBadge badgeKey="workouts_8" threshold={1000} size={64} locked />);
    const crown = (t: ReturnType<typeof render>) => t.UNSAFE_root.findAll(n => n.props.fill === '#A3B18A').length > 0;
    expect(crown(top)).toBe(true);
    expect(crown(lower)).toBe(false);
    expect(crown(lockedTop)).toBe(false);
  });

  it('never draws a hidden badge’s own shape before it is found', () => {
    const unfound = paths(render(<AchievementBadge size={64} />));
    expect(unfound).toContain(BADGE_ART.hidden.shape);
    for (const key of Object.keys(ONE_OFF_ART).filter(k => k.startsWith('hidden_'))) {
      expect(unfound).not.toContain(BADGE_ART[ONE_OFF_ART[key].art].shape);
    }
  });

  it('carries its accessibility label', () => {
    const { getByLabelText } = render(<AchievementBadge badgeKey="workouts_5" threshold={100} size={64} accessibilityLabel="Hekaton, earned September 28" />);
    expect(getByLabelText('Hekaton, earned September 28')).toBeTruthy();
  });
});

describe('badge back layout', () => {
  const earned = { date: 'Sep 28, 2026', workoutName: 'Push Day', countLine: 'your 100th workout' };

  it('fits every line inside the outline at its own height', () => {
    const fitted = fitBack('work', backLines({ badgeKey: 'workouts_5', title: 'Hekaton', earned }));
    expect(fitted?.shape).toBe('work');
    for (const l of fitted!.layout.lines) {
      const width = estimateWidth(l.text, l.size, l.weight, l.spacing);
      for (let y = Math.floor(l.y - l.size * 0.74); y <= Math.ceil(l.y); y++) {
        const [cx, half] = BADGE_ART.work.backRows[y];
        expect(l.x - width / 2).toBeGreaterThanOrEqual(cx - half - 1e-6);
        expect(l.x + width / 2).toBeLessThanOrEqual(cx + half + 1e-6);
      }
    }
  });

  it('cuts a long workout name with an ellipsis rather than overflowing', () => {
    const fitted = fitBack('work', backLines({
      badgeKey: 'workouts_5', title: 'Hekaton',
      earned: { ...earned, workoutName: 'Saturday Morning Long Run Along The River And Back Again' },
    }));
    const line = fitted!.layout.lines.find(l => l.text.startsWith('Saturday'));
    expect(line?.text.endsWith('…')).toBe(true);
  });

  it('wraps a long name onto two lines', () => {
    const fitted = fitBack('work', backLines({ badgeKey: 'hidden_three_hundred', title: 'The Three Hundred', earned: { ...earned, countLine: 'your 300th workout' } }));
    const texts = fitted!.layout.lines.map(l => l.text);
    expect(texts).toContain('THE THREE');
    expect(texts).toContain('HUNDRED');
  });

  it('fits a back for every badge in the catalogue, on its own outline or the round plate', () => {
    const keys = [
      ...Object.entries(LADDER_ART).flatMap(([t, l]) => Array.from({ length: l.rungs }, (_, i) => `${t}_${i + 1}`)),
      ...Object.keys(ONE_OFF_ART),
    ];
    for (const key of keys) {
      const look = badgeLook(key);
      const specs = backLines({ badgeKey: key, title: 'Hippodrome Quadriga', earned: { date: 'Sep 28, 2026', workoutName: 'Saturday Long Ride', countLine: '2,500 mi ridden' } });
      expect([key, fitBack(look.art, specs) !== null]).toEqual([key, true]);
      const locked = backLines({ badgeKey: key, title: 'Hippodrome', progress: { goal: '2,500 workouts', soFar: '1,370 so far', toGo: '1,130 to go' } });
      expect([key, fitBack(look.art, locked) !== null]).toEqual([key, true]);
    }
  });

  // Each badge's own lines, as the badge card builds them. A feat's line is a
  // sentence ("Deadlifted twice your bodyweight"); before it could wrap, the
  // back of every feat, most hidden badges and Dodekatheon came out blank
  it("shows every line of every badge's real back, earned and locked", () => {
    const ladders: { track: string; unit: string; thresholds: number[] }[] = [];
    for (const m of SERVER.matchAll(/Ladder\('(\w+)',[^{]*\{([^}]*)\}/g)) {
      for (const u of m[2].matchAll(/'(\w+)': \[([^\]]*)\]/g)) {
        ladders.push({ track: m[1], unit: u[1], thresholds: u[2].split(',').filter(s => s.trim()).map(s => Number(s.replace(/_/g, ''))) });
      }
    }
    for (const lift of ['bench', 'squat', 'deadlift']) {
      ladders.push({ track: `plates_${lift}`, unit: 'lbs', thresholds: [135, 225, 315, 405] }, { track: `plates_${lift}`, unit: 'kg', thresholds: [60, 100, 140, 180] });
    }
    expect(ladders.length).toBeGreaterThan(15);
    const badges = [
      ...ladders.flatMap(l => l.thresholds.map((t, i) => ({ key: `${l.track}_${i + 1}`, track: l.track as string | null, threshold: t as number | undefined, unit: l.unit }))),
      ...Object.keys(ONE_OFF_ART).map(key => ({ key, track: null, threshold: undefined, unit: 'any' })),
    ];
    const shown = (fitted: ReturnType<typeof fitBack>) => fitted!.layout.lines.map(l => l.text).join(' ');
    for (const b of badges) {
      const du = b.unit === 'km' || b.unit === 'kg' ? 'km' : 'mi';
      const unit = b.unit === 'any' ? du : b.unit;
      const what = earnedLine(b.key, b.threshold, unit, du);
      // The longest single-word title in the catalogue, which can only shrink
      const title = 'Dodekatheon';
      const earnedSpecs = backLines({ badgeKey: b.key, title, earned: { date: 'Sep 28, 2026', workoutName: 'Push Day', countLine: what || null } });
      const progress = b.track && b.threshold != null
        ? { goal: goalText(b.track, b.threshold, unit, du), soFar: `${amountText(b.track, b.threshold * 0.55, unit, du)} so far`, toGo: `${amountText(b.track, b.threshold * 0.45, unit, du)} to go` }
        : { goal: what };
      const lockedSpecs = backLines({ badgeKey: b.key, title, progress });
      for (const [state, specs] of [['earned', earnedSpecs], ['locked', lockedSpecs]] as const) {
        const fitted = fitBack(badgeLook(b.key, { threshold: b.threshold, locked: state === 'locked' }).art, specs);
        expect([b.key, b.unit, state, fitted !== null]).toEqual([b.key, b.unit, state, true]);
        // Nothing but the meaning may be left out
        const words = shown(fitted).replace(/…/g, '').split(/\s+/);
        for (const spec of specs.filter(s => !s.meaning && !s.ellipsize)) {
          for (const word of spec.text.split(' ')) expect([b.key, state, words.includes(word)]).toEqual([b.key, state, true]);
        }
      }
    }
  });

  it('never leaves a back blank: past the round plate it drops lines from the bottom', () => {
    const specs = backLines({
      badgeKey: 'workouts_5', title: 'Hekaton',
      earned: { date: 'Sep 28, 2026', workoutName: 'Push Day', countLine: 'An absurdly long line that could never possibly fit on any badge back at all, however small' },
    });
    const fitted = fitBack('work', specs);
    expect(fitted?.layout.lines[0].text).toBe('HEKATON');
  });

  it('gives up (null) when nothing can fit, so the caller can fall back', () => {
    expect(layoutBack(BADGE_ART.work.backRows.map(() => [32, 0] as [number, number]), [{ text: 'X', size: 4, weight: '800', tone: 'strong' }])).toBeNull();
  });

  it('never hints at an unfound hidden badge’s trigger', () => {
    const lines = backLines({ title: 'Pi' }).map(l => l.text);
    expect(lines).toEqual(['HIDDEN', 'Keep training. This one finds you.']);
  });

  it('renders a locked back with no earned date', () => {
    const tree = render(
      <BadgeBack badgeKey="workouts_6" title="Phalanx" threshold={250} size={200} progress={{ goal: '250 workouts', soFar: '137 so far', toGo: '113 to go' }} />,
    );
    const texts = tree.UNSAFE_root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children);
    expect(texts).toContain('NOT YET');
    expect(texts).not.toContain('EARNED');
  });
});

describe('FlipBadge', () => {
  afterEach(() => setReduceMotionForTests(false));

  it('hides the face that is turned away from screen readers', () => {
    const { UNSAFE_root, rerender } = render(<FlipBadge size={64} flipped={false} front={<></>} back={<></>} />);
    const faces = () => UNSAFE_root.findAll(n => n.props.accessibilityElementsHidden !== undefined && typeof n.type === 'string');
    expect(faces().map(f => f.props.accessibilityElementsHidden)).toEqual([false, true]);
    rerender(<FlipBadge size={64} flipped front={<></>} back={<></>} />);
    expect(faces().map(f => f.props.accessibilityElementsHidden)).toEqual([true, false]);
  });

  it('crossfades instead of turning with Reduce Motion on', () => {
    setReduceMotionForTests(true);
    const { UNSAFE_root } = render(<FlipBadge size={64} flipped={false} front={<></>} back={<></>} />);
    const styles = UNSAFE_root.findAll(n => n.props.accessibilityElementsHidden !== undefined && typeof n.type === 'string')
      .map(n => JSON.stringify(n.props.style));
    expect(styles.every(s => !s.includes('rotateY'))).toBe(true);
  });
});
