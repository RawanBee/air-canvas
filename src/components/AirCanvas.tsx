import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { normToCanvas } from '../lib/coords';
import {
  GESTURE_ENTER_FRAMES,
  GESTURE_EXIT_FRAMES,
  HAND_LOST_GRACE_CAMERA_FRAMES,
} from '../lib/gestureConstants';
import { createDrawGestureMachine } from '../lib/gestureMachine';
import {
  getThumbIndexTips,
  pinchWantsDrawForIndexHeight,
  tipDistance2D,
} from '../lib/pinch';
import { stabilizeNormTip } from '../lib/stabilizeTip';
import { drawNeonSegment, drawEraseSegment, renderStrokeOnCanvas } from '../lib/renderNeon';
import { expSmoothNorm, type NormPt, type Pt } from '../lib/smoothing';
import { strokeToCanvasPoints, type Stroke } from '../lib/strokeModel';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const INDEX_TIP = 8;
/** Blend toward latest landmark each animation frame (display rate), not only on camera frames. */
const SMOOTH_ALPHA_DRAW = 0.62;
const SMOOTH_ALPHA_DRAW_TOP = 0.5;
const SMOOTH_ALPHA_HOVER = 0.48;

export type AirCanvasProps = {
  brushColor: string;
  brushSize: number;
  mirror: boolean;
  debug: boolean;
  cameraHidden: boolean;
  tool: 'draw' | 'erase';
  videoDim: number;
  /** Live HUD: pinch distance, draw state, why strokes ended */
  diagnostics: boolean;
};

export type AirCanvasHandle = {
  clear: () => void;
  undo: () => void;
  savePng: () => void;
};

function syncCanvasToStage(
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w < 2 || h < 2) return null;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export const AirCanvas = forwardRef<AirCanvasHandle, AirCanvasProps>(
  function AirCanvas(
    {
      brushColor,
      brushSize,
      mirror,
      debug,
      cameraHidden,
      tool,
      videoDim,
      diagnostics,
    },
    ref,
  ) {
    const stageRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const paintRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    const landmarkerRef = useRef<HandLandmarker | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const activeStrokeRef = useRef<NormPt[]>([]);
    const smoothedNormRef = useRef<NormPt | null>(null);
    const prevGestureDrawingRef = useRef(false);
    const gestureRef = useRef(
      createDrawGestureMachine(GESTURE_ENTER_FRAMES, GESTURE_EXIT_FRAMES),
    );
    const lastVideoTimeRef = useRef(-1);
    const hadLandmarksRef = useRef(false);
    const lastRawNormRef = useRef<NormPt | null>(null);
    const lastLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
    const drawingNowRef = useRef(false);
    const lastPaintCanvasRef = useRef<Pt | null>(null);
    const stabilizedTipPrevRef = useRef<NormPt | null>(null);
    const handLostStreakRef = useRef(0);
    const lastPinchDistRef = useRef<number | null>(null);
    const lastStrokeStopRef = useRef<string>('—');
    const strokeStopLogRef = useRef<string[]>([]);

    const optsRef = useRef({
      brushColor,
      brushSize,
      mirror,
      debug,
      diagnostics,
      cameraHidden,
      tool,
      videoDim,
    });
    useLayoutEffect(() => {
      optsRef.current = {
        brushColor,
        brushSize,
        mirror,
        debug,
        diagnostics,
        cameraHidden,
        tool,
        videoDim,
      };
    });

    const logStrokeStop = useCallback((reason: string) => {
      lastStrokeStopRef.current = reason;
      const log = strokeStopLogRef.current;
      const t = new Date().toISOString().slice(11, 23);
      log.unshift(`${t} ${reason}`);
      log.length = Math.min(8, log.length);
    }, []);

    const [modelStatus, setModelStatus] = useState<
      'loading' | 'ready' | 'error'
    >('loading');
    const [modelError, setModelError] = useState<string | null>(null);
    const [camError, setCamError] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);

    const mapNorm = useCallback(
      (nx: number, ny: number, vw: number, vh: number): Pt => {
        const stage = stageRef.current;
        if (!stage) return { x: 0, y: 0 };
        return normToCanvas(
          nx,
          ny,
          vw,
          vh,
          stage.clientWidth,
          stage.clientHeight,
          optsRef.current.mirror,
        );
      },
      [],
    );

    const redrawAll = useCallback(() => {
      const stage = stageRef.current;
      const paint = paintRef.current;
      const video = videoRef.current;
      if (!stage || !paint || !video?.videoWidth) return;
      const pctx = syncCanvasToStage(paint, stage);
      if (!pctx) return;
      const { clientWidth: cw, clientHeight: ch } = stage;
      pctx.clearRect(0, 0, cw, ch);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const m = optsRef.current.mirror;
      for (const s of strokesRef.current) {
        const pts = strokeToCanvasPoints(s, (nx, ny) =>
          normToCanvas(nx, ny, vw, vh, cw, ch, m),
        );
        renderStrokeOnCanvas(
          pctx,
          pts,
          s.color,
          s.width,
          !!s.erase,
        );
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          strokesRef.current = [];
          activeStrokeRef.current = [];
          smoothedNormRef.current = null;
          prevGestureDrawingRef.current = false;
          drawingNowRef.current = false;
          lastRawNormRef.current = null;
          lastLandmarksRef.current = null;
          lastPaintCanvasRef.current = null;
          stabilizedTipPrevRef.current = null;
          handLostStreakRef.current = 0;
          strokeStopLogRef.current = [];
          lastStrokeStopRef.current = '—';
          lastPinchDistRef.current = null;
          gestureRef.current = createDrawGestureMachine(
            GESTURE_ENTER_FRAMES,
            GESTURE_EXIT_FRAMES,
          );
          const stage = stageRef.current;
          const paint = paintRef.current;
          if (stage && paint) {
            const ctx = syncCanvasToStage(paint, stage);
            if (ctx) {
              ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
            }
          }
        },
        undo: () => {
          if (strokesRef.current.length === 0) return;
          strokesRef.current.pop();
          redrawAll();
        },
        savePng: () => {
          const paint = paintRef.current;
          if (!paint) return;
          const a = document.createElement('a');
          a.download = `air-canvas-${Date.now()}.png`;
          a.href = paint.toDataURL('image/png');
          a.click();
        },
      }),
      [redrawAll],
    );

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
          if (cancelled) return;
          const handLandmarker = await HandLandmarker.createFromOptions(
            vision,
            {
              baseOptions: { modelAssetPath: MODEL_URL },
              numHands: 1,
              runningMode: 'VIDEO',
              minHandDetectionConfidence: 0.55,
              minHandPresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            },
          );
          if (cancelled) {
            handLandmarker.close();
            return;
          }
          landmarkerRef.current = handLandmarker;
          setModelStatus('ready');
        } catch (e) {
          setModelStatus('error');
          setModelError(e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        cancelled = true;
        landmarkerRef.current?.close();
        landmarkerRef.current = null;
      };
    }, []);

    useEffect(() => {
      let cancelled = false;
      let stream: MediaStream | null = null;

      (async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          const v = videoRef.current;
          if (!v) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          v.srcObject = s;
          await v.play();
          if (cancelled) return;
          setCamError(null);
        } catch (e) {
          if (cancelled) return;
          stream?.getTracks().forEach((t) => t.stop());
          const errName = e instanceof Error ? e.name : '';
          if (errName === 'AbortError') {
            return;
          }
          setCamError(
            'Camera access was denied or is unavailable. Allow the webcam to use Air Canvas.',
          );
        }
      })();

      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, []);

    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const ro = new ResizeObserver(() => {
        redrawAll();
      });
      ro.observe(stage);
      return () => ro.disconnect();
    }, [redrawAll]);

    useEffect(() => {
      if (modelStatus !== 'ready' || !videoReady) return;

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const video = videoRef.current;
        const stage = stageRef.current;
        const paint = paintRef.current;
        const overlay = overlayRef.current;
        const landmarker = landmarkerRef.current;
        if (
          !video ||
          !stage ||
          !paint ||
          !overlay ||
          !landmarker ||
          video.readyState < 2
        ) {
          return;
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw < 2 || vh < 2) return;

        const pctx = syncCanvasToStage(paint, stage);
        const octx = syncCanvasToStage(overlay, stage);
        if (!pctx || !octx) return;

        const { clientWidth: cw, clientHeight: ch } = stage;
        const opt = optsRef.current;

        octx.clearRect(0, 0, cw, ch);

        const newVideoFrame = video.currentTime !== lastVideoTimeRef.current;
        if (newVideoFrame) {
          lastVideoTimeRef.current = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          const lm = result.landmarks[0];

          if (lm) {
            handLostStreakRef.current = 0;
            hadLandmarksRef.current = true;
            lastLandmarksRef.current = lm;
            const { thumb, index } = getThumbIndexTips(lm);
            const dist = tipDistance2D(thumb, index);
            lastPinchDistRef.current = dist;
            const idx = lm[INDEX_TIP];
            const rawTip = { nx: idx.x, ny: idx.y };
            stabilizedTipPrevRef.current = stabilizeNormTip(
              stabilizedTipPrevRef.current,
              rawTip,
            );
            lastRawNormRef.current = stabilizedTipPrevRef.current;

            const wasGesturing = prevGestureDrawingRef.current;
            const pinchActive = pinchWantsDrawForIndexHeight(
              dist,
              wasGesturing,
              idx.y,
            );
            const newDrawingNow = gestureRef.current(pinchActive);

            if (wasGesturing && !newDrawingNow && activeStrokeRef.current.length > 1) {
              logStrokeStop(
                `tips_separated (gap ${dist.toFixed(3)}, draw only when nearly touching)`,
              );
              strokesRef.current.push({
                points: [...activeStrokeRef.current],
                color: opt.brushColor,
                width: opt.brushSize,
                erase: opt.tool === 'erase',
              });
            }
            if (!newDrawingNow) {
              activeStrokeRef.current = [];
              lastPaintCanvasRef.current = null;
            }
            prevGestureDrawingRef.current = newDrawingNow;
            drawingNowRef.current = newDrawingNow;
          } else {
            const trackingOrDrawing =
              hadLandmarksRef.current || prevGestureDrawingRef.current;
            if (trackingOrDrawing) {
              handLostStreakRef.current += 1;
            } else {
              handLostStreakRef.current = 0;
            }

            if (
              handLostStreakRef.current >= HAND_LOST_GRACE_CAMERA_FRAMES &&
              trackingOrDrawing
            ) {
              if (hadLandmarksRef.current) {
                gestureRef.current = createDrawGestureMachine(
                  GESTURE_ENTER_FRAMES,
                  GESTURE_EXIT_FRAMES,
                );
              }
              if (prevGestureDrawingRef.current && activeStrokeRef.current.length > 1) {
                logStrokeStop(
                  `hand_lost (${HAND_LOST_GRACE_CAMERA_FRAMES}+ camera frames, no landmarks)`,
                );
                const o = optsRef.current;
                strokesRef.current.push({
                  points: [...activeStrokeRef.current],
                  color: o.brushColor,
                  width: o.brushSize,
                  erase: o.tool === 'erase',
                });
              }
              hadLandmarksRef.current = false;
              lastLandmarksRef.current = null;
              lastRawNormRef.current = null;
              stabilizedTipPrevRef.current = null;
              activeStrokeRef.current = [];
              lastPaintCanvasRef.current = null;
              prevGestureDrawingRef.current = false;
              drawingNowRef.current = false;
              smoothedNormRef.current = null;
              lastPinchDistRef.current = null;
              handLostStreakRef.current = 0;
            }
          }
        }

        const raw = lastRawNormRef.current;
        if (raw) {
          const nearTop = raw.ny < 0.22;
          const alpha = drawingNowRef.current
            ? nearTop
              ? SMOOTH_ALPHA_DRAW_TOP
              : SMOOTH_ALPHA_DRAW
            : SMOOTH_ALPHA_HOVER;
          smoothedNormRef.current = expSmoothNorm(
            smoothedNormRef.current,
            raw,
            alpha,
          );
          const sn = smoothedNormRef.current;
          const pen = mapNorm(sn.nx, sn.ny, vw, vh);

          if (drawingNowRef.current) {
            const color = opt.brushColor;
            const width = opt.brushSize;
            const erase = opt.tool === 'erase';
            const lastPaint = lastPaintCanvasRef.current;
            if (lastPaint) {
              if (erase) {
                drawEraseSegment(pctx, lastPaint, pen, width);
              } else {
                drawNeonSegment(pctx, lastPaint, pen, color, width);
              }
            }
            activeStrokeRef.current.push({ nx: sn.nx, ny: sn.ny });
            lastPaintCanvasRef.current = pen;
          }

          const lmDbg = lastLandmarksRef.current;
          if (opt.debug && lmDbg) {
            octx.save();
            octx.strokeStyle = 'rgba(0, 255, 200, 0.45)';
            octx.lineWidth = 2;
            for (const { start: i, end: j } of HandLandmarker.HAND_CONNECTIONS) {
              const a = lmDbg[i];
              const b = lmDbg[j];
              const pa = normToCanvas(a.x, a.y, vw, vh, cw, ch, opt.mirror);
              const pb = normToCanvas(b.x, b.y, vw, vh, cw, ch, opt.mirror);
              octx.beginPath();
              octx.moveTo(pa.x, pa.y);
              octx.lineTo(pb.x, pb.y);
              octx.stroke();
            }
            octx.fillStyle = 'rgba(255, 220, 120, 0.9)';
            for (const p of lmDbg) {
              const q = normToCanvas(p.x, p.y, vw, vh, cw, ch, opt.mirror);
              octx.beginPath();
              octx.arc(q.x, q.y, 3, 0, Math.PI * 2);
              octx.fill();
            }
            octx.restore();
          }

          if (!drawingNowRef.current) {
            octx.save();
            octx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            octx.lineWidth = 2;
            octx.beginPath();
            octx.arc(pen.x, pen.y, 6, 0, Math.PI * 2);
            octx.stroke();
            octx.restore();
          }
        }

        if (opt.diagnostics) {
          const lines = [
            `draw=${drawingNowRef.current ? 'on' : 'off'}  pinch=${lastPinchDistRef.current != null ? lastPinchDistRef.current.toFixed(3) : '—'}  hand-gap=${handLostStreakRef.current}/${HAND_LOST_GRACE_CAMERA_FRAMES}`,
            `debounce: pinch ${GESTURE_ENTER_FRAMES}f on / ${GESTURE_EXIT_FRAMES}f off`,
            `last stop: ${lastStrokeStopRef.current}`,
            ...strokeStopLogRef.current.slice(0, 4).map((l) => `· ${l}`),
          ];
          octx.save();
          octx.font = '11px ui-monospace, Menlo, monospace';
          octx.textAlign = 'left';
          octx.textBaseline = 'bottom';
          let y = ch - 8;
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const tw = Math.min(cw - 20, octx.measureText(line).width + 12);
            octx.fillStyle = 'rgba(0, 0, 0, 0.78)';
            octx.fillRect(6, y - 13, tw, 17);
            octx.fillStyle = '#8ef5c0';
            octx.fillText(line, 10, y);
            y -= 19;
          }
          octx.restore();
        }
      };

      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [modelStatus, videoReady, mapNorm, logStrokeStop]);

    return (
      <div ref={stageRef} className="air-stage">
        <video
          ref={videoRef}
          className="air-video"
          playsInline
          muted
          autoPlay
          style={{
            transform: mirror ? 'scaleX(-1)' : undefined,
            opacity: cameraHidden ? 0 : 1,
          }}
          onLoadedData={() => setVideoReady(true)}
        />
        <div
          className="air-dim"
          style={{ opacity: videoDim }}
          aria-hidden
        />
        <canvas ref={paintRef} className="air-canvas air-canvas--paint" />
        <canvas ref={overlayRef} className="air-canvas air-canvas--overlay" />
        {modelStatus === 'loading' && (
          <div className="air-banner air-banner--info">
            Loading hand model…
          </div>
        )}
        {modelStatus === 'error' && (
          <div className="air-banner air-banner--error">
            Model failed: {modelError}
          </div>
        )}
        {camError && (
          <div className="air-banner air-banner--error">{camError}</div>
        )}
      </div>
    );
  },
);
