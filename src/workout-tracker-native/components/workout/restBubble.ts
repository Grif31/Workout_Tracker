// Drag and snap math for the minimized rest timer bubble. Worklets, so the
// gesture can call them on the UI thread; plain functions to everything else.

export const BUBBLE_SIZE = 72;
const EDGE_MARGIN = 8;
const TOP_BOUND = 70;      // stay below the header
const BOTTOM_BOUND = 120;  // stay above the save bar / keyboard toolbar

export type BubbleBounds = { minX: number; maxX: number; minY: number; maxY: number; width: number };

export function bubbleBounds(width: number, height: number): BubbleBounds {
  return {
    minX: EDGE_MARGIN,
    maxX: width - BUBBLE_SIZE - EDGE_MARGIN,
    minY: TOP_BOUND,
    maxY: height - BUBBLE_SIZE - BOTTOM_BOUND,
    width,
  };
}

// Past an edge the bubble keeps following the finger with rising resistance
// (Apple's rubber-band curve) instead of stopping dead.
const RUBBER = 0.55;
const RUBBER_DIM = 200;
export function rubberBand(v: number, min: number, max: number): number {
  'worklet';
  if (v < min) return min - (1 - 1 / (((min - v) * RUBBER) / RUBBER_DIM + 1)) * RUBBER_DIM;
  if (v > max) return max + (1 - 1 / (((v - max) * RUBBER) / RUBBER_DIM + 1)) * RUBBER_DIM;
  return v;
}

// Where a released bubble comes to rest: the side it was heading for, judged
// from its position plus a short projection of the flick's velocity (px/s), so
// a flick toward the far side gets there without a full drag. Height is kept,
// within bounds.
const MOMENTUM_S = 0.2;
export function bubbleRestPoint(x: number, y: number, vx: number, vy: number, b: BubbleBounds): { x: number; y: number } {
  'worklet';
  const px = x + vx * MOMENTUM_S;
  const py = y + vy * MOMENTUM_S;
  return {
    x: px + BUBBLE_SIZE / 2 < b.width / 2 ? b.minX : b.maxX,
    y: Math.min(b.maxY, Math.max(b.minY, py)),
  };
}
