import { GATE_CONFIGS } from "../../constants/gates";
import { AngleDial } from "../AngleDial";
import type { PlacedOp } from "./useEditorState";
import { glyphColor } from "./glyphColors";
import { QUICK_ANGLES } from "./quickAngles";

/** Contextual inspector for the selected op: description, angle editor,
 *  connections list, delete. */

interface InspectorProps {
  op: PlacedOp | null;
  numBits: number;
  onAngleScrubStart: () => void;
  onAngleScrub: (angle: number) => void;
  onAngleScrubEnd: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function Inspector({
  op,
  numBits,
  onAngleScrubStart,
  onAngleScrub,
  onAngleScrubEnd,
  onDelete,
  onDuplicate,
}: InspectorProps) {
  if (!op) {
    return (
      <div className="ev2-inspector ev2-inspector-empty">
        <i className="bi bi-cursor" />
        <span>
          Select a gate on the grid to edit its angle and connections.
        </span>
      </div>
    );
  }

  const config = GATE_CONFIGS[op.type];
  const hasAngle = config.defaultAngle != null;

  return (
    <div className="ev2-inspector scrollbar-thin">
      <div className="ev2-inspector-header">
        <span
          className="ev2-inspector-glyph"
          style={{
            borderColor: glyphColor(op.type),
            color: glyphColor(op.type),
          }}
        >
          {config.symbol}
        </span>
        <div className="ev2-inspector-title-group">
          <span className="ev2-inspector-title">{config.fullName}</span>
          <span className="ev2-inspector-desc">{config.description}</span>
        </div>
      </div>

      {hasAngle && (
        <div className="ev2-inspector-section">
          <div className="ev2-inspector-section-label">Angle</div>
          <AngleDial
            angle={op.angle ?? 0}
            onChange={onAngleScrub}
            onScrubStart={onAngleScrubStart}
            onScrubEnd={onAngleScrubEnd}
          />
          <div className="ev2-inspector-quick-angles">
            {QUICK_ANGLES.map(({ label, value }) => (
              <button
                key={label}
                type="button"
                className="ev2-chip-btn"
                onClick={() => onAngleScrub(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ev2-inspector-section">
        <div className="ev2-inspector-section-label">Connections</div>
        <ul className="ev2-inspector-connections">
          {op.targets.map((w, i) => (
            <li key={`t-${i}`}>
              <span className="ev2-conn-dot target" /> Target — wire q{w}
            </li>
          ))}
          {op.controls.map((w, i) => (
            <li key={`c-${i}`}>
              <span className="ev2-conn-dot control" /> Control — wire q{w}
            </li>
          ))}
        </ul>
        <p className="ev2-inspector-hint">
          Drag the dots next to the selected gate to re-wire.
        </p>
      </div>

      <div className="ev2-inspector-actions">
        <button type="button" className="ev2-chip-btn" onClick={onDuplicate}>
          <i className="bi bi-copy" /> Duplicate
        </button>
        <button
          type="button"
          className="ev2-chip-btn ev2-chip-danger"
          onClick={onDelete}
        >
          <i className="bi bi-trash3" /> Delete
        </button>
      </div>

      <div className="ev2-inspector-meta">
        Column {op.segment + 1} of 10 · {numBits} wires
      </div>
    </div>
  );
}
