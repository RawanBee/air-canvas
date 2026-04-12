import type { NormPt } from './smoothing';

const CLAMP = 0.998;
const MAX_STEP = 0.056;
const MAX_STEP_EDGE = 0.038;
/** Top of frame: partial fingers + perspective cause the worst landmark spikes. */
const MAX_STEP_TOP = 0.026;

function clamp01(n: number) {
  return Math.min(CLAMP, Math.max(1 - CLAMP, n));
}

function isTopBand(ny: number) {
  return ny < 0.2;
}

function isEdge(nx: number, ny: number) {
  return nx < 0.07 || nx > 0.93 || ny < 0.1 || ny > 0.9;
}

function maxStepFor(nx: number, ny: number): number {
  if (isTopBand(ny)) return MAX_STEP_TOP;
  if (isEdge(nx, ny)) return MAX_STEP_EDGE;
  return MAX_STEP;
}

/**
 * Reject single-frame landmark spikes (common at frame edges / top of image)
 * by limiting how far the index tip can jump between camera frames.
 */
export function stabilizeNormTip(prev: NormPt | null, raw: NormPt): NormPt {
  const next = {
    nx: clamp01(raw.nx),
    ny: clamp01(raw.ny),
  };
  if (!prev) return next;
  const dx = next.nx - prev.nx;
  const dy = next.ny - prev.ny;
  const d = Math.hypot(dx, dy);
  const cap = maxStepFor(next.nx, next.ny);
  if (d <= cap) return next;
  const s = cap / d;
  return { nx: prev.nx + dx * s, ny: prev.ny + dy * s };
}
