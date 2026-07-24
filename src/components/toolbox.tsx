import type { GateType, GateConfig, CanvasGate } from '../types';
import { GATE_CATEGORIES } from '../constants/gates';
import { AngleDial } from './AngleDial';

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
  return (
    <div
      className="toolbox"
      style={{ width: '25%', minWidth: 140, background: '#222', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, boxShadow: '2px 0 8px #0002', zIndex: 2, overflowY: 'auto' }}
    >
      <div style={{ marginBottom: 24, fontWeight: 'bold', fontSize: 18 }}>Toolbox</div>

      {GATE_CATEGORIES.map(({ key, label, color }) => {
        const gates = (Object.keys(gateConfigs) as GateType[]).filter(
          g => gateConfigs[g].category === key,
        );
        if (gates.length === 0) return null;
        return (
          <div key={key} style={{ marginBottom: 24, width: '100%' }}>
            <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 14, color }}>{label}</div>
            {gates.map(gateType => (
              <div
                key={gateType}
                className="toolbox-item"
                draggable
                onDragStart={(e) => onDragStart(e, gateType)}
                onDragEnd={onDragEnd}
                style={{
                  padding: 8,
                  margin: '4px 0',
                  background: selectedGate === gateType ? '#444' : '#333',
                  cursor: 'grab',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'flex-start',
                  paddingLeft: 12,
                }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 12, background: gateConfigs[gateType].color, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                <span style={{ color: '#fff', fontWeight: 600 }}>{gateConfigs[gateType].symbol}</span>
              </div>
            ))}
          </div>
        );
      })}

      {/* Selected gate properties */}
      {selectedPlacedGate && gateConfigs[selectedPlacedGate.type]?.defaultAngle != null && (
        <div style={{ width: '100%', padding: '12px 8px', borderTop: '1px solid #444' }}>
          <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 14, color: '#4DB6AC', textAlign: 'center' }}>
            {gateConfigs[selectedPlacedGate.type].name} angle
          </div>
          <AngleDial
            angle={selectedPlacedGate.angle ?? 0}
            onChange={rad => onGateAngleChange(selectedPlacedGate.id, rad)}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
            {QUICK_ANGLES.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => onGateAngleChange(selectedPlacedGate.id, value)}
                style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bits slider */}
      <div style={{ width: '100%', padding: '12px 8px' }}>
        <label style={{ color: '#fff', display: 'block', marginBottom: 6 }}>Bits: {numBits}</label>
        <input
          type="range"
          min={1}
          max={16}
          value={numBits}
          onChange={e => onNumBitsChange(Number.parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
