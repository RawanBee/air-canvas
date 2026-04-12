export type Pt = { x: number; y: number };

export type NormPt = { nx: number; ny: number };

export function expSmooth(prev: Pt | null, raw: Pt, alpha = 0.38): Pt {
  if (!prev) return { ...raw };
  return {
    x: alpha * raw.x + (1 - alpha) * prev.x,
    y: alpha * raw.y + (1 - alpha) * prev.y,
  };
}

/** Smooth in MediaPipe normalized space so strokes survive layout / DPR changes. */
export function expSmoothNorm(
  prev: NormPt | null,
  raw: NormPt,
  alpha = 0.38,
): NormPt {
  if (!prev) return { ...raw };
  return {
    nx: alpha * raw.nx + (1 - alpha) * prev.nx,
    ny: alpha * raw.ny + (1 - alpha) * prev.ny,
  };
}
