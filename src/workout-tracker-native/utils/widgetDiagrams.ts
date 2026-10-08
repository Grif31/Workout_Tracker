import { File } from 'expo-file-system';
import { muscleDiagramSvg, WIDGET_BODY_COLORS } from './muscleDiagramSvg';
import { diagramKey } from './widgetProps';

// iOS widgets show images only from files in the App Group, and can't draw
// SVG, so Up Next's muscle diagram is rendered in the app: this queue hands
// each missing diagram to components/WidgetDiagramRenderer, which draws the
// SVG, captures it as a PNG and hands the file back here to copy in. Android
// needs none of this: its widget draws the SVG itself.

export const DIAGRAM_SIZE = 240;

export type DiagramJob = { svg: string; file: string };
export type Scheme = 'dark' | 'light';

const queue: DiagramJob[] = [];
let renderer: ((job: DiagramJob | null) => void) | null = null;
let busy = false;
let onRendered: (() => void) | null = null;

export function diagramFile(key: string, scheme: Scheme): string {
  return `diagram_${key}_${scheme}.png`;
}

type Day = { muscles: string[] };

/**
 * The diagrams already in the App Group for these days, by diagramKey, and
 * queues the ones that aren't. A day with no known muscles gets no diagram.
 */
export function widgetDiagrams(
  directory: string | null, days: Day[], accentDark: string, accentLight: string,
): Record<string, { dark: string; light: string }> {
  const found: Record<string, { dark: string; light: string }> = {};
  if (!directory) return found;
  for (const day of days) {
    if (day.muscles.length === 0) continue;
    const key = diagramKey(day.muscles, accentDark, accentLight);
    if (found[key]) continue;
    const files = (['dark', 'light'] as const).map(scheme => new File(directory, diagramFile(key, scheme)));
    if (files.every(f => f.exists)) {
      found[key] = { dark: files[0].uri, light: files[1].uri };
      continue;
    }
    for (const [i, scheme] of (['dark', 'light'] as const).entries()) {
      if (files[i].exists || queue.some(j => j.file === files[i].uri)) continue;
      queue.push({
        file: files[i].uri,
        svg: muscleDiagramSvg(day.muscles, { body: WIDGET_BODY_COLORS[scheme], highlight: scheme === 'dark' ? accentDark : accentLight }, DIAGRAM_SIZE),
      });
    }
  }
  next();
  return found;
}

function next() {
  if (busy || !renderer) return;
  const job = queue.shift() ?? null;
  busy = job != null;
  renderer(job);
}

/** The renderer's end: one job at a time, null when there's nothing to draw. */
export function attachDiagramRenderer(render: (job: DiagramJob | null) => void): () => void {
  renderer = render;
  next();
  return () => { if (renderer === render) renderer = null; };
}

/** The renderer captured `job` to `png` (or failed, with null); copies it in and moves on. */
export async function finishDiagramJob(job: DiagramJob, png: string | null) {
  try {
    if (png) await new File(png).copy(new File(job.file));
  } catch { /* the widget draws without it; the next write queues it again */ }
  busy = false;
  if (queue.length === 0 && png) onRendered?.();
  next();
}

/** Called once a batch is in the App Group, so the widgets redraw with it. */
export function onDiagramsRendered(callback: () => void) {
  onRendered = callback;
}
