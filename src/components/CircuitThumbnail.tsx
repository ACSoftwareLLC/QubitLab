import { useMemo } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Group } from 'react-konva';
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
  const scale = width / WORKSPACE_WIDTH;

  const { gates, gateLines, numBits } = useMemo(() => deserializeCircuit(circuit), [circuit]);

  return (
    <Stage width={width} height={height} scaleX={scale} scaleY={scale} listening={false}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={WORKSPACE_WIDTH} height={WORKSPACE_HEIGHT} fill="#f9f9f9" />
        <BitLines numBits={numBits} workspaceWidth={WORKSPACE_WIDTH} />

        {gateLines.map((line) => {
          const gate = gates.find((g) => g.id === line.gateId);
          if (!gate) return null;
          const originAbsX = gate.x + line.originX;
          const gateCenterY = gate.y + GATE_HEIGHT / 2;
          const isControl = line.role === 'control';
          return (
            <Group key={`thumb-line-${line.id}`} listening={false}>
              <Line
                points={[originAbsX, gateCenterY, originAbsX, line.barY]}
                stroke="#000"
                strokeWidth={3}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
              <Circle
                x={originAbsX}
                y={line.barY}
                radius={7}
                fill={isControl ? '#fff' : '#000'}
                stroke="#000"
                strokeWidth={2}
                listening={false}
              />
            </Group>
          );
        })}

        {gates.map((gate) => (
          <Group key={`thumb-gate-${gate.id}`} x={gate.x} y={gate.y} listening={false}>
            <Rect
              width={GATE_WIDTH}
              height={GATE_HEIGHT}
              fill={gate.color}
              cornerRadius={8}
              listening={false}
            />
            <Text
              width={GATE_WIDTH}
              height={GATE_HEIGHT}
              text={GATE_CONFIGS[gate.type]?.symbol ?? gate.type}
              fontSize={14}
              fontStyle="bold"
              fill="#fff"
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </Group>
        ))}
      </Layer>
    </Stage>
  );
}
