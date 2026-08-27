import { BIT_LINE_SPACING, FIRST_BIT_LINE_Y } from '../../constants/canvas';

interface BitLinesProps {
  numBits: number;
  workspaceWidth: number;
}

export function BitLines({ numBits, workspaceWidth }: BitLinesProps) {
  return (
    <g>
      <defs>
        <filter id="bit-line-glow" x="-20%" y="-300%" width="140%" height="700%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {Array.from({ length: numBits }).map((_, i) => {
        const startY = FIRST_BIT_LINE_Y + i * BIT_LINE_SPACING;
        const label = `q${i}`;
        const labelWidth = 28 + label.length * 5;
        return (
          <g key={`bit-line-${i}`}>
            {/* subtle background strip for readability */}
            <rect
              x={0}
              y={startY - 10}
              width={workspaceWidth}
              height={20}
              fill="rgba(15, 23, 42, 0.25)"
              pointerEvents="none"
            />
            <line
              x1={0}
              y1={startY}
              x2={workspaceWidth}
              y2={startY}
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
              filter="url(#bit-line-glow)"
              pointerEvents="none"
            />
            {/* qubit label pill */}
            <rect
              x={10}
              y={startY - 19}
              width={labelWidth}
              height={18}
              rx={9}
              ry={9}
              fill="rgba(30, 41, 59, 0.85)"
              stroke="rgba(71, 85, 105, 0.6)"
              strokeWidth={1}
              pointerEvents="none"
            />
            <text
              x={10 + labelWidth / 2}
              y={startY - 9}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={600}
              fill="#94a3b8"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {label}
            </text>
            {/* endpoint ticks */}
            <line
              x1={workspaceWidth - 8}
              y1={startY - 5}
              x2={workspaceWidth - 8}
              y2={startY + 5}
              stroke="#475569"
              strokeWidth={1.5}
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}
