import { MUSCLE_SLUGS, muscleDiagramSvg, muscleKey } from '../utils/muscleDiagramSvg';

const COLORS = { body: '#48484A', highlight: '#30D158' };
const lit = (svg: string) => (svg.match(/fill="#30D158"/g) ?? []).length;

describe('muscleDiagramSvg', () => {
  it('draws both figures unlit with no muscles', () => {
    const svg = muscleDiagramSvg([], COLORS);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 1448 1448">')).toBe(true);
    expect(lit(svg)).toBe(0);
    // One flat drawing: neither widget renderer has to support nested <svg>
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });

  it('lights more of the body for more muscles, matching names in any case', () => {
    const back = lit(muscleDiagramSvg(['back'], COLORS));
    expect(back).toBeGreaterThan(0);
    expect(lit(muscleDiagramSvg(['Back', 'Biceps'], COLORS))).toBeGreaterThan(back);
  });

  it('ignores a muscle group it has no body part for', () => {
    expect(lit(muscleDiagramSvg(['Cardio'], COLORS))).toBe(0);
  });

  it('shares its map with MuscleDiagram', () => {
    expect(muscleKey('quads')).toBe('Quads');
    expect(MUSCLE_SLUGS.Glutes.back).toEqual(['gluteal']);
  });
});
