import { describe, it, expect } from 'vitest';
import { calculateBlochVector } from './bloch-vector';
import type { StatevectorEntry } from '../../api/types';

describe('calculateBlochVector', () => {
  it('maps |0⟩ to the north pole (+z)', () => {
    const sv: StatevectorEntry[] = [{ basis: '0', re: 1, im: 0, prob: 1 }];
    const v = calculateBlochVector(sv, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });

  it('maps |1⟩ to the south pole (-z)', () => {
    const sv: StatevectorEntry[] = [{ basis: '1', re: 1, im: 0, prob: 1 }];
    const v = calculateBlochVector(sv, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-1);
  });

  it('maps |+⟩ to +x', () => {
    const s = 1 / Math.sqrt(2);
    const sv: StatevectorEntry[] = [
      { basis: '0', re: s, im: 0, prob: 0.5 },
      { basis: '1', re: s, im: 0, prob: 0.5 },
    ];
    const v = calculateBlochVector(sv, 0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);
  });

  it('maps |−⟩ to -x', () => {
    const s = 1 / Math.sqrt(2);
    const sv: StatevectorEntry[] = [
      { basis: '0', re: s, im: 0, prob: 0.5 },
      { basis: '1', re: -s, im: 0, prob: 0.5 },
    ];
    const v = calculateBlochVector(sv, 0);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);
  });

  it('maps |i+⟩ to +y', () => {
    const s = 1 / Math.sqrt(2);
    const sv: StatevectorEntry[] = [
      { basis: '0', re: s, im: 0, prob: 0.5 },
      { basis: '1', re: 0, im: s, prob: 0.5 },
    ];
    const v = calculateBlochVector(sv, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('traces out the correct qubit in a multi-qubit state', () => {
    // Bell state (|00⟩ + |11⟩)/√2: each single-qubit reduced state is maximally mixed.
    const s = 1 / Math.sqrt(2);
    const sv: StatevectorEntry[] = [
      { basis: '00', re: s, im: 0, prob: 0.5 },
      { basis: '11', re: s, im: 0, prob: 0.5 },
    ];
    const v0 = calculateBlochVector(sv, 0);
    const v1 = calculateBlochVector(sv, 1);
    expect(v0.x).toBeCloseTo(0);
    expect(v0.y).toBeCloseTo(0);
    expect(v0.z).toBeCloseTo(0);
    expect(v1.x).toBeCloseTo(0);
    expect(v1.y).toBeCloseTo(0);
    expect(v1.z).toBeCloseTo(0);
  });
});
