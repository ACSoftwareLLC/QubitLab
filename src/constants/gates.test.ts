import { describe, it, expect } from 'vitest';
import { GATE_CONFIGS, getGateOrigins, getGateWidth } from './gates';
import { GATE_WIDTH } from './canvas';

describe('getGateOrigins', () => {
  it('creates one origin per accepted connection', () => {
    expect(getGateOrigins(GATE_CONFIGS.H, 40)).toHaveLength(1);
    expect(getGateOrigins(GATE_CONFIGS.CX, 40)).toHaveLength(2);
    expect(getGateOrigins(GATE_CONFIGS.CCX, 40)).toHaveLength(3);
    expect(getGateOrigins(GATE_CONFIGS.SWAP, 40)).toHaveLength(2);
  });

  it('lists target origins before control origins', () => {
    const origins = getGateOrigins(GATE_CONFIGS.CCX, 40);
    expect(origins.map(o => o.role)).toEqual(['target', 'control', 'control']);
  });

  it('assigns sequential indices starting at 0', () => {
    const origins = getGateOrigins(GATE_CONFIGS.CCX, 40);
    expect(origins.map(o => o.index)).toEqual([0, 1, 2]);
  });

  it('spaces origins evenly along the gate bottom edge', () => {
    const origins = getGateOrigins(GATE_CONFIGS.CX, 40);
    expect(origins[0].offsetX).toBeCloseTo(40 / 3);
    expect(origins[1].offsetX).toBeCloseTo(80 / 3);
  });

  it('centers a single origin', () => {
    const [origin] = getGateOrigins(GATE_CONFIGS.H, 40);
    expect(origin.offsetX).toBeCloseTo(20);
    expect(origin.role).toBe('target');
  });
});

describe('getGateWidth', () => {
  it('keeps single-origin gates at the default width', () => {
    expect(getGateWidth(GATE_CONFIGS.H)).toBe(GATE_WIDTH);
    expect(getGateWidth(GATE_CONFIGS.Rx)).toBe(GATE_WIDTH);
    expect(getGateWidth(GATE_CONFIGS.M)).toBe(GATE_WIDTH);
  });

  it('doubles the width of two-origin gates', () => {
    expect(getGateWidth(GATE_CONFIGS.CX)).toBe(GATE_WIDTH * 2);
    expect(getGateWidth(GATE_CONFIGS.C)).toBe(GATE_WIDTH * 2);
    expect(getGateWidth(GATE_CONFIGS.CZ)).toBe(GATE_WIDTH * 2);
    expect(getGateWidth(GATE_CONFIGS.SWAP)).toBe(GATE_WIDTH * 2);
  });

  it('triples the width of three-origin gates', () => {
    expect(getGateWidth(GATE_CONFIGS.CCX)).toBe(GATE_WIDTH * 3);
  });

  it('never shrinks below the default width', () => {
    for (const config of Object.values(GATE_CONFIGS)) {
      expect(getGateWidth(config)).toBeGreaterThanOrEqual(GATE_WIDTH);
    }
  });
});

describe('GATE_CONFIGS', () => {
  it('gives every parameterized gate a default angle', () => {
    for (const config of Object.values(GATE_CONFIGS)) {
      if (config.category === 'parameterized') {
        expect(config.defaultAngle).toBeTypeOf('number');
      }
    }
  });

  it('only multi-qubit gates accept control lines', () => {
    for (const config of Object.values(GATE_CONFIGS)) {
      if (config.category !== 'multi') {
        expect(config.controlCapacity).toBe(0);
      }
    }
  });

  it('SWAP takes two targets and no controls', () => {
    expect(GATE_CONFIGS.SWAP.targetCapacity).toBe(2);
    expect(GATE_CONFIGS.SWAP.controlCapacity).toBe(0);
  });

  it('every gate accepts at least one target', () => {
    for (const config of Object.values(GATE_CONFIGS)) {
      expect(config.targetCapacity).toBeGreaterThanOrEqual(1);
    }
  });
});
