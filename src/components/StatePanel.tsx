import { useState } from 'react';
import type { Snapshot, ValidationError } from '../api/types';
import type { SimStatus } from '../hooks/useSimulation';
import './StatePanel.css';

interface StatePanelProps {
  status: SimStatus;
  snapshot: Snapshot | null;
  peekSnapshot: Snapshot | null;
  errors: ValidationError[];
  unconnectedGateIds: number[];
}

const formatAmplitude = (re: number, im: number): string => {
  const sign = im < 0 ? '−' : '+';
  return `${re.toFixed(3)} ${sign} ${Math.abs(im).toFixed(3)}i`;
};

/** Statevector inspector: shows the state at the current step, or a
 *  peeked segment while hovering the canvas. */
export function StatePanel({ status, snapshot, peekSnapshot, errors, unconnectedGateIds }: StatePanelProps) {
  const [collapsed, setCollapsed] = useState(false);

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
    <aside className="state-panel scrollbar-thin">
      <div className="state-panel-header">
        <span className="state-panel-title">
          State
          {isPeek && <span className="state-panel-peek-badge">peek @{displayed?.segment}</span>}
        </span>
        <button
          className="state-panel-collapse-btn"
          onClick={() => setCollapsed(true)}
          title="Collapse state panel"
          aria-label="Collapse state panel"
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>

      {status === 'offline' && (
        <div className="state-msg state-msg-error">
          <i className="bi bi-wifi-off" />
          <span>Simulation server offline — is uvicorn running on :8000?</span>
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
          <span>Press <b>Start</b> to execute the circuit</span>
        </div>
      )}

      {displayed ? (
        <>
          {displayed.statevector.length === 0 && (
            <div className="state-msg state-msg-info">
              <i className="bi bi-circle" />
              <span>|0…0⟩ (no amplitudes above ε)</span>
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
    </aside>
  );
}
