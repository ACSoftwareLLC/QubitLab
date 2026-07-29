import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_WIDTH,
  WORKSPACE_HEIGHT,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
  MAX_BITS,
  DOT_RADIUS,
  GATE_HEIGHT,
  SNAPPED_ABS_Y,
  SEGMENTS_START_X,
} from './canvas';

describe('canvas constants', () => {
  it('MAX_BITS is a positive integer', () => {
    expect(Number.isInteger(MAX_BITS)).toBe(true);
    expect(MAX_BITS).toBeGreaterThan(0);
  });

  it('fits every bit line (and its endpoint dot) inside the workspace', () => {
    const lastBitLineY = FIRST_BIT_LINE_Y + (MAX_BITS - 1) * BIT_LINE_SPACING;
    expect(lastBitLineY + DOT_RADIUS).toBeLessThanOrEqual(WORKSPACE_HEIGHT);
    expect(FIRST_BIT_LINE_Y).toBeGreaterThan(0);
    expect(FIRST_BIT_LINE_Y).toBeLessThan(WORKSPACE_HEIGHT);
  });

  it('places the gate row fully above the first bit line', () => {
    expect(SNAPPED_ABS_Y).toBeGreaterThanOrEqual(0);
    expect(SNAPPED_ABS_Y + GATE_HEIGHT).toBeLessThan(FIRST_BIT_LINE_Y);
  });

  it('keeps the segment area inside the workspace', () => {
    expect(SEGMENTS_START_X).toBeGreaterThan(0);
    expect(SEGMENTS_START_X).toBeLessThan(WORKSPACE_WIDTH);
  });
});
