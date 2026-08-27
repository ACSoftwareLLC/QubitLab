import { GATE_HEIGHT } from '../../constants/canvas';
import type { CanvasGate, GateLine } from '../../types';

interface GateLineConnectionProps {
  line: GateLine;
  gates: CanvasGate[];
  numBits: number;
  barY: number;
  onUpdateBarY: (lineId: number, barY: number) => void;
  onToggleRole: (lineId: number) => void;
  onDragStart: (lineId: number) => void;
}

export function GateLineConnection({
  line,
  gates,
  barY,
  onToggleRole,
  onDragStart,
}: GateLineConnectionProps) {
  const gate = gates.find(g => g.id === line.gateId);
  if (!gate) return null;

  const originAbsX = gate.x + line.originX;
  const gateCenterY = gate.y + (gate.height || GATE_HEIGHT) / 2;
  const isControl = line.role === 'control';
  const glowFilterId = `line-glow-${line.id}`;

  return (
    <g key={`line-group-${line.id}`}>
      <defs>
        <filter id={glowFilterId} x="-60%" y="-20%" width="220%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <line
        x1={originAbsX}
        y1={gateCenterY}
        x2={originAbsX}
        y2={barY}
        stroke="#cbd5e1"
        strokeWidth={2.5}
        strokeLinecap="round"
        filter={`url(#${glowFilterId})`}
        pointerEvents="none"
      />

      {/* drag + double-click toggles target (filled) ↔ control (open) */}
      <circle
        cx={originAbsX}
        cy={barY}
        r={12}
        fill="#fff"
        className="line-drag-hit"
        style={{ cursor: 'ns-resize' }}
        onMouseDown={e => {
          e.stopPropagation();
          onDragStart(line.id);
        }}
        onDoubleClick={() => onToggleRole(line.id)}
      />
      <circle
        cx={originAbsX}
        cy={barY}
        r={8}
        fill={isControl ? 'transparent' : '#e2e8f0'}
        stroke="#e2e8f0"
        strokeWidth={2.5}
        filter={`url(#${glowFilterId})`}
        pointerEvents="none"
      />
      <text
        x={originAbsX}
        y={barY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontWeight={700}
        fill={isControl ? '#e2e8f0' : '#0b1220'}
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {isControl ? 'C' : 'T'}
      </text>
    </g>
  );
}
