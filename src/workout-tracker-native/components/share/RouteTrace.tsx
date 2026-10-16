import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { asSegments, type LatLng } from '../../utils/routeSegments';

export type { LatLng };

type Projected = { path: string; start: { x: number; y: number }; end: { x: number; y: number } } | null;

// Projects GPS coords into an SVG path that fits a width×height box.
// Equirectangular projection with latitude correction so routes keep their
// real-world shape; aspect preserved and centered; y flipped (north = up).
// A route in segments (utils/routeSegments.ts) is one path with a fresh M per
// segment, so a gap in the recording stays a gap instead of a straight line.
export function projectRoute(
  route: LatLng[] | LatLng[][],
  width: number,
  height: number,
  padding = 16,
): Projected {
  const segments = asSegments(route);
  if (segments.length === 0) return null;
  const coords = segments.flat();

  const midLat = coords.reduce((s, c) => s + c.latitude, 0) / coords.length;
  const lngScale = Math.cos((midLat * Math.PI) / 180);

  const xs = coords.map(c => c.longitude * lngScale);
  const ys = coords.map(c => c.latitude);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  // Degenerate spans (straight N-S or E-W line) still need a finite scale
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  );
  const safeScale = Number.isFinite(scale) ? scale : 1;

  const offsetX = padding + (innerW - spanX * safeScale) / 2;
  const offsetY = padding + (innerH - spanY * safeScale) / 2;

  const points = coords.map((_, i) => ({
    x: offsetX + (xs[i] - minX) * safeScale,
    y: height - (offsetY + (ys[i] - minY) * safeScale),
  }));

  // Where each segment begins in the flattened list
  const starts = new Set<number>();
  segments.reduce((at, seg) => { starts.add(at); return at + seg.length; }, 0);
  const path = points
    .map((p, i) => `${starts.has(i) ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return { path, start: points[0], end: points[points.length - 1] };
}

type Props = {
  coords: LatLng[] | LatLng[][];
  width: number;
  height: number;
  strokeColor: string;
};

export default function RouteTrace({ coords, width, height, strokeColor }: Props) {
  const projected = projectRoute(coords, width, height);
  if (!projected) return null;

  return (
    <Svg width={width} height={height}>
      <Path
        d={projected.path}
        stroke={strokeColor}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={projected.start.x} cy={projected.start.y} r={6} fill={strokeColor} />
      <Circle
        cx={projected.end.x}
        cy={projected.end.y}
        r={6}
        fill="#0D0D0D"
        stroke="#FFFFFF"
        strokeWidth={2.5}
      />
    </Svg>
  );
}
