import { describe, it, expect } from 'vitest';
import { serializeCircuit } from './serialize';
import type { CanvasGate, GateLine } from '../types';
import {
  GATE_WIDTH,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';

let nextId = 1;

const makeGate = (overrides: Partial<CanvasGate> = {}): CanvasGate => ({
  id: nextId++,
  type: 'H',
  x: SEGMENTS_START_X + SEGMENT_WIDTH / 2 - GATE_WIDTH / 2, // center of segment 0
  y: 0,
  width: GATE_WIDTH,
  height: 40,
  color: '#000',
  ...overrides,
});

const makeLine = (overrides: Partial<GateLine> = {}): GateLine => ({
  id: nextId++,
  gateId: 0,
  barY: FIRST_BIT_LINE_Y,
  role: 'target',
  originIndex: 0,
  originX: 0,
  ...overrides,
});

describe('serializeCircuit', () => {
  it('returns an empty circuit when there are no gates', () => {
    const { circuit, unconnectedGateIds } = serializeCircuit([], [], 4);
    expect(circuit).toEqual({ numBits: 4, ops: [] });
    expect(unconnectedGateIds).toEqual([]);
  });

  it('omits gates with no lines and reports them as unconnected', () => {
    const gate = makeGate();
    const { circuit, unconnectedGateIds } = serializeCircuit([gate], [], 4);
    expect(circuit.ops).toEqual([]);
    expect(unconnectedGateIds).toEqual([gate.id]);
  });

  it('serializes a connected gate with its target bit', () => {
    const gate = makeGate();
    const line = makeLine({ gateId: gate.id, barY: FIRST_BIT_LINE_Y + BIT_LINE_SPACING });
    const { circuit, unconnectedGateIds } = serializeCircuit([gate], [line], 4);

    expect(unconnectedGateIds).toEqual([]);
    expect(circuit.ops).toEqual([
      {
        id: gate.id,
        type: 'H',
        segment: 0,
        targets: [1],
        controls: [],
        angle: null,
      },
    ]);
  });

  it('splits lines into targets and controls by role', () => {
    const gate = makeGate({ type: 'CX' });
    const target = makeLine({ gateId: gate.id, barY: FIRST_BIT_LINE_Y + BIT_LINE_SPACING });
    const control = makeLine({
      gateId: gate.id,
      barY: FIRST_BIT_LINE_Y,
      role: 'control',
      originIndex: 1,
    });
    const { circuit } = serializeCircuit([gate], [target, control], 2);

    expect(circuit.ops).toHaveLength(1);
    expect(circuit.ops[0].targets).toEqual([1]);
    expect(circuit.ops[0].controls).toEqual([0]);
  });

  it('derives the segment from the gate center x', () => {
    const gateInSegment3 = makeGate({
      x: SEGMENTS_START_X + 3 * SEGMENT_WIDTH + SEGMENT_WIDTH / 2 - GATE_WIDTH / 2,
    });
    const line = makeLine({ gateId: gateInSegment3.id });
    const { circuit } = serializeCircuit([gateInSegment3], [line], 4);
    expect(circuit.ops[0].segment).toBe(3);
  });

  it('passes the gate angle through and uses null when absent', () => {
    const rx = makeGate({ type: 'Rx', angle: Math.PI / 4 });
    const h = makeGate({ type: 'H' });
    const lines = [makeLine({ gateId: rx.id }), makeLine({ gateId: h.id })];
    const { circuit } = serializeCircuit([rx, h], lines, 4);

    expect(circuit.ops[0].angle).toBeCloseTo(Math.PI / 4);
    expect(circuit.ops[1].angle).toBeNull();
  });

  it('keeps numBits in the circuit payload', () => {
    const { circuit } = serializeCircuit([], [], 7);
    expect(circuit.numBits).toBe(7);
  });

  it('handles a mix of connected and unconnected gates', () => {
    const connected = makeGate();
    const lonely = makeGate();
    const line = makeLine({ gateId: connected.id });
    const { circuit, unconnectedGateIds } = serializeCircuit([connected, lonely], [line], 4);

    expect(circuit.ops.map(op => op.id)).toEqual([connected.id]);
    expect(unconnectedGateIds).toEqual([lonely.id]);
  });
});
