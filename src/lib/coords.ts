/** Map object-fit: cover box from video intrinsic size to canvas CSS pixels. */
export function getCoverTransform(
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
) {
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  const ox = (canvasW - dispW) / 2;
  const oy = (canvasH - dispH) / 2;
  return { scale, ox, oy };
}

/**
 * MediaPipe landmarks are normalized to the source frame (videoWidth × videoHeight).
 * Map to canvas coordinates, matching a mirrored video preview when `mirror` is true.
 */
export function normToCanvas(
  nx: number,
  ny: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
  mirror: boolean,
): { x: number; y: number } {
  const { scale, ox, oy } = getCoverTransform(
    videoW,
    videoH,
    canvasW,
    canvasH,
  );
  let x = nx * videoW * scale + ox;
  const y = ny * videoH * scale + oy;
  if (mirror) x = canvasW - x;
  return { x, y };
}
