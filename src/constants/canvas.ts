export const WORKSPACE_WIDTH = 1200;
export const NUM_SEGMENTS = 10;

/** Maximum number of bit lines the workspace can display (and the bits
 *  slider allows). `WORKSPACE_HEIGHT` is derived below so every bit line
 *  fits on the stage. */
export const MAX_BITS = 16;

export const BOX_WIDTH = 100;
export const BOX_HEIGHT = 100;
export const DOT_RADIUS = 8;
export const DOT_OFFSET = 0;

export const GATE_WIDTH = 40;
export const GATE_HEIGHT = 40;

export const BIT_LINE_SPACING = 40;

/** Padding kept below the last bit line so endpoint dots remain visible. */
const BOTTOM_PADDING = 40;

const FIRST_BIT_LINE_OFFSET = 400;
export const WORKSPACE_HEIGHT = FIRST_BIT_LINE_OFFSET + (MAX_BITS - 1) * BIT_LINE_SPACING + BOTTOM_PADDING;

export const FIRST_BIT_LINE_Y = FIRST_BIT_LINE_OFFSET;
export const SNAPPED_ABS_Y = FIRST_BIT_LINE_Y - 10 - GATE_HEIGHT;

export const SEGMENTS_START_X = WORKSPACE_WIDTH * 0.3;
export const SEGMENT_WIDTH = (WORKSPACE_WIDTH - SEGMENTS_START_X) / NUM_SEGMENTS;
