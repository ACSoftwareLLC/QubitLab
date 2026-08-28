import { describe, it, expect } from "vitest";
import {
  encodeCircuitToHash,
  decodeHashToCircuit,
} from "./shareUrl";
import type { Circuit } from "../../api/types";

const sampleCircuit = (): Circuit => ({
  numBits: 3,
  ops: [
    { id: 1, type: "H", segment: 0, targets: [0], controls: [], angle: null },
    {
      id: 2,
      type: "CX",
      segment: 1,
      targets: [1],
      controls: [0],
      angle: null,
    },
    { id: 3, type: "Rx", segment: 2, targets: [2], controls: [], angle: 1.57 },
  ],
});

describe("encodeCircuitToHash / decodeHashToCircuit", () => {
  it("round-trips a circuit exactly", () => {
    const hash = encodeCircuitToHash(sampleCircuit());
    const decoded = decodeHashToCircuit(hash);
    expect(decoded).toEqual(sampleCircuit());
  });

  it("uses the base64url alphabet (no +, /, or =)", () => {
    // Exercise many op mixes to sweep the base64 output space.
    for (let i = 0; i < 200; i++) {
      const circuit: Circuit = {
        numBits: 4,
        ops: Array.from({ length: 6 }, (_, k) => ({
          id: i * 10 + k,
          type: ["H", "X", "Z", "S", "T", "M"][k]!,
          segment: k,
          targets: [(i + k) % 4],
          controls: k % 2 === 0 ? [] : [(i + k + 1) % 4],
          angle: k === 5 ? (i % 360) / 57.3 : null,
        })),
      };
      const hash = encodeCircuitToHash(circuit);
      expect(hash).not.toMatch(/[+/=]/);
    }
  });

  it("returns null on invalid base64", () => {
    expect(decodeHashToCircuit("not!!valid~~base64??")).toBeNull();
    expect(decodeHashToCircuit("")).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    // Valid base64url of a non-JSON string.
    const notJson = btoa(encodeURIComponent("this is not json"))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeHashToCircuit(notJson)).toBeNull();
  });

  it("returns null when numBits is out of range", () => {
    const bad = { ...sampleCircuit(), numBits: 99 };
    const hash = encodeCircuitToHash(bad as unknown as Circuit);
    expect(decodeHashToCircuit(hash)).toBeNull();
  });

  it("returns null on unknown gate types", () => {
    const bad = {
      ...sampleCircuit(),
      ops: [
        {
          id: 1,
          type: "QUANTUM_FROBNICATOR",
          segment: 0,
          targets: [0],
          controls: [],
          angle: null,
        },
      ],
    };
    const hash = encodeCircuitToHash(bad as unknown as Circuit);
    expect(decodeHashToCircuit(hash)).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    const num = btoa(encodeURIComponent("42"))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeHashToCircuit(num)).toBeNull();
  });
});
