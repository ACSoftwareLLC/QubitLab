import {
  WORKSPACE_WIDTH,
  NUM_SEGMENTS,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';

export const getSegmentIndex = (absX: number): number => {
  const clamped = Math.max(SEGMENTS_START_X, Math.min(absX, WORKSPACE_WIDTH));
  const idx = Math.floor((clamped - SEGMENTS_START_X) / SEGMENT_WIDTH);
  return Math.max(0, Math.min(NUM_SEGMENTS - 1, idx));
};

export const snapXToSegment = (absX: number): number => {
  const clampedIdx = getSegmentIndex(absX);
  return SEGMENTS_START_X + clampedIdx * SEGMENT_WIDTH + SEGMENT_WIDTH / 2;
};

export const getBitLineYs = (numBits: number): number[] =>
  Array.from({ length: numBits }, (_, i) => FIRST_BIT_LINE_Y + i * BIT_LINE_SPACING);

export const getBitIndex = (barY: number): number =>
  Math.round((barY - FIRST_BIT_LINE_Y) / BIT_LINE_SPACING);

export const getClosestBitLine = (y: number, numBits: number): number => {
  const bitLines = getBitLineYs(numBits);
  return bitLines.reduce(
    (prev, cur) => (Math.abs(y - cur) < Math.abs(y - prev) ? cur : prev),
    bitLines[0],
  );
};
