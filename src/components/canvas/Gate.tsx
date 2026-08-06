import type { KonvaEventObject } from 'konva/lib/Node';
import { Fragment } from 'react';
import { Group, Rect, Circle, Line, Text } from 'react-konva';
import { GATE_WIDTH, GATE_HEIGHT } from '../../constants/canvas';
import { GATE_CONFIGS, getGateOrigins } from '../../constants/gates';
import type { CanvasGate } from '../../types';

interface GateProps {
  gate: CanvasGate;
  selected?: boolean;
  onDragEnd: (gateId: number, e: KonvaEventObject<DragEvent>) => void;
  onLineStart: (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => void;
  onDelete: (gateId: number) => void;
  onSelect?: (gateId: number) => void;
}

export function Gate({ gate, selected, onDragEnd, onLineStart, onDelete, onSelect }: GateProps) {
  const gateWidth = gate.width || GATE_WIDTH;
  const gateHeight = gate.height || GATE_HEIGHT;
  const origins = getGateOrigins(GATE_CONFIGS[gate.type], gateWidth);

  return (
    <Group
      key={gate.id}
      x={gate.x}
      y={gate.y}
      draggable
      // Free dragging in both axes; the fixed-row snap happens on drag end.
      onDragEnd={e => onDragEnd(gate.id, e)}
    >
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
        stroke={selected ? '#38bdf8' : undefined}
        strokeWidth={selected ? 3 : 0}
        onClick={() => onSelect?.(gate.id)}
      />

      {/* Line origins: one per connection the gate accepts.
          Filled white = target, hollow = control. Each has an invisible larger
          hit circle so the press doesn't accidentally drag the gate. */}
      {origins.map(origin => {
        const isTarget = origin.role === 'target';
        return (
          <Fragment key={origin.index}>
            <Circle
              x={origin.offsetX}
              y={gateHeight}
              radius={15}
              fill='#000'
              opacity={0}
              draggable={false}
              onMouseDown={e => {
                e.cancelBubble = true;
                onLineStart(
                  gate.id,
                  origin.index,
                  origin.offsetX,
                  gate.x + origin.offsetX,
                  gate.y + gateHeight,
                );
              }}
              listening={true}
            />
            <Circle
              x={origin.offsetX}
              y={gateHeight}
              radius={7}
              fill={isTarget ? '#fff' : 'transparent'}
              stroke='#fff'
              strokeWidth={2.5}
              draggable={false}
              listening={false}
            />
            <Text
              x={origin.offsetX - 7}
              y={gateHeight - 7}
              width={14}
              height={14}
              text={isTarget ? 'T' : 'C'}
              fontSize={7}
              fontStyle='bold'
              fill={isTarget ? '#0b1220' : '#fff'}
              align='center'
              verticalAlign='middle'
              listening={false}
              draggable={false}
            />
          </Fragment>
        );
      })}

      {/* delete handle */}
      <Circle
        x={gateWidth}
        y={0}
        radius={10}
        fill={gate.color}
        shadowBlur={2}
        onClick={() => onDelete(gate.id)}
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
        x={0}
        y={0}
        width={gateWidth}
        height={gateHeight}
      />
      {gate.angle != null && (
        <Text
          text={`${Math.round((gate.angle * 180) / Math.PI)}°`}
          fontSize={9}
          fill='#fff'
          align='center'
          listening={false}
          draggable={false}
          x={0}
          y={gateHeight - 11}
          width={gateWidth}
        />
      )}
    </Group>
  );
}
