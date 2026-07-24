import { useState } from 'react';
import type { Snapshot, ValidationError } from '../api/types';
import type { SimStatus } from '../hooks/useSimulation';

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
      <div style={{ width: 36, background: '#1b1b1b', borderLeft: '1px solid #333', display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
        <button
          onClick={() => setCollapsed(false)}
          title='Show state'
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}
        >
          ◀
        </button>
      </div>
    );
  }

  const displayed = peekSnapshot ?? snapshot;
  const isPeek = peekSnapshot != null;

  return (
    <div
      style={{
        width: '20%',
        minWidth: 240,
        background: '#1b1b1b',
        color: '#eee',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        overflowY: 'auto',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 'bold', fontSize: 15 }}>
          {isPeek ? `peek @ segment ${displayed?.segment}` : 'state'}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title='Collapse'
          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}
        >
          ▶
        </button>
      </div>

      {status === 'offline' && (
        <div style={{ color: '#ef9a9a' }}>simulation server offline — is uvicorn running on :8000?</div>
      )}

      {status === 'invalid' && (
        <div>
          <div style={{ color: '#ef9a9a', marginBottom: 8 }}>invalid circuit:</div>
          {errors.map((e, i) => (
            <div key={i} style={{ color: '#ef9a9a', fontSize: 12, marginBottom: 4 }}>
              • {e.message}
            </div>
          ))}
        </div>
      )}

      {unconnectedGateIds.length > 0 && status !== 'invalid' && (
        <div style={{ color: '#ffb74d', fontSize: 12, marginBottom: 12 }}>
          {unconnectedGateIds.length} gate(s) not connected to a bit line — skipped
        </div>
      )}

      {status === 'idle' && (
        <div style={{ color: '#888' }}>press ▶ start to execute the circuit</div>
      )}

      {displayed ? (
        <>
          {displayed.statevector.length === 0 && (
            <div style={{ color: '#888' }}>|0…0⟩ (no amplitudes above ε)</div>
          )}
          {displayed.statevector.map(entry => (
            <div key={entry.basis} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>|{entry.basis}⟩</span>
                <span style={{ color: '#90caf9' }}>{formatAmplitude(entry.re, entry.im)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ flex: 1, height: 6, background: '#333', borderRadius: 3 }}>
                  <div
                    style={{
                      width: `${(entry.prob * 100).toFixed(1)}%`,
                      height: '100%',
                      background: '#2196F3',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#aaa', width: 48, textAlign: 'right' }}>
                  {(entry.prob * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          ))}

          {Object.keys(displayed.measurements).length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 8, fontSize: 12 }}>
              <div style={{ color: '#90A4AE', marginBottom: 4 }}>measurements</div>
              {Object.entries(displayed.measurements).map(([gateId, outcome]) => (
                <div key={gateId}>gate {gateId}: <b>{outcome}</b></div>
              ))}
            </div>
          )}
        </>
      ) : (
        status !== 'idle' && status !== 'offline' && status !== 'invalid' && (
          <div style={{ color: '#888' }}>initial state |0…0⟩ — step to execute</div>
        )
      )}
    </div>
  );
}
