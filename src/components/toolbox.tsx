import { useState } from 'react';
import type { GateType, GateConfig, CanvasGate } from '../types';
import { GATE_CATEGORIES } from '../constants/gates';
import { MAX_BITS } from '../constants/canvas';
import { AngleDial } from './AngleDial';
import './toolbox.css';

interface ToolboxProps {
  gateConfigs: Record<GateType, GateConfig>;
  selectedGate: GateType | null;
  numBits: number;
  selectedPlacedGate: CanvasGate | null;
  onDragStart: (e: React.DragEvent, gateType: GateType) => void;
  onDragEnd: () => void;
  onNumBitsChange: (bits: number) => void;
  onGateAngleChange: (gateId: number, angle: number) => void;
}

const QUICK_ANGLES = [
  { label: 'π/2', value: Math.PI / 2 },
  { label: 'π/4', value: Math.PI / 4 },
  { label: 'π', value: Math.PI },
];

export function Toolbox({
  gateConfigs,
  selectedGate,
  numBits,
  selectedPlacedGate,
  onDragStart,
  onDragEnd,
  onNumBitsChange,
  onGateAngleChange,
}: ToolboxProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="toolbox toolbox-collapsed">
        <button
          className="toolbox-collapse-btn"
          onClick={() => setCollapsed(false)}
          title="Show toolbox"
          aria-label="Show toolbox"
        >
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    );
  }

  const angleGate =
    selectedPlacedGate && gateConfigs[selectedPlacedGate.type]?.defaultAngle != null
      ? selectedPlacedGate
      : null;

  return (
    <aside className="toolbox">
      <div className="toolbox-header">
        <span className="toolbox-title">Gates</span>
        <button
          className="toolbox-collapse-btn"
          onClick={() => setCollapsed(true)}
          title="Collapse toolbox"
          aria-label="Collapse toolbox"
        >
          <i className="bi bi-chevron-left" />
        </button>
      </div>

      <div className="toolbox-body scrollbar-thin">
        <p className="toolbox-hint">Drag a gate onto the canvas to place it.</p>

        {GATE_CATEGORIES.map(({ key, label }) => {
          const gates = (Object.keys(gateConfigs) as GateType[]).filter(
            g => gateConfigs[g].category === key,
          );
          if (gates.length === 0) return null;
          return (
            <div key={key} className="toolbox-category">
              <div className="toolbox-category-label">{label}</div>
              <div className="toolbox-grid">
                {gates.map(gateType => (
                  <div
                    key={gateType}
                    className={`toolbox-item${selectedGate === gateType ? ' selected' : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, gateType)}
                    onDragEnd={onDragEnd}
                    title={`${gateConfigs[gateType].name} gate`}
                  >
                    <span
                      className="toolbox-item-chip"
                      style={{ background: gateConfigs[gateType].color }}
                    >
                      {gateConfigs[gateType].symbol}
                    </span>
                    <span className="toolbox-item-name">{gateConfigs[gateType].name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected gate angle editor */}
      {angleGate && (
        <div className="toolbox-section">
          <div className="toolbox-section-label">
            <span>{gateConfigs[angleGate.type].name} angle</span>
          </div>
          <AngleDial
            angle={angleGate.angle ?? 0}
            onChange={rad => onGateAngleChange(angleGate.id, rad)}
          />
          <div className="toolbox-quick-angles">
            {QUICK_ANGLES.map(({ label, value }) => (
              <button
                key={label}
                className="btn"
                onClick={() => onGateAngleChange(angleGate.id, value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bits control */}
      <div className="toolbox-section toolbox-bits">
        <label className="toolbox-section-label" htmlFor="bits-range">
          <span>Bits</span>
          <span className="toolbox-bits-value">{numBits}</span>
        </label>
        <input
          id="bits-range"
          className="toolbox-range"
          type="range"
          min={1}
          max={MAX_BITS}
          value={numBits}
          onChange={e => onNumBitsChange(Number.parseInt(e.target.value))}
        />
      </div>
    </aside>
  );
}
