import { Line } from 'react-konva';
import { BIT_LINE_SPACING, FIRST_BIT_LINE_Y } from '../../constants/canvas';

interface BitLinesProps {
  numBits: number;
  workspaceWidth: number;
}

export function BitLines({ numBits, workspaceWidth }: BitLinesProps) {
  return (
    <>
      {Array.from({ length: numBits }).map((_, i) => {
        const startY = FIRST_BIT_LINE_Y + i * BIT_LINE_SPACING;
        return (
          <Line
            key={`bit-line-${i}`}
            points={[0, startY, workspaceWidth, startY]}
            stroke={'#666'}
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
          />
        );
      })}
    </>
  );
}
