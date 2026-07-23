import { Group, Line, Circle } from 'react-konva';
import { BOX_WIDTH, BOX_HEIGHT, DOT_OFFSET } from '../../constants/canvas';
import { getClosestBitLine } from '../../utils/geometry';
import type { AppNode, NodeLine } from '../../types';

interface NodeLineConnectionProps {
  line: NodeLine;
  nodes: AppNode[];
  numBits: number;
  onUpdateBitY: (lineId: number, bitY: number) => void;
}

export function NodeLineConnection({ line, nodes, numBits, onUpdateBitY }: NodeLineConnectionProps) {
  const node = nodes.find(n => n.id === line.nodeId);
  if (!node) return null;

  const dotX = node.x + BOX_WIDTH;
  const dotY = node.y + BOX_HEIGHT / 2 + DOT_OFFSET;

  return (
    <Group key={`node-line-${line.id}`}>
      <Line
        points={[dotX, dotY, dotX, line.bitY]}
        stroke='#000'
        strokeWidth={3}
        lineCap='round'
        lineJoin='round'
        listening={false}
      />
      <Circle
        x={dotX}
        y={line.bitY}
        radius={7}
        fill='#000'
        draggable={true}
        dragBoundFunc={pos => ({ x: dotX, y: pos.y })}
        onDragMove={e => {
          const y = e.target.y();
          const nearestY = getClosestBitLine(y, numBits);
          e.target.y(nearestY);
          onUpdateBitY(line.id, nearestY);
        }}
        onDragEnd={e => {
          const y = e.target.y();
          const nearestY = getClosestBitLine(y, numBits);
          onUpdateBitY(line.id, nearestY);
        }}
      />
    </Group>
  );
}
