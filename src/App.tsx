import { useRef, useState, type CSSProperties } from 'react';
import {
  AirCanvas,
  type AirCanvasHandle,
} from './components/AirCanvas';

const SWATCHES = [
  '#ffe566',
  '#66fff0',
  '#ff66c4',
  '#a366ff',
  '#66ff8f',
  '#ffffff',
];

function App() {
  const canvasRef = useRef<AirCanvasHandle>(null);
  const [brushColor, setBrushColor] = useState('#ffe566');
  const [brushSize, setBrushSize] = useState(14);
  const [mirror, setMirror] = useState(true);
  const [debug, setDebug] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [cameraHidden, setCameraHidden] = useState(false);
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [videoDim, setVideoDim] = useState(0.45);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>Air Canvas</h1>
            <p className="tagline">
              Pinch thumb and index finger to draw in the air — neon ink, zero
              install.
            </p>
          </div>
        </div>
        <nav className="toolbar" aria-label="Canvas controls">
          <div className="tool-group" role="group" aria-label="Tool">
            <button
              type="button"
              className={tool === 'draw' ? 'active' : ''}
              onClick={() => setTool('draw')}
            >
              Draw
            </button>
            <button
              type="button"
              className={tool === 'erase' ? 'active' : ''}
              onClick={() => setTool('erase')}
            >
              Erase
            </button>
          </div>
          <div className="swatches" role="list" aria-label="Ink color">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${brushColor === c ? 'selected' : ''}`}
                style={{ '--swatch': c } as CSSProperties}
                onClick={() => setBrushColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <label className="slider-label">
            <span>Brush</span>
            <input
              type="range"
              min={6}
              max={32}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
          </label>
          <label className="slider-label">
            <span>Dim</span>
            <input
              type="range"
              min={0}
              max={85}
              value={Math.round(videoDim * 100)}
              onChange={(e) => setVideoDim(Number(e.target.value) / 100)}
            />
          </label>
          <div className="tool-group toggles">
            <button
              type="button"
              className={mirror ? 'active' : ''}
              onClick={() => setMirror((m) => !m)}
              title="Mirror camera (recommended)"
            >
              Mirror
            </button>
            <button
              type="button"
              className={cameraHidden ? 'active' : ''}
              onClick={() => setCameraHidden((h) => !h)}
            >
              Hide cam
            </button>
            <button
              type="button"
              className={debug ? 'active' : ''}
              onClick={() => setDebug((d) => !d)}
            >
              Debug
            </button>
            <button
              type="button"
              className={diagnostics ? 'active' : ''}
              onClick={() => setDiagnostics((d) => !d)}
              title="Why did the stroke stop? Live pinch distance & log"
            >
              Diagnose
            </button>
          </div>
          <div className="tool-group actions">
            <button type="button" onClick={() => canvasRef.current?.undo()}>
              Undo
            </button>
            <button type="button" onClick={() => canvasRef.current?.clear()}>
              Clear
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => canvasRef.current?.savePng()}
            >
              Save PNG
            </button>
          </div>
        </nav>
      </header>

      <main className="app-main">
        <AirCanvas
          ref={canvasRef}
          brushColor={brushColor}
          brushSize={brushSize}
          mirror={mirror}
          debug={debug}
          diagnostics={diagnostics}
          cameraHidden={cameraHidden}
          tool={tool}
          videoDim={videoDim}
        />
        <aside className="hint-card">
          <h2>How it works</h2>
          <ol>
            <li>Allow camera access when prompted.</li>
            <li>
              Raise your hand. Touch thumb tip to index tip (pinch) to paint;
              release to lift the pen.
            </li>
            <li>
              Toggle <strong>Debug</strong> for the skeleton,{' '}
              <strong>Diagnose</strong> to see pinch distance and why a stroke
              ended.
            </li>
          </ol>
          <p className="hint-foot">
            Built with React, Vite, Canvas, and MediaPipe Hand Landmarker
            (browser WASM).
          </p>
        </aside>
      </main>
    </div>
  );
}

export default App;
