import type { GateType } from '../App';

type GateConfig = {
  name: string;
  color: string;
  symbol: string;
};

interface ToolboxProps {
  gateConfigs: Record<GateType, GateConfig>;
  selectedGate: GateType | null;
  numBits: number;
  onDragStart: (e: React.DragEvent, gateType: GateType) => void;
  onDragEnd: () => void;
  onNumBitsChange: (bits: number) => void;
}

export function Toolbox({
  gateConfigs,
  selectedGate,
  numBits,
  onDragStart,
  onDragEnd,
  onNumBitsChange,
}: ToolboxProps) {
  return (
    <div
      className="toolbox"
      style={{ width: '25%', minWidth: 140, background: '#222', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, boxShadow: '2px 0 8px #0002', zIndex: 2 }}
    >
      <div style={{ marginBottom: 24, fontWeight: 'bold', fontSize: 18 }}>Toolbox</div>
      
      {/* Single-bit Gates */}
      <div style={{ marginBottom: 24, width: '100%' }}>
        <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 14, color: '#FFEB3B' }}>Single-bit Gates</div>
        
        {(Object.keys(gateConfigs) as GateType[]).filter(g => g !== 'C').map(gateType => (
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
      
      {/* Multi-bit Gates */}
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 14, color: '#FF9800' }}>Multi-bit Gates</div>
        <div
          className="toolbox-item"
          draggable
          onDragStart={(e) => onDragStart(e, 'C')}
          onDragEnd={onDragEnd}
          style={{ padding: 8, margin: '4px 0', background: '#333', cursor: 'grab', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 12 }}
        >
          <div style={{ width: 24, height: 24, borderRadius: 12, background: '#9C27B0', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          <span style={{ color: '#fff', fontWeight: 600 }}>C</span>
        </div>
      </div>

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
