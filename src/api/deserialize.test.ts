import { describe, it, expect } from 'vitest';
import { serializeCircuit } from './serialize';
import { deserializeCircuit } from './deserialize';
import type { Circuit } from './types';

const roundTrip = (circuit: Circuit) => {
  const { gates, gateLines, numBits } = deserializeCircuit(circuit);
  return serializeCircuit(gates, gateLines, numBits).circuit;
};

describe('deserializeCircuit', () => {
  it('round-trips an empty circuit', () => {
    const circuit: Circuit = { numBits: 4, ops: [] };
    expect(roundTrip(circuit)).toEqual(circuit);
  });

  it('round-trips a single-qubit gate', () => {
    const circuit: Circuit = {
      numBits: 3,
      ops: [{ id: 1, type: 'H', segment: 2, targets: [1], controls: [], angle: null }],
    };
    const result = roundTrip(circuit);
    expect(result.numBits).toBe(3);
    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({ type: 'H', segment: 2, targets: [1], controls: [], angle: null });
  });

  it('round-trips a controlled gate with target and control lines', () => {
    const circuit: Circuit = {
      numBits: 2,
      ops: [{ id: 7, type: 'CX', segment: 5, targets: [1], controls: [0], angle: null }],
    };
    const result = roundTrip(circuit);
    expect(result.ops[0]).toMatchObject({ type: 'CX', segment: 5, targets: [1], controls: [0] });
  });

  it('round-trips a two-target SWAP', () => {
    const circuit: Circuit = {
      numBits: 4,
      ops: [{ id: 3, type: 'SWAP', segment: 0, targets: [0, 3], controls: [], angle: null }],
    };
    const result = roundTrip(circuit);
    expect(result.ops[0]).toMatchObject({ type: 'SWAP', targets: [0, 3], controls: [] });
  });

  it('round-trips a parameterized gate preserving its angle', () => {
    const circuit: Circuit = {
      numBits: 2,
      ops: [{ id: 4, type: 'Rx', segment: 1, targets: [0], controls: [], angle: Math.PI / 4 }],
    };
    const result = roundTrip(circuit);
    expect(result.ops[0].angle).toBeCloseTo(Math.PI / 4);
  });

  it('skips ops with unknown gate types', () => {
    const circuit: Circuit = {
      numBits: 2,
      ops: [{ id: 9, type: 'NOPE', segment: 0, targets: [0], controls: [], angle: null }],
    };
    expect(deserializeCircuit(circuit).gates).toHaveLength(0);
  });

  it('drops connections to out-of-range bit lines', () => {
    const circuit: Circuit = {
      numBits: 2,
      ops: [{ id: 2, type: 'H', segment: 0, targets: [5], controls: [], angle: null }],
    };
    const { gates, gateLines } = deserializeCircuit(circuit);
    expect(gates).toHaveLength(1);
    expect(gateLines).toHaveLength(0);
  });
});
