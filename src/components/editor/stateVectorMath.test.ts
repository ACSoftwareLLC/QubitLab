import { describe, expect, it } from "vitest";
import {
  wireProbabilitiesFromStatevector,
} from "./stateVectorMath";
import type { StatevectorEntry } from "../../api/types";

const e = (
  basis: string,
  re: number,
  im: number,
  prob: number,
): StatevectorEntry => ({ basis, re, im, prob });

// Convention (pinned): basis[wire] = wire's value, qubit 0 leftmost
// (docs/api.md:107; simulator api_to_internal + MSB-first formatting).

describe("wireProbabilitiesFromStatevector", () => {
  it("returns 0 for all wires on the empty statevector", () => {
    expect(wireProbabilitiesFromStatevector([], 3)).toEqual([0, 0, 0]);
  });

  it("returns 0 for the ground state |000⟩", () => {
    const entries = [e("000", 1, 0, 1)];
    expect(wireProbabilitiesFromStatevector(entries, 3)).toEqual([0, 0, 0]);
  });

  it("uniform superposition gives 0.5 on every wire", () => {
    const entries = [
      e("00", 0.5, 0, 0.25),
      e("01", 0.5, 0, 0.25),
      e("10", 0.5, 0, 0.25),
      e("11", 0.5, 0, 0.25),
    ];
    expect(wireProbabilitiesFromStatevector(entries, 2)).toEqual([0.5, 0.5]);
  });

  it("Bell state |00⟩+|11⟩ gives 0.5 on both wires", () => {
    const entries = [e("00", 0.7071, 0, 0.5), e("11", 0.7071, 0, 0.5)];
    expect(wireProbabilitiesFromStatevector(entries, 2)).toEqual([0.5, 0.5]);
  });

  it("biased state |100⟩ puts P(1)=1 on wire 0 only (convention test)", () => {
    const entries = [e("100", 1, 0, 1)];
    // basis[0]='1' → wire 0 is the excited qubit (q0 leftmost).
    expect(wireProbabilitiesFromStatevector(entries, 3)).toEqual([1, 0, 0]);
  });

  it("biased state |001⟩ puts P(1)=1 on the last wire", () => {
    const entries = [e("001", 1, 0, 1)];
    expect(wireProbabilitiesFromStatevector(entries, 3)).toEqual([0, 0, 1]);
  });

  it("mixed two-qubit state sums marginals per wire", () => {
    // P(w0=1) = 0.25 + 0.25 = 0.5; P(w1=1) = 0.25.
    const entries = [
      e("00", 0.65, 0, 0.5),
      e("10", 0.5, 0, 0.25),
      e("11", 0.5, 0, 0.25),
    ];
    expect(wireProbabilitiesFromStatevector(entries, 2)).toEqual([0.5, 0.25]);
  });

  it("clamps accumulated floating error into [0, 1]", () => {
    // Roundoff can push a marginal just past 1; entries both carry a '1'
    // at wire 0 and over-specified probabilities (0.55 + 0.55 = 1.1).
    const entries = [e("10", 0.74, 0, 0.55), e("11", 0.74, 0, 0.55)];
    const probs = wireProbabilitiesFromStatevector(entries, 2);
    expect(probs[0]).toBe(1);
    expect(probs[1]).toBeCloseTo(0.55, 5);
  });
});
