import { Line } from 'react-konva';
import type { DraggingGateLine } from '../../types';

interface GateLinePreviewProps {
  draggingGateLine: DraggingGateLine;
}

export function GateLinePreview({ draggingGateLine }: GateLinePreviewProps) {
  return (
    <Line
      points={[
        draggingGateLine.startX,
        draggingGateLine.startY,
        draggingGateLine.currentX,
        draggingGateLine.currentY,
      ]}
      stroke='#000'
      strokeWidth={3}
      lineCap='round'
      lineJoin='round'
      listening={false}
    />
  );
}
