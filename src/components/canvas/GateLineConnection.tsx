import { Group, Line, Circle, Text } from 'react-konva';
import { GATE_HEIGHT } from '../../constants/canvas';
import { getClosestBitLine } from '../../utils/geometry';
import type { CanvasGate, GateLine } from '../../types';

interface GateLineConnectionProps {
  line: GateLine;
  gates: CanvasGate[];
  numBits: number;
  onUpdateBarY: (lineId: number, barY: number) => void;
  onToggleRole: (lineId: number) => void;
}

export function GateLineConnection({ line, gates, numBits, onUpdateBarY, onToggleRole }: GateLineConnectionProps) {
  const gate = gates.find(g => g.id === line.gateId);
  if (!gate) return null;

  const originAbsX = gate.x + line.originX;
  const gateCenterY = gate.y + (gate.height || GATE_HEIGHT) / 2;
  const isControl = line.role === 'control';

  return (
    <Group key={`line-group-${line.id}`}>
      <Line
        points={[originAbsX, gateCenterY, originAbsX, line.barY]}
        stroke='#cbd5e1'
        strokeWidth={2.5}
        lineCap='round'
        lineJoin='round'
        listening={false}
      />
      {/* double-click toggles target (filled) ↔ control (open) */}
      <Circle
        x={originAbsX}
        y={line.barY}
        radius={8}
        fill={isControl ? 'transparent' : '#e2e8f0'}
        stroke='#e2e8f0'
        strokeWidth={2.5}
        draggable={true}
        dragBoundFunc={pos => ({ x: originAbsX, y: pos.y })}
        onDblClick={() => onToggleRole(line.id)}
        onDragMove={e => {
          const y = e.target.y();
          const nearestY = getClosestBitLine(y, numBits);
          e.target.y(nearestY);
          onUpdateBarY(line.id, nearestY);
        }}
        onDragEnd={e => {
          const y = e.target.y();
          const nearestY = getClosestBitLine(y, numBits);
          onUpdateBarY(line.id, nearestY);
        }}
      />
      <Text
        x={originAbsX - 8}
        y={line.barY - 8}
        width={16}
        height={16}
        text={isControl ? 'C' : 'T'}
        fontSize={8}
        fontStyle='bold'
        fill={isControl ? '#e2e8f0' : '#0b1220'}
        align='center'
        verticalAlign='middle'
        listening={false}
        draggable={false}
      />
    </Group>
  );
}
