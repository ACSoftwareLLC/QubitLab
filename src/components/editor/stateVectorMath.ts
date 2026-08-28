import type { StatevectorEntry } from "../../api/types";

/**
 * Per-wire probability helpers for the v2 editor grid readouts.
 *
 * Bit-order convention (docs/api.md:107 + simulator/src/engine.rs
 * `api_to_internal`): a basis string is printed MSB-first from the internal
 * index, and API wire `i` maps to internal bit `numBits - 1 - i` — so
 * `basis[wire]` is the value of wire `wire`, qubit 0 leftmost.
 */

/**
 * Marginal probability of measuring |1⟩ on each wire.
 *
 * P(wire = 1) = Σ prob over statevector entries whose basis bit at
 * `wire` is '1'. Entries filtered out by the simulator's ε threshold are
 * simply absent, which this sum handles naturally.
 */
export function wireProbabilitiesFromStatevector(
  entries: StatevectorEntry[],
  numBits: number,
): number[] {
  const probs = new Array<number>(numBits).fill(0);
  for (const entry of entries) {
    for (let wire = 0; wire < numBits; wire++) {
      if (entry.basis[wire] === "1") probs[wire] += entry.prob;
    }
  }
  // Clamp accumulated floating error into [0, 1].
  return probs.map((p) => Math.min(1, Math.max(0, p)));
}
