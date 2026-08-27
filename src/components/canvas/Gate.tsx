import { GATE_WIDTH, GATE_HEIGHT } from '../../constants/canvas';
import { GATE_CONFIGS, getGateOrigins } from '../../constants/gates';
import type { CanvasGate } from '../../types';

interface GateProps {
  gate: CanvasGate;
  selected?: boolean;
  onDragStart: (gateId: number, pointerX: number) => void;
  onLineStart: (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => void;
  onDelete: (gateId: number) => void;
  onSelect?: (gateId: number) => void;
}

export function Gate({ gate, selected, onDragStart, onLineStart, onDelete, onSelect }: GateProps) {
  const gateWidth = gate.width || GATE_WIDTH;
  const gateHeight = gate.height || GATE_HEIGHT;
  const origins = getGateOrigins(GATE_CONFIGS[gate.type], gateWidth);
  const gradientId = `gate-grad-${gate.id}`;
  const glowFilterId = `gate-glow-${gate.id}`;

  return (
    <g transform={`translate(${gate.x}, ${gate.y})`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
        <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* selection ring */}
      {selected && (
        <rect
          x={-4}
          y={-4}
          width={gateWidth + 8}
          height={gateHeight + 8}
          rx={12}
          ry={12}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeOpacity={0.9}
          filter={`url(#${glowFilterId})`}
          pointerEvents="none"
        />
      )}

      {/* gate body */}
      <rect
        x={0}
        y={0}
        width={gateWidth}
        height={gateHeight}
        rx={10}
        ry={10}
        fill={gate.color}
        stroke="rgba(255, 255, 255, 0.18)"
        strokeWidth={1}
        style={{ cursor: 'grab', filter: selected ? `url(#${glowFilterId})` : undefined }}
        onMouseDown={e => {
          e.stopPropagation();
          onDragStart(gate.id, gate.x + e.nativeEvent.offsetX);
        }}
        onClick={() => onSelect?.(gate.id)}
      />

      {/* glossy gradient overlay */}
      <rect
        x={0}
        y={0}
        width={gateWidth}
        height={gateHeight}
        rx={10}
        ry={10}
        fill={`url(#${gradientId})`}
        pointerEvents="none"
      />

      {/* Gate label */}
      <text
        x={gateWidth / 2}
        y={gateHeight / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={700}
        fill="#fff"
        pointerEvents="none"
        style={{ userSelect: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
      >
        {GATE_CONFIGS[gate.type].symbol}
      </text>

      {gate.angle != null && (
        <text
          x={gateWidth / 2}
          y={gateHeight - 7}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight={600}
          fill="rgba(255, 255, 255, 0.92)"
          pointerEvents="none"
          style={{ userSelect: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
        >
          {`${Math.round((gate.angle * 180) / Math.PI)}°`}
        </text>
      )}

      {/* Line origins: one per connection the gate accepts.
          Filled white = target, hollow = control. Each has an invisible larger
          hit circle so the press doesn't accidentally drag the gate. */}
      {origins.map(origin => {
        const isTarget = origin.role === 'target';
        return (
          <g key={origin.index}>
            <circle
              cx={origin.offsetX}
              cy={gateHeight}
              r={15}
              fill="#000"
              opacity={0}
              style={{ cursor: 'crosshair' }}
              onMouseDown={e => {
                e.stopPropagation();
                onLineStart(
                  gate.id,
                  origin.index,
                  origin.offsetX,
                  gate.x + origin.offsetX,
                  gate.y + gateHeight,
                );
              }}
            />
            <circle
              cx={origin.offsetX}
              cy={gateHeight}
              r={7}
              fill={isTarget ? '#fff' : 'transparent'}
              stroke="#fff"
              strokeWidth={2.5}
              pointerEvents="none"
            />
            <text
              x={origin.offsetX}
              y={gateHeight}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7}
              fontWeight={700}
              fill={isTarget ? '#0b1220' : '#fff'}
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {isTarget ? 'T' : 'C'}
            </text>
          </g>
        );
      })}

      {/* delete handle */}
      <g
        style={{ cursor: 'pointer' }}
        onMouseDown={e => {
          e.stopPropagation();
          onDelete(gate.id);
        }}
        className="gate-delete-handle"
      >
        <circle
          cx={gateWidth}
          cy={0}
          r={9}
          fill="#0f172a"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth={1}
        />
        <text
          x={gateWidth}
          y={1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={700}
          fill="#f87171"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          ×
        </text>
      </g>
    </g>
  );
}
