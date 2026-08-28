import { simulateCircuit } from "../../api/client";
import type { Circuit, Snapshot } from "../../api/types";

/**
 * Pure aggregation math for the run-N-shots histogram. Lives outside
 * ShotsPanel.tsx so the component file exports only components
 * (react-refresh) and the helpers stay trivially testable.
 */

/** Aggregated outcome of N measurement shots. */
export type ShotsResult = {
  /** Measured wires (ascending) — union of M-gate targets. */
  wires: number[];
  /** Per-wire 0/1 counts. */
  counts: Record<number, { zero: number; one: number }>;
  /** Joint bitstrings (wire order, wire 0 first) → count, top 6 by count.
   *  Empty unless 2+ wires are measured. */
  joint: { bits: string; count: number }[];
  shots: number;
};

/** opId → measured wire for every M-gate op (targets[0], within range). */
export function opWireMap(
  ops: Circuit["ops"],
  numBits: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const op of ops) {
    if (op.type !== "M") continue;
    const wire = op.targets[0];
    if (wire == null || wire < 0 || wire >= numBits) continue;
    map.set(String(op.id), wire);
  }
  return map;
}

/** Measured wires (ascending, deduplicated) for a circuit. */
export function measuredWires(
  ops: Circuit["ops"],
  numBits: number,
): number[] {
  const wires = Array.from(new Set(opWireMap(ops, numBits).values()));
  wires.sort((a, b) => a - b);
  return wires;
}

/**
 * Aggregate N snapshots' measurements against an opId → wire map.
 * Pure: same inputs → same result, no randomness, no I/O.
 */
export function aggregateShots(
  snapshots: Snapshot[],
  numBits: number,
  opToWire: Map<string, number>,
): ShotsResult {
  void numBits; // wire range already enforced by opWireMap
  const wireSet = new Set(opToWire.values());
  const wires = Array.from(wireSet);
  wires.sort((a, b) => a - b);

  const counts: Record<number, { zero: number; one: number }> = {};
  for (const w of wires) {
    counts[w] = { zero: 0, one: 0 };
  }

  const jointCounts = new Map<string, number>();
  for (const snap of snapshots) {
    const wireOutcome = new Map<number, 0 | 1>();
    for (const [opId, outcome] of Object.entries(snap.measurements)) {
      const wire = opToWire.get(opId);
      if (wire == null) continue;
      wireOutcome.set(wire, outcome);
      if (outcome === 0) {
        counts[wire].zero += 1;
      } else {
        counts[wire].one += 1;
      }
    }
    if (wires.length >= 2) {
      const bits = wires.map((w) => wireOutcome.get(w) ?? 0).join("");
      jointCounts.set(bits, (jointCounts.get(bits) ?? 0) + 1);
    }
  }

  const jointEntries = Array.from(jointCounts.entries());
  jointEntries.sort((a, b) => b[1] - a[1]);
  const joint = jointEntries
    .slice(0, 6)
    .map(([bits, count]) => ({ bits, count }));

  return { wires, counts, joint, shots: snapshots.length };
}

/** Run N independent shots (fresh randomness per simulate call) and
 *  aggregate. */
export async function runShots(
  circuit: Circuit,
  n: number,
  numBits: number,
): Promise<ShotsResult> {
  const map = opWireMap(circuit.ops, numBits);
  const snapshots: Snapshot[] = [];
  for (let i = 0; i < n; i++) {
    snapshots.push(await simulateCircuit(circuit, null));
  }
  return aggregateShots(snapshots, numBits, map);
}
