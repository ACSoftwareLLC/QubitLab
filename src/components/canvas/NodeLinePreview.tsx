import { Group, Line, Circle } from 'react-konva';
import {
  BOX_WIDTH,
  BOX_HEIGHT,
  DOT_OFFSET,
} from '../../constants/canvas';
import type { AppNode } from '../../types';

interface NodeLinePreviewProps {
  lineStartNode: number;
  lineEnd: { x: number; y: number };
  nodes: AppNode[];
}

export function NodeLinePreview({ lineStartNode, lineEnd, nodes }: NodeLinePreviewProps) {
  const node = nodes.find(n => n.id === lineStartNode);
  if (!node) return null;

  const dotX = node.x + BOX_WIDTH;
  const dotY = node.y + BOX_HEIGHT / 2 + DOT_OFFSET;

  return (
    <Group>
      <Line
        points={[
          dotX, dotY,
          dotX + 60, dotY,
          lineEnd.x - 60, lineEnd.y,
          lineEnd.x, lineEnd.y,
        ]}
        stroke='#ff7043'
        strokeWidth={3}
        lineCap='round'
        lineJoin='round'
        bezier={true}
        dash={[8, 4]}
        listening={false}
      />
      <Circle
        x={lineEnd.x}
        y={lineEnd.y}
        radius={7}
        fill='#000'
        listening={false}
      />
    </Group>
  );
}
