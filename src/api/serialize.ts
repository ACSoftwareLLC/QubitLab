import type { CanvasGate, GateLine } from '../types';
import { GATE_WIDTH } from '../constants/canvas';
import { getBitIndex, getSegmentIndex } from '../utils/geometry';
import type { Circuit, GateOp } from './types';

/**
 * Translates canvas state into the circuit JSON of docs/api.md.
 *
 * A gate becomes executable once it has at least one GateLine connecting it
 * to a bit line. Lines with role 'target' populate `targets`, lines with
 * role 'control' populate `controls` ('C' is just an alias of CX and follows
 * the same rule). Gates with no lines are omitted and reported so the UI can
 * surface them.
 */
export function serializeCircuit(
  gates: CanvasGate[],
  gateLines: GateLine[],
  numBits: number,
): { circuit: Circuit; unconnectedGateIds: number[] } {
  const ops: GateOp[] = [];
  const unconnectedGateIds: number[] = [];

  for (const gate of gates) {
    const lines = gateLines.filter(l => l.gateId === gate.id);
    if (lines.length === 0) {
      unconnectedGateIds.push(gate.id);
      continue;
    }

    const targets = lines.filter(l => l.role !== 'control').map(l => getBitIndex(l.barY));
    const controls = lines.filter(l => l.role === 'control').map(l => getBitIndex(l.barY));

    const absCenterX = gate.x + (gate.width || GATE_WIDTH) / 2;
    ops.push({
      id: gate.id,
      type: gate.type,
      // Prefer the tracked segment (exact under widened layouts); fall back
      // to a geometric lookup for gates placed before segments were tracked.
      segment: gate.segment ?? getSegmentIndex(absCenterX),
      targets,
      controls,
      angle: gate.angle ?? null,
    });
  }

  return { circuit: { numBits, ops }, unconnectedGateIds };
}
