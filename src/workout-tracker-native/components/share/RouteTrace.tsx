import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export type LatLng = { latitude: number; longitude: number };

type Projected = { path: string; start: { x: number; y: number }; end: { x: number; y: number } } | null;

// Projects GPS coords into an SVG path that fits a width×height box.
// Equirectangular projection with latitude correction so routes keep their
// real-world shape; aspect preserved and centered; y flipped (north = up).
export function projectRoute(
  coords: LatLng[],
  width: number,
  height: number,
  padding = 16,
): Projected {
  if (coords.length < 2) return null;

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

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return { path, start: points[0], end: points[points.length - 1] };
}

type Props = {
  coords: LatLng[];
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
