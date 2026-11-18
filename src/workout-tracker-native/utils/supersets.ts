// Superset rules, mirrored by utils/supersets.py on the server (the two share
// test cases). Exercises sharing a superset_group are a superset: always next
// to each other, at least two of them, never cardio. Stored numbers are only
// keys; letters (A, B, ...) come from position.
//
// A round is the i-th working set (anything but a warm-up) across every member
// that has one, so warm-ups never throw the pairing off and uneven set counts
// just drop a member out of later rounds.

type SetLike = { set_type?: string; done?: boolean };
/** What grouping needs; templates have no sets */
export type SupersetItem = {
  exercise_type?: string;
  superset_group?: number | null;
};
export type SupersetMember = SupersetItem & { sets: SetLike[] };

export type SupersetPosition = {
  /** "A1", "A2", "B1"... */
  label: string;
  /** "A" */
  letter: string;
  /** 1-based position in its superset */
  position: number;
  size: number;
};

// Case-insensitive like utils/supersets.py, which lowercases before comparing
const isCardio = (ex: { exercise_type?: string }) => ex.exercise_type?.toLowerCase() === 'cardio';
export const canJoinSuperset = (ex: { exercise_type?: string }) => !isCardio(ex);

function withGroup<E extends SupersetItem>(ex: E, group: number | null): E {
  return (ex.superset_group ?? null) === group ? ex : { ...ex, superset_group: group };
}

/** Same rules as the server's normalize_superset_groups. Unchanged entries keep their identity. */
export function normalizeSupersets<E extends SupersetItem>(exercises: E[]): E[] {
  const groups = exercises.map(ex => (isCardio(ex) ? null : ex.superset_group ?? null));
  const result = groups.slice();
  const seen = new Set<number>();
  let nextGroup = 1;
  let i = 0;
  while (i < groups.length) {
    const key = groups[i];
    let end = i + 1;
    if (key != null) while (end < groups.length && groups[end] === key) end++;
    if (key != null) {
      // Only a key's first run survives: a member moved away from its
      // partners leaves the superset rather than splitting it in two
      const keep = !seen.has(key) && end - i >= 2;
      seen.add(key);
      for (let k = i; k < end; k++) result[k] = keep ? nextGroup : null;
      if (keep) nextGroup++;
    }
    i = end;
  }
  const out = exercises.map((ex, k) => withGroup(ex, result[k]));
  return out.every((ex, k) => ex === exercises[k]) ? exercises : out;
}

function groupBounds(exercises: SupersetItem[], idx: number): [number, number] {
  const key = exercises[idx]?.superset_group;
  if (key == null) return [idx, idx];
  let start = idx;
  let end = idx;
  while (start > 0 && exercises[start - 1].superset_group === key) start--;
  while (end < exercises.length - 1 && exercises[end + 1].superset_group === key) end++;
  return [start, end];
}

/**
 * Puts `partner` in `anchor`'s superset (or starts one), moving it to just
 * after the superset's last member. A partner already in another superset
 * leaves that one.
 */
export function pairExercises<E extends SupersetItem>(exercises: E[], anchor: number, partner: number): E[] {
  if (anchor === partner || !exercises[anchor] || !exercises[partner]) return exercises;
  if (!canJoinSuperset(exercises[anchor]) || !canJoinSuperset(exercises[partner])) return exercises;
  const used = exercises.map(e => e.superset_group ?? 0);
  const key = exercises[anchor].superset_group ?? Math.max(0, ...used) + 1;
  const list = exercises.map((ex, i) => (i === anchor ? withGroup(ex, key) : ex));
  const [moved] = list.splice(partner, 1);
  const [, end] = groupBounds(list, partner < anchor ? anchor - 1 : anchor);
  list.splice(end + 1, 0, withGroup(moved, key));
  return normalizeSupersets(list);
}

/** Takes one exercise out of its superset, moving it to just after the rest so a tri-set stays whole. */
export function removeFromSuperset<E extends SupersetItem>(exercises: E[], idx: number): E[] {
  const ex = exercises[idx];
  if (!ex || ex.superset_group == null) return exercises;
  const [, end] = groupBounds(exercises, idx);
  const list = exercises.slice();
  list.splice(idx, 1);
  list.splice(end, 0, withGroup(ex, null));
  return normalizeSupersets(list);
}

/** Per exercise, where it sits in its superset; null when it isn't in one. */
export function supersetPositions(exercises: SupersetItem[]): (SupersetPosition | null)[] {
  const out: (SupersetPosition | null)[] = exercises.map(() => null);
  let groupCount = 0;
  let i = 0;
  while (i < exercises.length) {
    const key = exercises[i].superset_group;
    if (key == null) { i++; continue; }
    const [, end] = groupBounds(exercises, i);
    const letter = String.fromCharCode(65 + (groupCount % 26));
    groupCount++;
    const size = end - i + 1;
    for (let k = i; k <= end; k++) {
      const position = k - i + 1;
      out[k] = { label: `${letter}${position}`, letter, position, size };
    }
    i = end + 1;
  }
  return out;
}

const workingSetIndices = (sets: SetLike[]) =>
  sets.reduce<number[]>((acc, s, i) => (s.set_type === 'W' ? acc : [...acc, i]), []);

/** Which round a set is in, or null for a warm-up or a missing set. */
function roundOf(sets: SetLike[], setIdx: number): number | null {
  if (!sets[setIdx] || sets[setIdx].set_type === 'W') return null;
  return workingSetIndices(sets).indexOf(setIdx);
}

/**
 * Checking (exIdx, setIdx) off: does it finish its round? True outside a
 * superset and for a warm-up (today's behavior applies). Counts that set as
 * done, since callers ask before the state update lands.
 */
export function completesRound(exercises: SupersetMember[], exIdx: number, setIdx: number): boolean {
  const ex = exercises[exIdx];
  if (!ex || ex.superset_group == null) return true;
  const round = roundOf(ex.sets, setIdx);
  if (round == null) return true;
  const [start, end] = groupBounds(exercises, exIdx);
  for (let k = start; k <= end; k++) {
    if (k === exIdx) continue;
    const at = workingSetIndices(exercises[k].sets)[round];
    if (at != null && !exercises[k].sets[at].done) return false;
  }
  return true;
}

/**
 * The set to go to after checking (exIdx, setIdx) off when that didn't finish
 * the round: the next member (wrapping) whose set in this round isn't done.
 */
export function nextInRound(
  exercises: SupersetMember[], exIdx: number, setIdx: number,
): { exIdx: number; setIdx: number } | null {
  const ex = exercises[exIdx];
  if (!ex || ex.superset_group == null) return null;
  const round = roundOf(ex.sets, setIdx);
  if (round == null) return null;
  const [start, end] = groupBounds(exercises, exIdx);
  const size = end - start + 1;
  for (let step = 1; step < size; step++) {
    const k = start + ((exIdx - start + step) % size);
    const at = workingSetIndices(exercises[k].sets)[round];
    if (at != null && !exercises[k].sets[at].done) return { exIdx: k, setIdx: at };
  }
  return null;
}

/**
 * Every set in the order it's logged: down the list, except that a superset
 * goes warm-ups first, then round by round across its members.
 */
export function logOrder(exercises: SupersetMember[]): { exIdx: number; setIdx: number }[] {
  const out: { exIdx: number; setIdx: number }[] = [];
  let i = 0;
  while (i < exercises.length) {
    const [start, end] = groupBounds(exercises, i);
    if (start === end) {
      exercises[i].sets.forEach((_, s) => out.push({ exIdx: i, setIdx: s }));
    } else {
      for (let k = start; k <= end; k++) {
        exercises[k].sets.forEach((s, j) => { if (s.set_type === 'W') out.push({ exIdx: k, setIdx: j }); });
      }
      const working = exercises.slice(start, end + 1).map(e => workingSetIndices(e.sets));
      const rounds = Math.max(...working.map(w => w.length));
      for (let r = 0; r < rounds; r++) {
        working.forEach((w, m) => { if (w[r] != null) out.push({ exIdx: start + m, setIdx: w[r] }); });
      }
    }
    i = end + 1;
  }
  return out;
}

/**
 * The exercise the lifter is on: the first with a set left, except inside a
 * superset, where it's the member owning the next set of the earliest
 * unfinished round (warm-ups first).
 */
export function currentExerciseIndex(exercises: SupersetMember[]): number {
  const first = exercises.findIndex(e => e.sets.some(s => !s.done));
  if (first < 0) return exercises.length - 1;
  if (exercises[first].superset_group == null) return first;
  const [start, end] = groupBounds(exercises, first);
  for (let k = start; k <= end; k++) {
    if (exercises[k].sets.some(s => s.set_type === 'W' && !s.done)) return k;
  }
  const rounds = Math.max(...exercises.slice(start, end + 1).map(e => workingSetIndices(e.sets).length));
  for (let r = 0; r < rounds; r++) {
    for (let k = start; k <= end; k++) {
      const at = workingSetIndices(exercises[k].sets)[r];
      if (at != null && !exercises[k].sets[at].done) return k;
    }
  }
  return first;
}
