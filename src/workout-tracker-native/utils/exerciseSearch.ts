// Exercise search shared by the browser and the workout picker. A plain
// substring match missed reordered words and gym shorthand: "incline db"
// found nothing though "Incline Bench Press (Dumbbell)" exists.

// Shorthand lifters type, expanded to the words the library uses
const ALIASES: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bw: 'bodyweight',
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * True when every word of the query appears somewhere in the exercise's name
 * or equipment, in any order. A shorthand word matches either itself or its
 * expansion or as a whole word. An empty query matches everything.
 */
export function matchesExerciseSearch(query: string, ex: { name: string; equipment?: string | null }): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = ` ${normalize(`${ex.name} ${ex.equipment ?? ''}`)} `;
  return words.every(w => {
    // Shorthand only counts as a whole word or its expansion: "bb" sits
    // inside "dumbbell" and would otherwise match every dumbbell lift
    if (ALIASES[w]) return haystack.includes(` ${ALIASES[w]} `) || haystack.includes(` ${w} `);
    // Anything else can be a partial word, since people search as they type
    return haystack.includes(w);
  });
}
