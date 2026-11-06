import type { BadgeArtKey, BadgeMetal } from './badgeArt';

// The app's half of the achievements catalogue (TODO §27). Keys, thresholds
// and titles come from the server (src/utils/achievements.py); this file only
// says how each key is drawn and what its back says.

// Badge colours, separate from the Aretē rank gold (#FFD700) and PR gold on purpose
export const OLIVE = '#A3B18A';
export const MARBLE_VEIN = '#A39D8E';
/** Marks on a locked badge (TODO §27: #8E8E93 on #232325 keeps the "?" readable) */
export const LOCKED_MARK = '#8E8E93';
/** The back's engraving, by metal: name and date, secondary lines, rules */
export const BACK_INK: Record<BadgeMetal, { strong: string; soft: string; rule: string; faceTop: string; faceMid: string; faceEnd: string }> = {
  bronze: { strong: '#F3C9A0', soft: '#C9A07E', rule: '#C98A5A', faceTop: '#5E3E27', faceMid: '#3A2618', faceEnd: '#22160C' },
  silver: { strong: '#E6EAF0', soft: '#A9B0BA', rule: '#C7CDD6', faceTop: '#474D57', faceMid: '#2A2E35', faceEnd: '#181A1E' },
  gold:   { strong: '#F6DE8E', soft: '#C9B477', rule: '#E8C25A', faceTop: '#55461B', faceMid: '#33290F', faceEnd: '#211A09' },
  marble: { strong: '#FFFFFF', soft: '#CFC8B8', rule: '#F2EEE4', faceTop: '#6E6857', faceMid: '#4A4436', faceEnd: '#2A2620' },
  locked: { strong: '#AEAEB2', soft: '#8E8E93', rule: '#5A5A5E', faceTop: '#2C2C30', faceMid: '#232325', faceEnd: '#18181A' },
};

/** Ladder tracks as the server names them, with their art and rung count */
export const LADDER_ART: Record<string, { art: BadgeArtKey; rungs: number }> = {
  workouts:        { art: 'work',    rungs: 8 },
  hours:           { art: 'hours',   rungs: 7 },
  volume:          { art: 'vol',     rungs: 8 },
  streak:          { art: 'streak',  rungs: 7 },
  prs:             { art: 'pr',      rungs: 8 },
  running:         { art: 'dist',    rungs: 7 },
  ride:            { art: 'ride',    rungs: 7 },
  elevation:       { art: 'elev',    rungs: 6 },
  explorer:        { art: 'explore', rungs: 4 },
  plates_bench:    { art: 'plate',   rungs: 4 },
  plates_squat:    { art: 'plate',   rungs: 4 },
  plates_deadlift: { art: 'plate',   rungs: 4 },
};

export const PLATE_LIFT_LABEL: Record<string, string> = {
  plates_bench: 'BENCH', plates_squat: 'SQUAT', plates_deadlift: 'DEADLIFT',
};

/** One-off badges: their own object, always gold, a fixed stamp */
export const ONE_OFF_ART: Record<string, { art: BadgeArtKey; stamp: string; kgStamp?: string }> = {
  feat_bw_bench:        { art: 'f_bw',      stamp: '' },
  feat_2xbw_deadlift:   { art: 'f_2bw',     stamp: '' },
  feat_1000_club:       { art: 'f_1000',    stamp: '1000', kgStamp: '450' },
  feat_first_5k:        { art: 'f_5k',      stamp: '5K' },
  feat_sub25_5k:        { art: 'f_sub25',   stamp: '25' },
  feat_marathon:        { art: 'f_mara',    stamp: '42K' },
  feat_century:         { art: 'f_century', stamp: '100' },
  feat_nostos:          { art: 'nostos',    stamp: '' },
  hidden_neomenia:      { art: 'h_neo',     stamp: '' },
  hidden_embolimos:     { art: 'h_emb',     stamp: '29' },
  hidden_three_hundred: { art: 'h_300',     stamp: '300' },
  hidden_eos:           { art: 'h_eos',     stamp: '6 AM' },
  hidden_kairos:        { art: 'h_kai',     stamp: '½' },
  hidden_triad:         { art: 'h_tri',     stamp: '3×' },
  hidden_eniautos:      { art: 'h_eni',     stamp: '1 YR' },
  hidden_pi:            { art: 'h_pi',      stamp: '3.14' },
};

/** The plain shard an unfound hidden badge shows, so its shape gives nothing away */
export const UNFOUND_HIDDEN = 'hidden';

/** Rungs 1 to 2 bronze, 3 to 4 silver, 5 to 7 gold; a ladder's top rung marble.
 *  A ladder of four runs bronze, silver, gold, marble. `rung` counts from 1. */
export function metalFor(rung: number, rungs: number): BadgeMetal {
  const i = rung - 1;
  if (rungs === 4) return (['bronze', 'silver', 'gold', 'marble'] as const)[i] ?? 'marble';
  if (rungs >= 6 && i === rungs - 1) return 'marble';
  return i < 2 ? 'bronze' : i < 4 ? 'silver' : 'gold';
}

/** The threshold as the badge's stamp: 1,000 is "1K", 2,500,000 is "2.5M" */
export function stampFor(threshold: number): string {
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (threshold >= 1_000_000) return `${trim(threshold / 1_000_000)}M`;
  if (threshold >= 1_000) return `${trim(threshold / 1_000)}K`;
  return trim(threshold);
}

export interface BadgeLook {
  art: BadgeArtKey;
  metal: BadgeMetal;
  stamp: string;
  /** Lift name above the Plates bar */
  label?: string;
  /** Plates a side on the Plates bar */
  plates?: number;
  /** A ladder's top rung, which wears the olive crown */
  top: boolean;
}

/** How a badge key is drawn. `threshold` comes from the server (ladders only);
 *  a locked badge keeps its shape and stamp but drops to the locked greys. */
export function badgeLook(key: string, opts: { threshold?: number; weightUnit?: string; locked?: boolean } = {}): BadgeLook {
  const oneOff = ONE_OFF_ART[key];
  if (oneOff) {
    return {
      art: oneOff.art,
      metal: opts.locked ? 'locked' : 'gold',
      stamp: opts.weightUnit === 'kg' && oneOff.kgStamp ? oneOff.kgStamp : oneOff.stamp,
      top: false,
    };
  }
  const cut = key.lastIndexOf('_');
  const track = key.slice(0, cut);
  const rung = Number(key.slice(cut + 1));
  const ladder = LADDER_ART[track];
  if (!ladder || !rung || rung > ladder.rungs) {
    return { art: UNFOUND_HIDDEN, metal: 'locked', stamp: '', top: false };
  }
  const isPlate = ladder.art === 'plate';
  return {
    art: ladder.art,
    metal: opts.locked ? 'locked' : metalFor(rung, ladder.rungs),
    // The mountains' height is in their name
    stamp: track === 'elevation' || opts.threshold == null ? '' : stampFor(opts.threshold),
    label: isPlate ? PLATE_LIFT_LABEL[track] : undefined,
    plates: isPlate ? rung : undefined,
    top: rung === ladder.rungs,
  };
}

/** One line on the name, for the badge back. Plain names ("25 PRs") have none. */
export const BADGE_MEANINGS: Record<string, string> = {
  workouts_1: 'An ephebe was a young Athenian in his first years of training.',
  workouts_2: 'The palaestra was the Greek wrestling school.',
  workouts_3: 'The gymnasion was where Greek athletes trained.',
  workouts_4: 'Hoplites were the citizen soldiers of the Greek cities.',
  workouts_5: 'Hekaton is Greek for one hundred.',
  workouts_6: 'The phalanx was the hoplites’ shield wall, held together.',
  workouts_7: 'Sparta trained its citizens from childhood.',
  workouts_8: 'A chiliad is a thousand of anything.',
  hours_1: 'Hōra is Greek for the hour.',
  hours_2: 'Hemera was the goddess of the day.',
  hours_3: 'Selene, the moon, marked out the month.',
  hours_4: 'Etos is Greek for the year.',
  hours_5: 'An Olympiad was the four years between Games.',
  hours_6: 'Aion was the god of unbounded time.',
  hours_7: 'Chronos is time itself.',
  volume_6: 'Atlas held up the sky.',
  volume_7: 'The Colossus of Rhodes stood over its harbour.',
  volume_8: 'The labours of Herakles were the hardest work the Greeks could imagine.',
  running_2: 'Pheidippides ran from Marathon to Athens with news of the victory.',
  running_7: 'Odysseus took ten years to find his way home.',
  ride_1: 'A hippeus was a Greek horseman.',
  ride_2: 'The hippodrome was the Greek racecourse for horses and chariots.',
  ride_3: 'A quadriga was a chariot drawn by four horses.',
  ride_4: 'Pegasus was the winged horse.',
  ride_5: 'Helios drove the sun’s chariot across the sky.',
  ride_6: 'Okeanos was the river the Greeks believed ran around the world.',
  ride_7: 'The oikoumene was the whole known world.',
  elevation_1: 'Lycabettus is the hill that rises over Athens.',
  elevation_2: 'Hymettus is the mountain east of Athens, known for its honey.',
  elevation_3: 'Parnassus, above Delphi, was the mountain of the Muses.',
  elevation_4: 'Olympus, the highest mountain in Greece, was the home of the gods.',
  elevation_5: 'Olympus, climbed five times over.',
  elevation_6: 'The Dodekatheon were the Twelve gods: one Olympus for each.',
  explorer_1: 'A xenos was a stranger, and a guest.',
  explorer_2: 'A periegetes was a traveller who wrote guides to Greece.',
  explorer_3: 'The Argonauts sailed with Jason for the Golden Fleece.',
  explorer_4: 'A polymath has learned many things.',
  feat_1000_club: 'Herakles carried a club cut from an olive tree.',
  feat_marathon: 'The race is named for the road from Marathon to Athens.',
  feat_nostos: 'Nostos is the Greek homecoming, Odysseus’ return.',
  hidden_neomenia: 'Neomenia was the new moon festival that began each Greek month.',
  hidden_embolimos: 'Embolimos was the Greek name for an inserted day.',
  hidden_three_hundred: 'Three hundred Spartans held the pass at Thermopylae.',
  hidden_eos: 'Eos was the goddess of the dawn.',
  hidden_kairos: 'Kairos was the right moment.',
  hidden_triad: 'A triad is three of a kind.',
  hidden_eniautos: 'Eniautos is the full year come round.',
  hidden_pi: 'The ratio of a circle to its width.',
};

/** What the back's unfound hidden badge says: never a hint at the trigger */
export const UNFOUND_HIDDEN_BACK = 'Keep training. This one finds you.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Hekaton, earned September 28" or "Phalanx, locked, 137 of 250" */
export function badgeAccessibilityLabel(
  title: string,
  state: { earnedAt?: string | null; value?: number; threshold?: number; hiddenUnfound?: boolean },
): string {
  if (state.hiddenUnfound) return 'Hidden badge, not found yet';
  if (state.earnedAt) {
    // earned_at is a naive local datetime from the server; the date part is the workout's day
    const [y, m, d] = state.earnedAt.slice(0, 10).split('-').map(Number);
    return y && m && d ? `${title}, earned ${MONTHS[m - 1]} ${d}` : `${title}, earned`;
  }
  if (state.value != null && state.threshold != null) {
    return `${title}, locked, ${state.value.toLocaleString('en-US')} of ${state.threshold.toLocaleString('en-US')}`;
  }
  return `${title}, locked`;
}
