import { attachDiagramRenderer, diagramFile, finishDiagramJob, onDiagramsRendered, widgetDiagrams, type DiagramJob } from '../utils/widgetDiagrams';
import { diagramKey } from '../utils/widgetProps';

// A tiny in-memory App Group: mockFiles exist once copied in
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).reduce((a, b) => (a.endsWith('/') ? a + b : `${a}/${b}`));
    }
    get exists() { return mockFiles.has(this.uri); }
    async copy(dest: { uri: string }) { mockFiles.add(dest.uri); }
  },
}));

const DIR = 'file:///group/ExpoWidgets/';
const days = [{ muscles: ['Chest'] }, { muscles: ['Back', 'Biceps'] }, { muscles: [] }];

describe('widgetDiagrams', () => {
  beforeEach(() => mockFiles.clear());

  it('queues each missing diagram in both schemes, renders them one at a time, then asks for a redraw', async () => {
    const jobs: (DiagramJob | null)[] = [];
    const redraw = jest.fn();
    onDiagramsRendered(redraw);
    const detach = attachDiagramRenderer(job => jobs.push(job));

    // A day with no known muscles gets no diagram
    expect(widgetDiagrams(DIR, days, '#30D158', '#1C7F35')).toEqual({});
    let rendered = 0;
    while (jobs[jobs.length - 1]) {
      const job = jobs[jobs.length - 1]!;
      expect(job.svg).toContain('<svg');
      await finishDiagramJob(job, `file:///tmp/capture${rendered++}.png`);
    }
    expect(rendered).toBe(4);
    expect(redraw).toHaveBeenCalledTimes(1);

    // The next write finds them in the App Group, by day
    const key = diagramKey(['Back', 'Biceps'], '#30D158', '#1C7F35');
    const found = widgetDiagrams(DIR, days, '#30D158', '#1C7F35');
    expect(found[key]).toEqual({ dark: `${DIR}${diagramFile(key, 'dark')}`, light: `${DIR}${diagramFile(key, 'light')}` });
    detach();
  });

  it('does nothing without an App Group', () => {
    expect(widgetDiagrams(null, days, '#30D158', '#1C7F35')).toEqual({});
  });
});
