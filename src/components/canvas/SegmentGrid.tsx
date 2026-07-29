import { Line, Rect } from 'react-konva';
import {
  WORKSPACE_HEIGHT,
  NUM_SEGMENTS,
  BIT_LINE_SPACING,
  FIRST_BIT_LINE_Y,
} from '../../constants/canvas';
import { getSegmentLayout } from '../../utils/geometry';

interface SegmentGridProps {
  numBits: number;
  /** Segment being executed — highlighted when >= 0. */
  currentSegment?: number;
  /** When provided, hovering a segment column peeks its state. */
  onPeekSegment?: (segment: number) => void;
  onPeekEnd?: () => void;
  /** Per-segment cell widths — segments holding wide gates are expanded. */
  widths: number[];
}

export function SegmentGrid({ numBits, currentSegment = -1, onPeekSegment, onPeekEnd, widths }: SegmentGridProps) {
  const topY = WORKSPACE_HEIGHT * 0.2;
  const bottomY = FIRST_BIT_LINE_Y + (numBits - 1) * BIT_LINE_SPACING + 20;
  const layout = getSegmentLayout(widths);
  const boundaries = [...layout.starts, layout.right];

  return (
    <>
      {currentSegment >= 0 && (
        <Rect
          x={layout.starts[currentSegment]}
          y={topY}
          width={widths[currentSegment]}
          height={bottomY - topY}
          fill='rgba(56, 189, 248, 0.1)'
          listening={false}
        />
      )}

      {boundaries.map((x, i) => (
        <Line
          key={`seg-${i}`}
          points={[x, topY, x, bottomY]}
          stroke={'#334155'}
          strokeWidth={1.5}
          dash={[4, 4]}
          listening={false}
        />
      ))}

      {onPeekSegment &&
        Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
          <Rect
            key={`peek-${i}`}
            x={layout.starts[i]}
            y={topY}
            width={widths[i]}
            height={bottomY - topY}
            fill='rgba(0,0,0,0)'
            onMouseEnter={() => onPeekSegment(i)}
            onMouseLeave={() => onPeekEnd?.()}
          />
        ))}
    </>
  );
}
