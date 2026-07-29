import { Group, Line, Text } from 'react-konva';
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
          <Group key={`bit-line-${i}`}>
            <Line
              points={[0, startY, workspaceWidth, startY]}
              stroke={'#475569'}
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
            <Text
              text={`q${i}`}
              x={10}
              y={startY - 14}
              fontSize={28}
              fill={'#94a3b8'}
              listening={false}
            />
          </Group>
        );
      })}
    </>
  );
}
