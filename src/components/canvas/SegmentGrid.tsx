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

  const highlightX = layout.starts[currentSegment] ?? 0;
  const highlightW = widths[currentSegment] ?? 0;

  return (
    <g>
      <defs>
        <filter id="segment-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {currentSegment >= 0 && (
        <>
          <rect
            x={highlightX}
            y={topY}
            width={highlightW}
            height={bottomY - topY}
            rx={8}
            ry={8}
            fill="rgba(56, 189, 248, 0.08)"
            stroke="rgba(56, 189, 248, 0.35)"
            strokeWidth={1}
            filter="url(#segment-glow)"
            pointerEvents="none"
          />
          <line
            x1={highlightX}
            y1={topY}
            x2={highlightX}
            y2={bottomY}
            stroke="rgba(56, 189, 248, 0.55)"
            strokeWidth={2}
            strokeLinecap="round"
            pointerEvents="none"
          />
        </>
      )}

      {boundaries.map((x, i) => (
        <line
          key={`seg-${i}`}
          x1={x}
          y1={topY}
          x2={x}
          y2={bottomY}
          stroke="#334155"
          strokeWidth={1}
          strokeDasharray="5 5"
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}

      {onPeekSegment &&
        Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
          <rect
            key={`peek-${i}`}
            x={layout.starts[i]}
            y={topY}
            width={widths[i]}
            height={bottomY - topY}
            fill="rgba(0,0,0,0)"
            onMouseEnter={() => onPeekSegment(i)}
            onMouseLeave={() => onPeekEnd?.()}
            style={{ cursor: 'crosshair' }}
          />
        ))}
    </g>
  );
}
