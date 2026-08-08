import { useEffect, useRef, useState } from 'react';
import type { Snapshot, ValidationError } from '../api/types';
import type { SimStatus } from '../hooks/useSimulation';
import { BlochSphere } from './canvas/BlochSphere';
import './StatePanel.css';

interface StatePanelProps {
  status: SimStatus;
  snapshot: Snapshot | null;
  peekSnapshot: Snapshot | null;
  snapshotHistory?: Snapshot[];
  errors: ValidationError[];
  unconnectedGateIds: number[];
  numBits: number;
}

const formatAmplitude = (re: number, im: number): string => {
  const sign = im < 0 ? '−' : '+';
  return `${re.toFixed(3)} ${sign} ${Math.abs(im).toFixed(3)}i`;
};

const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 900;
const DEFAULT_PANEL_WIDTH = 300;

/** Statevector inspector: shows the state at the current step, or a
 *  peeked segment while hovering the canvas. */
export function StatePanel({ status, snapshot, peekSnapshot, snapshotHistory = [], errors, unconnectedGateIds, numBits }: StatePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showBloch, setShowBloch] = useState(false);
  const [selectedQubit, setSelectedQubit] = useState(0);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(DEFAULT_PANEL_WIDTH);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const nextWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, resizeStartWidth.current + delta),
      );
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
    setIsResizing(true);
  };

  if (collapsed) {
    return (
      <div className="state-panel state-panel-collapsed">
        <button
          className="state-panel-collapse-btn"
          onClick={() => setCollapsed(false)}
          title="Show state panel"
          aria-label="Show state panel"
        >
          <i className="bi bi-chevron-left" />
        </button>
      </div>
    );
  }

  const displayed = peekSnapshot ?? snapshot;
  const isPeek = peekSnapshot != null;

  return (
    <aside
      className="state-panel scrollbar-thin"
      style={{ width: panelWidth, flex: '0 0 auto' }}
    >
      <div className="state-panel-resize-handle" onMouseDown={handleResizeStart} />
      <div className="state-panel-header">
        <span className="state-panel-title">
          {showBloch ? 'Bloch Sphere' : 'State'}
          {isPeek && <span className="state-panel-peek-badge">peek @{displayed?.segment}</span>}
        </span>
        <div className="state-panel-header-actions">
          <button
            className="state-panel-action-btn"
            onClick={() => setShowBloch(!showBloch)}
            disabled={numBits === 0}
            title={
              numBits === 0
                ? "Add at least one qubit to view the Bloch sphere"
                : showBloch
                  ? "Show State"
                  : "Show Bloch Sphere"
            }
            aria-label={showBloch ? "Show State" : "Show Bloch Sphere"}
          >
            <i className={`bi ${showBloch ? 'bi-list-ul' : 'bi-globe'}`} />
          </button>
          <button
            className="state-panel-collapse-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse state panel"
            aria-label="Collapse state panel"
          >
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      </div>

      {showBloch ? (
        <div className="state-panel-bloch-container">
          <div className="state-panel-bloch-controls">
            <label>Qubit:</label>
            <select 
              value={selectedQubit} 
              onChange={(e) => setSelectedQubit(Number(e.target.value))}
              className="state-panel-select"
            >
              {Array.from({ length: numBits }, (_, i) => (
                <option key={i} value={i}>Q{i}</option>
              ))}
            </select>
          </div>
          <div className="state-panel-bloch-canvas">
            {displayed ? (
              <BlochSphere
                statevector={displayed.statevector}
                qubitIndex={selectedQubit}
                snapshotHistory={snapshotHistory}
              />
            ) : (
              <div className="state-msg state-msg-info">
                <i className="bi bi-hourglass-split" />
                <span>No simulation running</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {status === 'offline' && (
            <div className="state-msg state-msg-error">
              <i className="bi bi-wifi-off" />
              <span>Simulation engine failed to load — try reloading the page.</span>
            </div>
          )}

          {status === 'invalid' && (
            <div className="state-msg state-msg-error">
              <i className="bi bi-exclamation-triangle" />
              <span>
                Invalid circuit:
                <ul>
                  {errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              </span>
            </div>
          )}

          {unconnectedGateIds.length > 0 && status !== 'invalid' && (
            <div className="state-msg state-msg-warn">
              <i className="bi bi-plug" />
              <span>{unconnectedGateIds.length} gate(s) not connected to a bit line — skipped</span>
            </div>
          )}

          {status === 'idle' && (
            <div className="state-msg state-msg-info">
              <i className="bi bi-info-circle" />
              <span>Press <b style={{ color: 'var(--primary)' }}>Start</b> to execute the circuit</span>
            </div>
          )}

          {displayed ? (
            <>
              {displayed.statevector.length === 0 && (
                <div className="state-msg state-msg-info">
                  <i className="bi bi-circle" />
                  <span style={{ color: 'var(--primary)' }}>|0…0⟩ (no amplitudes above ε)</span>
                </div>
              )}
              {displayed.statevector.map(entry => (
                <div key={entry.basis} className="state-entry">
                  <div className="state-entry-row">
                    <span className="state-entry-basis">|{entry.basis}⟩</span>
                    <span className="state-entry-amp">{formatAmplitude(entry.re, entry.im)}</span>
                  </div>
                  <div className="state-entry-bar-row">
                    <div className="state-entry-bar-track">
                      <div
                        className="state-entry-bar-fill"
                        style={{ width: `${(entry.prob * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="state-entry-prob">{(entry.prob * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}

              {Object.keys(displayed.measurements).length > 0 && (
                <div className="state-measurements">
                  <div className="state-measurements-label">Measurements</div>
                  {Object.entries(displayed.measurements).map(([gateId, outcome]) => (
                    <div key={gateId}>
                      gate {gateId}: <span className="state-measurement-outcome">{outcome}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            status !== 'idle' && status !== 'offline' && status !== 'invalid' && (
              <div className="state-msg state-msg-info">
                <i className="bi bi-hourglass-split" />
                <span>Initial state |0…0⟩ — step to execute</span>
              </div>
            )
          )}
        </>
      )}
    </aside>
  );
}
