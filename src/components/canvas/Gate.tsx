import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Rect, Circle, Line, Text } from 'react-konva';
import { GATE_WIDTH, GATE_HEIGHT } from '../../constants/canvas';
import type { AppNode, CanvasGate } from '../../types';

interface GateProps {
  gate: CanvasGate;
  node: AppNode;
  onDragEnd: (nodeId: number, gateId: number, e: KonvaEventObject<DragEvent>) => void;
  onLineStart: (nodeId: number, gateId: number, startX: number, startY: number) => void;
  onDelete: (nodeId: number, gateId: number) => void;
}

export function Gate({ gate, node, onDragEnd, onLineStart, onDelete }: GateProps) {
  const gateWidth = gate.width || GATE_WIDTH;
  const gateHeight = gate.height || GATE_HEIGHT;
  const absGateCenterX = node.x + gate.x + gateWidth / 2;

  return (
    <Group key={gate.id} x={gate.x} y={gate.y} draggable onDragEnd={e => onDragEnd(node.id, gate.id, e)}>
      <Rect
        x={0}
        y={0}
        width={gateWidth}
        height={gateHeight}
        fill={gate.color}
        opacity={0.95}
        draggable={false}
        shadowBlur={6}
        cornerRadius={8}
      />
      <Circle
        x={gateWidth / 2}
        y={gateHeight}
        radius={6}
        fill='#fff'
        stroke='#000'
        strokeWidth={2}
        draggable={false}
        onMouseDown={e => {
          e.cancelBubble = true;
          onLineStart(node.id, gate.id, absGateCenterX, node.y + gate.y + gateHeight);
        }}
        listening={true}
      />
      <Circle
        x={gateWidth}
        y={0}
        radius={10}
        fill={gate.color}
        shadowBlur={2}
        onClick={() => onDelete(node.id, gate.id)}
        listening={true}
      />
      <Line
        points={[gateWidth - 6, -6, gateWidth + 6, 6]}
        stroke='#fff'
        strokeWidth={2}
        lineCap='round'
        listening={false}
      />
      <Line
        points={[gateWidth + 6, -6, gateWidth - 6, 6]}
        stroke='#fff'
        strokeWidth={2}
        lineCap='round'
        listening={false}
      />
      <Text
        text={gate.type}
        fontSize={14}
        fill='#fff'
        align='center'
        verticalAlign='middle'
        listening={false}
        draggable={false}
        x={gateWidth / 2}
        y={gateHeight / 2}
      />
    </Group>
  );
}
