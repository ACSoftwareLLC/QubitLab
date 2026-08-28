import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../api/types";
import { aggregateShots, measuredWires, opWireMap } from "./shotsMath";

/** Hand-built snapshot with per-op measurement outcomes. */
const snap = (measurements: Record<string, 0 | 1>): Snapshot => ({
  segment: 2,
  statevector: [],
  measurements,
});

/** Two M gates: op 10 → wire 0, op 20 → wire 1. */
const ops = [
  { id: 10, type: "M", segment: 0, targets: [0], controls: [], angle: null },
  { id: 20, type: "M", segment: 1, targets: [1], controls: [], angle: null },
  { id: 30, type: "H", segment: 2, targets: [0], controls: [], angle: null },
];

describe("opWireMap / measuredWires", () => {
  it("maps M-gate op ids to their target wires", () => {
    expect(opWireMap(ops, 4)).toEqual(
      new Map([
        ["10", 0],
        ["20", 1],
      ]),
    );
  });

  it("skips M gates whose target is out of range", () => {
    expect(opWireMap(ops, 1)).toEqual(new Map([["10", 0]]));
    expect(measuredWires(ops, 1)).toEqual([0]);
  });

  it("returns wires ascending and deduplicated", () => {
    const dupOps = [
      ...ops,
      { id: 40, type: "M", segment: 3, targets: [1], controls: [], angle: null },
    ];
    expect(measuredWires(dupOps, 4)).toEqual([0, 1]);
  });
});

describe("aggregateShots", () => {
  const map = opWireMap(ops, 4);

  it("counts per-wire 0/1 outcomes across shots", () => {
    // 4 shots: q0 = 0,0,1,1 · q1 = 0,1,1,1
    const shots = [
      snap({ 10: 0, 20: 0 }),
      snap({ 10: 0, 20: 1 }),
      snap({ 10: 1, 20: 1 }),
      snap({ 10: 1, 20: 1 }),
    ];
    const r = aggregateShots(shots, 4, map);
    expect(r.shots).toBe(4);
    expect(r.wires).toEqual([0, 1]);
    expect(r.counts[0]).toEqual({ zero: 2, one: 2 });
    expect(r.counts[1]).toEqual({ zero: 1, one: 3 });
  });

  it("builds joint bitstrings wire-0-first and sorts by count desc", () => {
    // outcomes (q0,q1): (0,0) x1, (0,1) x1, (1,1) x3
    const shots = [
      snap({ 10: 0, 20: 0 }),
      snap({ 10: 0, 20: 1 }),
      snap({ 10: 1, 20: 1 }),
      snap({ 10: 1, 20: 1 }),
      snap({ 10: 1, 20: 1 }),
    ];
    const r = aggregateShots(shots, 4, map);
    expect(r.joint[0]).toEqual({ bits: "11", count: 3 });
    // Ties keep deterministic insertion order: "00" seen before "01".
    expect(r.joint.slice(1).map((j) => j.bits)).toEqual(["00", "01"]);
    expect(r.joint.map((j) => j.count)).toEqual([3, 1, 1]);
  });

  it("caps the joint distribution at 6 outcomes", () => {
    const shots = Array.from({ length: 8 }, (_, i) =>
      snap({ 10: (i & 1) as 0 | 1, 20: ((i >> 1) & 1) as 0 | 1 }),
    );
    const r = aggregateShots(shots, 4, map);
    expect(r.joint.length).toBeLessThanOrEqual(6);
  });

  it("handles empty-measurements snapshots", () => {
    const r = aggregateShots([snap({}), snap({})], 4, map);
    expect(r.counts[0]).toEqual({ zero: 0, one: 0 });
    expect(r.counts[1]).toEqual({ zero: 0, one: 0 });
    // Joint rows still exist per shot (missing wires default to 0).
    expect(r.joint).toEqual([{ bits: "00", count: 2 }]);
  });

  it("ignores measurement entries whose op id is unknown", () => {
    const r = aggregateShots([snap({ 99: 1, 10: 1, 20: 0 })], 4, map);
    expect(r.counts[0]).toEqual({ zero: 0, one: 1 });
    expect(r.counts[1]).toEqual({ zero: 1, one: 0 });
  });

  it("omits joint rows when only one wire is measured", () => {
    const singleMap = opWireMap(ops.slice(0, 1), 4);
    const r = aggregateShots(
      [snap({ 10: 1 }), snap({ 10: 0 })],
      4,
      singleMap,
    );
    expect(r.wires).toEqual([0]);
    expect(r.joint).toEqual([]);
  });
});
