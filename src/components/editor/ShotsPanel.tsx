import { useMemo, useState } from "react";
import type { Circuit } from "../../api/types";
import { measuredWires, runShots, type ShotsResult } from "./shotsMath";

/**
 * Run-N-shots measurement histogram: pick 10/50/200 shots, run the circuit
 * N times (fresh randomness per call), and read per-wire P(0)/P(1) bars
 * plus the joint bitstring distribution when 2+ wires are measured.
 * Collapsed by default; only meaningful once Measure gates exist.
 */

const SHOT_CHOICES = [10, 50, 200] as const;

interface ShotsPanelProps {
  circuit: Circuit;
  numBits: number;
}

export function ShotsPanel({ circuit, numBits }: ShotsPanelProps) {
  const [shots, setShots] = useState<number>(SHOT_CHOICES[0]);
  const [result, setResult] = useState<ShotsResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Expanded by default: measurement sampling is a primary flow, and the
  // open panel keeps the canvas region from looking oversized on small
  // circuits (it takes the leftover vertical space).
  const [open, setOpen] = useState(true);

  const wires = useMemo(
    () => measuredWires(circuit.ops, numBits),
    [circuit, numBits],
  );
  const hasMeasurements = wires.length > 0;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runShots(circuit, shots, numBits));
    } catch {
      setError("Shots failed — try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`ev2-shots${open ? " open" : ""}`}>
      <button
        type="button"
        className="ev2-shots-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <i className="bi bi-histogram" />
        <span className="ev2-shots-title">Shots</span>
        <i className={`bi bi-chevron-${open ? "down" : "up"} ev2-shots-chev`} />
      </button>

      {open && (
        <div className="ev2-shots-body scrollbar-thin">
          {!hasMeasurements ? (
            <div className="ev2-shots-hint">
              Add a Measure gate to sample outcomes
            </div>
          ) : (
            <>
              <div className="ev2-shots-controls">
                <div className="ev2-shots-choices">
                  {SHOT_CHOICES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`ev2-chip-btn${shots === n ? " active" : ""}`}
                      onClick={() => setShots(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="ev2-btn ev2-btn-primary ev2-shots-run"
                  onClick={run}
                  disabled={running}
                >
                  <i
                    className={`bi ${running ? "bi-arrow-repeat ev2-spin" : "bi-play-fill"}`}
                  />
                  Run shots
                </button>
              </div>

              {error && <div className="ev2-shots-error">{error}</div>}

              {result && result.shots > 0 && (
                <div className="ev2-shots-results">
                  {result.wires.map((w) => {
                    const c = result.counts[w];
                    const total = c.zero + c.one || 1;
                    const p1 = (c.one / total) * 100;
                    return (
                      <div key={w} className="ev2-shots-wire">
                        <span className="ev2-shots-wire-label">q{w}</span>
                        <div className="ev2-shots-bar-track">
                          <div
                            className="ev2-shots-bar-fill"
                            style={{ width: `${p1}%` }}
                          />
                        </div>
                        <span className="ev2-shots-wire-counts">
                          0: {c.zero} · 1: {c.one} ({p1.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}

                  {result.wires.length >= 2 && result.joint.length > 0 && (
                    <div className="ev2-shots-joint">
                      <div className="ev2-shots-joint-label">
                        Joint outcomes (top {result.joint.length})
                      </div>
                      {result.joint.map(({ bits, count }) => {
                        const total = result.shots || 1;
                        const pct = (count / total) * 100;
                        return (
                          <div key={bits} className="ev2-shots-joint-row">
                            <span className="ev2-shots-joint-bits">{bits}</span>
                            <div className="ev2-shots-bar-track">
                              <div
                                className="ev2-shots-bar-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="ev2-shots-joint-count">
                              {count} ({pct.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
