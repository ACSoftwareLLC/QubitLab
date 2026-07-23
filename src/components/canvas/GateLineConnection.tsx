import { Group, Line, Circle } from 'react-konva';
import { GATE_WIDTH, GATE_HEIGHT } from '../../constants/canvas';
import { getClosestBitLine } from '../../utils/geometry';
import type { AppNode, GateLine } from '../../types';

interface GateLineConnectionProps {
  line: GateLine;
  nodes: AppNode[];
  numBits: number;
  onUpdateBarY: (lineId: number, barY: number) => void;
}

export function GateLineConnection({ line, nodes, numBits, onUpdateBarY }: GateLineConnectionProps) {
  const node = nodes.find(n => n.id === line.nodeId);
  if (!node) return null;
  const gate = node.gates.find(g => g.id === line.gateId);
  if (!gate) return null;

  const gateCenterX = node.x + gate.x + (gate.width || GATE_WIDTH) / 2;
  const gateCenterY = node.y + gate.y + (gate.height || GATE_HEIGHT) / 2;

  return (
    <Group key={`line-group-${line.id}`}>
      <Line
        points={[gateCenterX, gateCenterY, gateCenterX, line.barY]}
        stroke='#000'
        strokeWidth={3}
        lineCap='round'
        lineJoin='round'
        listening={false}
      />
      <Circle
        x={gateCenterX}
        y={line.barY}
        radius={7}
        fill='#000'
        draggable={true}
        dragBoundFunc={pos => ({ x: gateCenterX, y: pos.y })}
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
    </Group>
  );
}
