import {
  NUM_SEGMENTS,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';

/** Uniform cell widths — the layout when no segment holds a wide gate. */
export const DEFAULT_SEGMENT_WIDTHS: number[] = Array(NUM_SEGMENTS).fill(SEGMENT_WIDTH);

export type SegmentLayout = {
  widths: number[];
  starts: number[]; // left edge of each segment
  right: number;    // right edge of the last segment
};

/** Cumulative x positions for a given set of segment widths. */
export const getSegmentLayout = (widths: number[] = DEFAULT_SEGMENT_WIDTHS): SegmentLayout => {
  const starts: number[] = [];
  let x = SEGMENTS_START_X;
  for (const w of widths) {
    starts.push(x);
    x += w;
  }
  return { widths, starts, right: x };
};

/** Per-segment cell widths: a cell widens to fit the widest gate placed in
 *  it and shrinks back to the default once that gate leaves or is deleted. */
export const getSegmentWidths = (gates: { segment?: number; width: number }[]): number[] => {
  const widths = [...DEFAULT_SEGMENT_WIDTHS];
  for (const g of gates) {
    if (g.segment != null && g.segment >= 0 && g.segment < NUM_SEGMENTS) {
      widths[g.segment] = Math.max(widths[g.segment], g.width);
    }
  }
  return widths;
};

export const getSegmentIndex = (absX: number, widths: number[] = DEFAULT_SEGMENT_WIDTHS): number => {
  const clamped = Math.max(SEGMENTS_START_X, absX);
  let x = SEGMENTS_START_X;
  for (let i = 0; i < widths.length; i++) {
    if (clamped < x + widths[i]) return i;
    x += widths[i];
  }
  return widths.length - 1;
};

export const getSegmentCenter = (index: number, widths: number[] = DEFAULT_SEGMENT_WIDTHS): number => {
  const { starts } = getSegmentLayout(widths);
  return starts[index] + widths[index] / 2;
};

export const snapXToSegment = (absX: number, widths: number[] = DEFAULT_SEGMENT_WIDTHS): number => {
  return getSegmentCenter(getSegmentIndex(absX, widths), widths);
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
