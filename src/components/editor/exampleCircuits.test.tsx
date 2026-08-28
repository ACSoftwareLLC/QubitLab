import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { EXAMPLE_CIRCUITS } from "./exampleCircuits";
import { CircuitGrid } from "./CircuitGrid";
import { GATE_CONFIGS } from "../../constants/gates";
import type { GateType } from "../../types";
import type { Circuit } from "../../api/types";

afterEach(cleanup);

describe("EXAMPLE_CIRCUITS data", () => {
  it("exports the six starter circuits", () => {
    expect(EXAMPLE_CIRCUITS.map((e) => e.key)).toEqual([
      "bell",
      "ghz3",
      "coin-flips",
      "teleportation",
      "half-adder",
      "cuccaro-add1",
    ]);
  });

  for (const { key, title, blurb, circuit } of EXAMPLE_CIRCUITS) {
    it(`${key}: every op is structurally valid`, () => {
      expect(title).toBeTruthy();
      expect(blurb).toBeTruthy();
      expect(circuit.numBits).toBeGreaterThanOrEqual(1);
      expect(circuit.numBits).toBeLessThanOrEqual(16);

      const ids = new Set<number>();
      for (const op of circuit.ops) {
        // Unique ids.
        expect(ids.has(op.id)).toBe(false);
        ids.add(op.id);

        // Known gate type.
        expect(op.type in GATE_CONFIGS).toBe(true);

        // Segments within the 0..9 time columns.
        expect(op.segment).toBeGreaterThanOrEqual(0);
        expect(op.segment).toBeLessThanOrEqual(9);

        // All connections within the wire range.
        for (const w of [...op.targets, ...op.controls]) {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThan(circuit.numBits);
        }

        // Parameterized gates carry an angle; others have none.
        const config = GATE_CONFIGS[op.type as GateType];
        if (config.defaultAngle != null) {
          expect(op.angle).not.toBeNull();
        } else {
          expect(op.angle).toBeNull();
        }
      }
    });
  }

  it("bell: H on q0 then CX controlled by q0 targeting q1", () => {
    const bell = EXAMPLE_CIRCUITS[0].circuit;
    expect(bell.numBits).toBe(2);
    expect(bell.ops[0]).toMatchObject({ type: "H", segment: 0, targets: [0] });
    expect(bell.ops[1]).toMatchObject({
      type: "CX",
      segment: 1,
      targets: [1],
      controls: [0],
    });
  });

  it("teleportation: segments run 0..5 with two measurements at the end", () => {
    const tp = EXAMPLE_CIRCUITS[3].circuit;
    expect(tp.ops.map((o) => o.segment)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(tp.ops[4]).toMatchObject({ type: "M", targets: [0] });
    expect(tp.ops[5]).toMatchObject({ type: "M", targets: [1] });
  });
});

describe("CircuitGrid empty-state examples", () => {
  const renderGrid = (onLoadExample: (circuit: Circuit) => void) =>
    render(
      <CircuitGrid
        doc={{ numBits: 3, ops: [] }}
        selectedIds={new Set()}
        ghost={null}
        armedType={null}
        movePreview={null}
        slotPreview={null}
        executing={false}
        currentSegment={-1}
        measurements={{}}
        wireProbabilities={null}
        onSelect={vi.fn()}
        onCellClick={vi.fn()}
        onPeekSegment={vi.fn()}
        onPeekEnd={vi.fn()}
        onOpPartPointerDown={vi.fn()}
        onLoadExample={onLoadExample}
        registerHandle={vi.fn()}
      />,
    );

  it("renders one chip per example", () => {
    const { container } = renderGrid(vi.fn());
    const chips = container.querySelectorAll(".ev2-example-chip");
    expect(chips.length).toBe(EXAMPLE_CIRCUITS.length);
    for (const chip of chips) {
      expect(chip.querySelector("i")!.className).toContain("bi-diagram-3");
      expect(chip.textContent).toBeTruthy();
    }
  });

  it("clicking a chip fires onLoadExample with that circuit", () => {
    const onLoadExample = vi.fn();
    const { container } = renderGrid(onLoadExample);
    const chips =
      container.querySelectorAll<HTMLButtonElement>(".ev2-example-chip");
    fireEvent.click(chips[1]);
    expect(onLoadExample).toHaveBeenCalledTimes(1);
    expect(onLoadExample).toHaveBeenCalledWith(EXAMPLE_CIRCUITS[1].circuit);
  });

  it("hides the example row once ops exist", () => {
    const { container } = render(
      <CircuitGrid
        doc={{
          numBits: 3,
          ops: [
            {
              id: 1,
              type: "H",
              segment: 0,
              targets: [0],
              controls: [],
              angle: null,
            },
          ],
        }}
        selectedIds={new Set()}
        ghost={null}
        armedType={null}
        movePreview={null}
        slotPreview={null}
        executing={false}
        currentSegment={-1}
        measurements={{}}
        wireProbabilities={null}
        onSelect={vi.fn()}
        onCellClick={vi.fn()}
        onPeekSegment={vi.fn()}
        onPeekEnd={vi.fn()}
        onOpPartPointerDown={vi.fn()}
        registerHandle={vi.fn()}
      />,
    );
    expect(container.querySelector(".ev2-empty-hint")).toBeNull();
    expect(container.querySelector(".ev2-example-chip")).toBeNull();
  });
});
