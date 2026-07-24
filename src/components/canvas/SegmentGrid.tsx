import { Line, Rect } from 'react-konva';
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
  /** Segment being executed — highlighted when >= 0. */
  currentSegment?: number;
  /** When provided, hovering a segment column peeks its state. */
  onPeekSegment?: (segment: number) => void;
  onPeekEnd?: () => void;
}

export function SegmentGrid({ numBits, currentSegment = -1, onPeekSegment, onPeekEnd }: SegmentGridProps) {
  const topY = WORKSPACE_HEIGHT * 0.2;
  const bottomY = FIRST_BIT_LINE_Y + (numBits - 1) * BIT_LINE_SPACING + 20;

  return (
    <>
      {currentSegment >= 0 && (
        <Rect
          x={SEGMENTS_START_X + currentSegment * SEGMENT_WIDTH}
          y={topY}
          width={SEGMENT_WIDTH}
          height={bottomY - topY}
          fill='rgba(33, 150, 243, 0.15)'
          listening={false}
        />
      )}

      {Array.from({ length: NUM_SEGMENTS + 1 }).map((_, i) => {
        const x = SEGMENTS_START_X + i * SEGMENT_WIDTH;
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

      {onPeekSegment &&
        Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
          <Rect
            key={`peek-${i}`}
            x={SEGMENTS_START_X + i * SEGMENT_WIDTH}
            y={topY}
            width={SEGMENT_WIDTH}
            height={bottomY - topY}
            fill='rgba(0,0,0,0)'
            onMouseEnter={() => onPeekSegment(i)}
            onMouseLeave={() => onPeekEnd?.()}
          />
        ))}
    </>
  );
}
