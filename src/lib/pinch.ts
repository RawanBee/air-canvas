import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const THUMB_TIP = 4;
const INDEX_TIP = 8;

export function tipDistance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Hysteresis: harder to start drawing than to keep drawing (reduces flicker). */
export function pinchWantsDraw(
  distance: number,
  currentlyDrawing: boolean,
  pinchOn = 0.052,
  pinchOff = 0.072,
): boolean {
  return currentlyDrawing ? distance < pinchOff : distance < pinchOn;
}

/**
 * When the index is high in the frame (small y), perspective makes the pinch
 * look tighter and tracking noisier — widen thresholds so the stroke does not
 * break up while you move.
 */
export function pinchWantsDrawForIndexHeight(
  distance: number,
  currentlyDrawing: boolean,
  indexNy: number,
): boolean {
  const highInFrame = indexNy < 0.22;
  let on = highInFrame ? 0.06 : 0.052;
  let off = highInFrame ? 0.085 : 0.072;
  if (currentlyDrawing) {
    on += 0.01;
    off += 0.022;
  }
  return pinchWantsDraw(distance, currentlyDrawing, on, off);
}

export function getThumbIndexTips(landmarks: NormalizedLandmark[]) {
  return {
    thumb: landmarks[THUMB_TIP],
    index: landmarks[INDEX_TIP],
  };
}
