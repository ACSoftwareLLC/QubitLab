import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Rect, Circle } from 'react-konva';
import { BOX_WIDTH, BOX_HEIGHT, DOT_RADIUS, DOT_OFFSET } from '../../constants/canvas';
import type { AppNode, CanvasGate } from '../../types';
import { Gate } from './Gate';

interface NodeProps {
  node: AppNode;
  onDragMove: (id: number, e: KonvaEventObject<DragEvent>) => void;
  onGateDragEnd: (nodeId: number, gateId: number, e: KonvaEventObject<DragEvent>) => void;
  onGateLineStart: (nodeId: number, gateId: number, startX: number, startY: number) => void;
  onDeleteGate: (nodeId: number, gateId: number) => void;
  onDotMouseDown: (id: number, dotX: number, dotY: number) => void;
}

export function Node({
  node,
  onDragMove,
  onGateDragEnd,
  onGateLineStart,
  onDeleteGate,
  onDotMouseDown,
}: NodeProps) {
  const localDotX = BOX_WIDTH;
  const localDotY = BOX_HEIGHT / 2 + DOT_OFFSET;
  const absDotX = node.x + localDotX;
  const absDotY = node.y + localDotY;

  return (
    <Group
      key={node.id}
      x={node.x}
      y={node.y}
      draggable
      onDragMove={e => onDragMove(node.id, e)}
    >
      <Rect
        x={0}
        y={0}
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        fill='#29b6f6'
        draggable={false}
        shadowBlur={10}
        cornerRadius={10}
      />
      <Circle
        x={localDotX}
        y={localDotY}
        radius={DOT_RADIUS}
        fill='#ff7043'
        stroke='#fff'
        strokeWidth={2}
        onMouseDown={() => onDotMouseDown(node.id, absDotX, absDotY)}
        onTouchStart={() => onDotMouseDown(node.id, absDotX, absDotY)}
        draggable={false}
        listening={true}
        shadowBlur={4}
      />

      {node.gates.map((gate: CanvasGate) => (
        <Gate
          key={gate.id}
          gate={gate}
          node={node}
          onDragEnd={onGateDragEnd}
          onLineStart={onGateLineStart}
          onDelete={onDeleteGate}
        />
      ))}
    </Group>
  );
}
