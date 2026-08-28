import { GATE_CATEGORIES, GATE_CONFIGS } from "../../constants/gates";
import type { GateType } from "../../types";
import { MAX_BITS } from "../../constants/canvas";
import { glyphColor } from "./glyphColors";

/** Gate palette: drag onto the grid, or click to arm click-to-place. */

interface ToolboxProps {
  armedType: GateType | null;
  onArm: (type: GateType | null) => void;
  /** Palette item pointer-drag began; the page runs the window drag. */
  onItemPointerDown: (e: React.PointerEvent, type: GateType) => void;
  numBits: number;
  onNumBitsChange: (bits: number) => void;
}

export function Toolbox({
  armedType,
  onArm,
  onItemPointerDown,
  numBits,
  onNumBitsChange,
}: ToolboxProps) {
  return (
    <aside className="ev2-toolbox">
      <div className="ev2-toolbox-header">
        <span className="ev2-toolbox-title">Gates</span>
      </div>

      <div className="ev2-toolbox-body scrollbar-thin">
        {GATE_CATEGORIES.map(({ key, label }) => {
          const gates = (Object.keys(GATE_CONFIGS) as GateType[]).filter(
            (g) => GATE_CONFIGS[g].category === key,
          );
          return (
            <div key={key} className="ev2-toolbox-category">
              <div className="ev2-toolbox-category-label">{label}</div>
              <div className="ev2-toolbox-grid">
                {gates.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`ev2-toolbox-item${armedType === type ? " armed" : ""}`}
                    onPointerDown={(e) => onItemPointerDown(e, type)}
                    onClick={() => onArm(armedType === type ? null : type)}
                    title={GATE_CONFIGS[type].description}
                    aria-label={`Place ${GATE_CONFIGS[type].fullName}`}
                  >
                    <span
                      className="ev2-toolbox-chip"
                      style={{
                        borderColor: glyphColor(type),
                        color: glyphColor(type),
                      }}
                    >
                      {GATE_CONFIGS[type].symbol}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ev2-toolbox-section">
        <label className="ev2-toolbox-section-label" htmlFor="ev2-bits-range">
          <span>Wires</span>
          <span className="ev2-toolbox-bits-value">{numBits}</span>
        </label>
        <div className="ev2-bits-stepper">
          <button
            type="button"
            className="ev2-bits-btn"
            onClick={() => onNumBitsChange(numBits - 1)}
            disabled={numBits <= 1}
            aria-label="Remove wire"
            title="Remove wire"
          >
            <i className="bi bi-dash" />
          </button>
          <input
            id="ev2-bits-range"
            className="ev2-toolbox-range"
            type="range"
            min={1}
            max={MAX_BITS}
            value={numBits}
            onChange={(e) => onNumBitsChange(Number.parseInt(e.target.value))}
          />
          <button
            type="button"
            className="ev2-bits-btn"
            onClick={() => onNumBitsChange(numBits + 1)}
            disabled={numBits >= MAX_BITS}
            aria-label="Add wire"
            title="Add wire"
          >
            <i className="bi bi-plus" />
          </button>
        </div>
      </div>
    </aside>
  );
}
