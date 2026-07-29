import type { CanvasGate, GateLine, GateType } from '../types';
import {
  GATE_WIDTH,
  GATE_HEIGHT,
  SNAPPED_ABS_Y,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
} from '../constants/canvas';
import { GATE_CONFIGS, getGateOrigins } from '../constants/gates';
import type { Circuit } from './types';

/**
 * Inverse of serializeCircuit: maps circuit JSON back onto canvas state.
 * Used to load saved circuits into the editor and to lay out gates for
 * thumbnails. Gates of unknown type are skipped.
 */
export function deserializeCircuit(circuit: Circuit): {
  gates: CanvasGate[];
  gateLines: GateLine[];
  numBits: number;
} {
  const gates: CanvasGate[] = [];
  const gateLines: GateLine[] = [];
  let idCounter = 0;
  const nextId = () => Date.now() + idCounter++;

  for (const op of circuit.ops) {
    if (!(op.type in GATE_CONFIGS)) continue;
    const type = op.type as GateType;
    const config = GATE_CONFIGS[type];

    const gateId = nextId();
    const centerX = SEGMENTS_START_X + op.segment * SEGMENT_WIDTH + SEGMENT_WIDTH / 2;
    gates.push({
      id: gateId,
      type,
      x: centerX - GATE_WIDTH / 2,
      y: SNAPPED_ABS_Y,
      width: GATE_WIDTH,
      height: GATE_HEIGHT,
      color: config.color,
      ...(op.angle != null ? { angle: op.angle } : {}),
    });

    const origins = getGateOrigins(config, GATE_WIDTH);
    // Targets occupy origins 0..targetCapacity-1, controls follow — the same
    // role assignment handleStageMouseUp uses when drawing lines by hand.
    const connections: { bitIndex: number; role: GateLine['role'] }[] = [
      ...op.targets.map((bitIndex) => ({ bitIndex, role: 'target' as const })),
      ...op.controls.map((bitIndex) => ({ bitIndex, role: 'control' as const })),
    ];

    connections.forEach(({ bitIndex, role }, originIndex) => {
      if (bitIndex < 0 || bitIndex >= circuit.numBits) return;
      const origin = origins[originIndex];
      gateLines.push({
        id: nextId(),
        gateId,
        barY: FIRST_BIT_LINE_Y + bitIndex * BIT_LINE_SPACING,
        role,
        originIndex,
        // originX is a local offset within the gate (see GateLineConnection).
        originX: origin ? origin.offsetX : GATE_WIDTH / 2,
      });
    });
  }

  return { gates, gateLines, numBits: circuit.numBits };
}
