import { Group, Line, Circle } from 'react-konva';
import type { DraggingGateLine } from '../../types';

interface GateLinePreviewProps {
  draggingGateLine: DraggingGateLine;
}

/** Preview of a gate connection while dragging: a grey line from the origin
 *  to the raw cursor, plus the opaque black vertical result (inline with the
 *  origin, end snapped to bit lines) with a dot on the end.
 *  Unmounts as soon as the drag ends. */
export function GateLinePreview({ draggingGateLine }: GateLinePreviewProps) {
  return (
    <Group listening={false}>
      {/* grey: origin → raw cursor */}
      <Line
        points={[
          draggingGateLine.startX,
          draggingGateLine.startY,
          draggingGateLine.rawX,
          draggingGateLine.rawY,
        ]}
        stroke='#64748b'
        strokeWidth={2}
        lineCap='round'
        lineJoin='round'
      />
      {/* solid: origin → snapped end, dot on the end */}
      <Line
        points={[
          draggingGateLine.startX,
          draggingGateLine.startY,
          draggingGateLine.currentX,
          draggingGateLine.currentY,
        ]}
        stroke='#e2e8f0'
        strokeWidth={2.5}
        opacity={1}
        lineCap='round'
        lineJoin='round'
      />
      <Circle
        x={draggingGateLine.currentX}
        y={draggingGateLine.currentY}
        radius={7}
        fill='#e2e8f0'
      />
    </Group>
  );
}
