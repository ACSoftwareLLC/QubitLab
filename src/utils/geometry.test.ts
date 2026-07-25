import { describe, it, expect } from 'vitest';
import {
  getSegmentIndex,
  snapXToSegment,
  getBitLineYs,
  getBitIndex,
  getClosestBitLine,
} from './geometry';
import {
  WORKSPACE_WIDTH,
  NUM_SEGMENTS,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';

describe('getSegmentIndex', () => {
  it('returns 0 at the left edge of the segment area', () => {
    expect(getSegmentIndex(SEGMENTS_START_X)).toBe(0);
  });

  it('advances one index per segment width', () => {
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      expect(getSegmentIndex(SEGMENTS_START_X + i * SEGMENT_WIDTH + 1)).toBe(i);
    }
  });

  it('clamps positions left of the segment area to segment 0', () => {
    expect(getSegmentIndex(0)).toBe(0);
    expect(getSegmentIndex(SEGMENTS_START_X - 1)).toBe(0);
    expect(getSegmentIndex(-500)).toBe(0);
  });

  it('clamps positions beyond the workspace to the last segment', () => {
    expect(getSegmentIndex(WORKSPACE_WIDTH)).toBe(NUM_SEGMENTS - 1);
    expect(getSegmentIndex(WORKSPACE_WIDTH + 1000)).toBe(NUM_SEGMENTS - 1);
  });

  it('uses the half-open interval [start, start + width) for each segment', () => {
    const boundary = SEGMENTS_START_X + SEGMENT_WIDTH;
    expect(getSegmentIndex(boundary - 0.01)).toBe(0);
    expect(getSegmentIndex(boundary)).toBe(1);
  });
});

describe('snapXToSegment', () => {
  it('returns the center of the segment containing the position', () => {
    const center0 = SEGMENTS_START_X + SEGMENT_WIDTH / 2;
    expect(snapXToSegment(SEGMENTS_START_X)).toBe(center0);
    expect(snapXToSegment(center0)).toBe(center0);
    expect(snapXToSegment(SEGMENTS_START_X + SEGMENT_WIDTH - 1)).toBe(center0);
  });

  it('snaps out-of-range positions to the edge segment centers', () => {
    expect(snapXToSegment(-100)).toBe(SEGMENTS_START_X + SEGMENT_WIDTH / 2);
    expect(snapXToSegment(WORKSPACE_WIDTH + 100)).toBe(
      SEGMENTS_START_X + (NUM_SEGMENTS - 1) * SEGMENT_WIDTH + SEGMENT_WIDTH / 2,
    );
  });
});

describe('getBitLineYs', () => {
  it('returns an empty array for zero bits', () => {
    expect(getBitLineYs(0)).toEqual([]);
  });

  it('spaces lines evenly starting at FIRST_BIT_LINE_Y', () => {
    expect(getBitLineYs(4)).toEqual([
      FIRST_BIT_LINE_Y,
      FIRST_BIT_LINE_Y + BIT_LINE_SPACING,
      FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING,
      FIRST_BIT_LINE_Y + 3 * BIT_LINE_SPACING,
    ]);
  });
});

describe('getBitIndex', () => {
  it('maps each bit line Y to its index', () => {
    for (let i = 0; i < 4; i++) {
      expect(getBitIndex(FIRST_BIT_LINE_Y + i * BIT_LINE_SPACING)).toBe(i);
    }
  });

  it('rounds to the nearest line', () => {
    expect(getBitIndex(FIRST_BIT_LINE_Y + BIT_LINE_SPACING / 2 - 1)).toBe(0);
    expect(getBitIndex(FIRST_BIT_LINE_Y + BIT_LINE_SPACING / 2)).toBe(1);
  });

  it('can produce out-of-range indices for positions above the first line', () => {
    expect(getBitIndex(FIRST_BIT_LINE_Y - 2 * BIT_LINE_SPACING)).toBe(-2);
  });
});

describe('getClosestBitLine', () => {
  it('returns the exact line when y is on a line', () => {
    expect(getClosestBitLine(FIRST_BIT_LINE_Y + BIT_LINE_SPACING, 4)).toBe(
      FIRST_BIT_LINE_Y + BIT_LINE_SPACING,
    );
  });

  it('returns the nearest line when y is between lines', () => {
    expect(getClosestBitLine(FIRST_BIT_LINE_Y + 5, 4)).toBe(FIRST_BIT_LINE_Y);
    expect(getClosestBitLine(FIRST_BIT_LINE_Y + BIT_LINE_SPACING - 5, 4)).toBe(
      FIRST_BIT_LINE_Y + BIT_LINE_SPACING,
    );
  });

  it('clamps to the outermost lines for far-away positions', () => {
    expect(getClosestBitLine(-1000, 4)).toBe(FIRST_BIT_LINE_Y);
    expect(getClosestBitLine(100000, 3)).toBe(FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING);
  });
});
