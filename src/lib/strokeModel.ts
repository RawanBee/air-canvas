import type { NormPt, Pt } from './smoothing';

export type Stroke = {
  points: NormPt[];
  color: string;
  width: number;
  erase?: boolean;
};

export function strokeToCanvasPoints(
  stroke: Stroke,
  map: (nx: number, ny: number) => Pt,
): Pt[] {
  return stroke.points.map((p) => map(p.nx, p.ny));
}
