import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const THUMB_TIP = 4;
const INDEX_TIP = 8;

export function tipDistance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Drawing only when thumb and index tips are effectively **touching** (distance
 * ~0 in normalized image space). Webcam noise means we use a tiny epsilon, not
 * literal 0.
 *
 * Hysteresis: a hair looser while already drawing so one noisy frame doesn’t
 * instantly lift the pen.
 */
const TOUCH_DRAW_MAX = 0.04;
const TOUCH_HOLD_MAX = 0.056;

export function pinchWantsDraw(
  distance: number,
  currentlyDrawing: boolean,
  touchToStart = TOUCH_DRAW_MAX,
  touchToHold = TOUCH_HOLD_MAX,
): boolean {
  return currentlyDrawing ? distance < touchToHold : distance < touchToStart;
}

/** Same as {@link pinchWantsDraw}; index height kept for call-site compatibility. */
export function pinchWantsDrawForIndexHeight(
  distance: number,
  currentlyDrawing: boolean,
  _indexNy: number,
): boolean {
  void _indexNy;
  return pinchWantsDraw(distance, currentlyDrawing);
}

export function getThumbIndexTips(landmarks: NormalizedLandmark[]) {
  return {
    thumb: landmarks[THUMB_TIP],
    index: landmarks[INDEX_TIP],
  };
}
