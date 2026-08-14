import type { DraggingGateLine } from '../../types';

interface GateLinePreviewProps {
  draggingGateLine: DraggingGateLine;
}

/** Preview of a gate connection while dragging: a grey line from the origin
 *  to the raw cursor, plus the opaque vertical result (inline with the
 *  origin, end snapped to bit lines) with a dot on the end.
 *  Unmounts as soon as the drag ends. */
export function GateLinePreview({ draggingGateLine }: GateLinePreviewProps) {
  return (
    <g pointerEvents="none">
      <defs>
        <filter id="line-preview-glow" x="-60%" y="-20%" width="220%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* grey: origin → raw cursor */}
      <line
        x1={draggingGateLine.startX}
        y1={draggingGateLine.startY}
        x2={draggingGateLine.rawX}
        y2={draggingGateLine.rawY}
        stroke="#64748b"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      {/* solid: origin → snapped end, dot on the end */}
      <line
        x1={draggingGateLine.startX}
        y1={draggingGateLine.startY}
        x2={draggingGateLine.currentX}
        y2={draggingGateLine.currentY}
        stroke="#e2e8f0"
        strokeWidth={2.5}
        strokeLinecap="round"
        filter="url(#line-preview-glow)"
      />
      <circle
        cx={draggingGateLine.currentX}
        cy={draggingGateLine.currentY}
        r={8}
        fill="#e2e8f0"
        filter="url(#line-preview-glow)"
      />
      <circle
        cx={draggingGateLine.currentX}
        cy={draggingGateLine.currentY}
        r={4}
        fill="#0f172a"
      />
    </g>
  );
}
