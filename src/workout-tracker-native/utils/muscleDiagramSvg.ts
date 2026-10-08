import type { BodyPart, Slug } from 'react-native-body-highlighter';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';

// Which body-highlighter parts light up for each muscle group the app uses.
// Shared by MuscleDiagram (the app) and muscleDiagramSvg (the widgets) so the
// two never disagree about what a Pull day works.
export const MUSCLE_SLUGS: Record<string, { front: Slug[]; back: Slug[] }> = {
  Chest:        { front: ['chest'],                    back: [] },
  Back:         { front: [],                           back: ['upper-back', 'trapezius'] },
  'Lower Back': { front: [],                           back: ['lower-back'] },
  Shoulders:    { front: ['deltoids'],                 back: ['deltoids'] },
  Biceps:       { front: ['biceps'],                   back: [] },
  Triceps:      { front: [],                           back: ['triceps'] },
  Forearms:     { front: ['forearm'],                  back: ['forearm'] },
  Quads:        { front: ['quadriceps'],               back: [] },
  Quadriceps:   { front: ['quadriceps'],               back: [] },
  Hamstrings:   { front: [],                           back: ['hamstring'] },
  Calves:       { front: ['calves'],                   back: ['calves'] },
  Core:         { front: ['abs', 'obliques'],          back: [] },
  Abs:          { front: ['abs', 'obliques'],          back: [] },
  Glutes:       { front: [],                           back: ['gluteal'] },
};

/** The unlit body on each widget background: one step lighter than the surface in dark, darker in light. */
export const WIDGET_BODY_COLORS = { dark: '#48484A', light: '#D1D1D6' } as const;

/** The key in MUSCLE_SLUGS for a muscle name, matched without regard to case. */
export function muscleKey(muscle: string): string | undefined {
  return Object.keys(MUSCLE_SLUGS).find(k => k.toLowerCase() === muscle.toLowerCase());
}

function paths(parts: BodyPart[], lit: Set<Slug>, body: string, highlight: string): string {
  return parts
    .filter(p => p.slug && p.slug !== 'hair')
    .flatMap(p => {
      const fill = lit.has(p.slug as Slug) ? highlight : body;
      const d = [...(p.path?.left ?? []), ...(p.path?.right ?? []), ...(p.path?.common ?? [])];
      return d.map(path => `<path d="${path}" fill="${fill}"/>`);
    })
    .join('');
}

/**
 * The front and back figures side by side, with `muscles` lit: the same
 * outlines MuscleDiagram draws, as one SVG string. The widgets can't mount
 * react-native-body-highlighter, so Android draws this with SvgWidget and
 * iOS gets it rasterized to a PNG by the app (components/WidgetDiagramRenderer).
 */
export function muscleDiagramSvg(muscles: string[], colors: { body: string; highlight: string }, size = 240): string {
  const front = new Set<Slug>();
  const back = new Set<Slug>();
  for (const m of muscles) {
    const key = muscleKey(m);
    if (!key) continue;
    MUSCLE_SLUGS[key].front.forEach(s => front.add(s));
    MUSCLE_SLUGS[key].back.forEach(s => back.add(s));
  }
  // The library draws each side through its own viewBox (front 0-724, back
  // 724-1448), so the paths already sit side by side on one 1448 canvas: no
  // nested <svg>, which neither widget renderer has to support.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1448 1448">`
    + paths(bodyFront, front, colors.body, colors.highlight)
    + paths(bodyBack, back, colors.body, colors.highlight)
    + '</svg>';
}
