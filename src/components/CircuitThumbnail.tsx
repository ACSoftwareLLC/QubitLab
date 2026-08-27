import { useMemo } from 'react';
import {
  WORKSPACE_WIDTH,
  WORKSPACE_HEIGHT,
  GATE_WIDTH,
  GATE_HEIGHT,
} from '../constants/canvas';
import { GATE_CONFIGS } from '../constants/gates';
import { deserializeCircuit } from '../api/deserialize';
import { BitLines } from './canvas/BitLines';
import type { Circuit } from '../api/types';

interface CircuitThumbnailProps {
  circuit: Circuit;
  width: number;
}

/**
 * Read-only live snapshot of a saved circuit, used as the fallback when no
 * static thumbnail was captured. Renders the same layout math as the editor
 * (via deserializeCircuit) at a reduced scale — deliberately NOT the
 * interactive <Gate> component, which needs drag handlers.
 */
export function CircuitThumbnail({ circuit, width }: CircuitThumbnailProps) {
  const height = (width * WORKSPACE_HEIGHT) / WORKSPACE_WIDTH;

  const { gates, gateLines, numBits } = useMemo(() => deserializeCircuit(circuit), [circuit]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${WORKSPACE_WIDTH} ${WORKSPACE_HEIGHT}`}
      style={{ display: 'block', background: '#f9f9f9' }}
    >
      <BitLines numBits={numBits} workspaceWidth={WORKSPACE_WIDTH} />

      {gateLines.map((line) => {
        const gate = gates.find((g) => g.id === line.gateId);
        if (!gate) return null;
        const originAbsX = gate.x + line.originX;
        const gateCenterY = gate.y + GATE_HEIGHT / 2;
        const isControl = line.role === 'control';
        return (
          <g key={`thumb-line-${line.id}`}>
            <line
              x1={originAbsX}
              y1={gateCenterY}
              x2={originAbsX}
              y2={line.barY}
              stroke="#000"
              strokeWidth={3}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <circle
              cx={originAbsX}
              cy={line.barY}
              r={7}
              fill={isControl ? '#fff' : '#000'}
              stroke="#000"
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        );
      })}

      {gates.map((gate) => (
        <g key={`thumb-gate-${gate.id}`} transform={`translate(${gate.x}, ${gate.y})`}>
          <rect
            width={GATE_WIDTH}
            height={GATE_HEIGHT}
            rx={8}
            ry={8}
            fill={gate.color}
            pointerEvents="none"
          />
          <text
            x={GATE_WIDTH / 2}
            y={GATE_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fontWeight="bold"
            fill="#fff"
            pointerEvents="none"
            style={{ userSelect: 'none' }}
          >
            {GATE_CONFIGS[gate.type]?.symbol ?? gate.type}
          </text>
        </g>
      ))}
    </svg>
  );
}
