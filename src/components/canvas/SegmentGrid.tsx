import { Line } from 'react-konva';
import {
  WORKSPACE_HEIGHT,
  NUM_SEGMENTS,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  BIT_LINE_SPACING,
  FIRST_BIT_LINE_Y,
} from '../../constants/canvas';

interface SegmentGridProps {
  numBits: number;
}

export function SegmentGrid({ numBits }: SegmentGridProps) {
  return (
    <>
      {Array.from({ length: NUM_SEGMENTS + 1 }).map((_, i) => {
        const x = SEGMENTS_START_X + i * SEGMENT_WIDTH;
        const topY = WORKSPACE_HEIGHT * 0.2;
        const bottomY = FIRST_BIT_LINE_Y + (numBits - 1) * BIT_LINE_SPACING + 20;
        return (
          <Line
            key={`seg-${i}`}
            points={[x, topY, x, bottomY]}
            stroke={'#e53935'}
            strokeWidth={2}
            dash={[4, 4]}
            listening={false}
          />
        );
      })}
    </>
  );
}
