import type { Pt } from './smoothing';

const CORE = '#fffef5';

function strokeSegmentGlow(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  color: string,
  lineWidth: number,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = lineWidth * 5.5;
  ctx.shadowBlur = 36;
  ctx.shadowColor = color;
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.lineWidth = lineWidth * 2.4;
  ctx.shadowBlur = 18;
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.8, lineWidth * 0.42);
  ctx.strokeStyle = CORE;
  ctx.stroke();
  ctx.restore();
}

/** One frame of ink: neon halo + bright core between two smoothed canvas points. */
export function drawNeonSegment(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  color: string,
  lineWidth: number,
) {
  strokeSegmentGlow(ctx, from, to, color, lineWidth);
}

export function drawEraseSegment(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  lineWidth: number,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.lineWidth = lineWidth * 3.2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/** Redraw full stroke (undo / resize) using the same neon recipe. */
export function renderStrokeOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  color: string,
  lineWidth: number,
  erase: boolean,
) {
  if (points.length < 2) return;
  for (let i = 1; i < points.length; i++) {
    if (erase) {
      drawEraseSegment(ctx, points[i - 1], points[i], lineWidth);
    } else {
      drawNeonSegment(ctx, points[i - 1], points[i], color, lineWidth);
    }
  }
}
