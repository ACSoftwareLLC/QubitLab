import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useEditorState,
  defaultConnections,
  docToCircuit,
  circuitToDoc,
  spannedConnections,
  spannedDropConnections,
  spanBracket,
  SPAN_TOLERANCE_PX,
} from "./useEditorState";
import type { Circuit } from "../../api/types";

describe("defaultConnections", () => {
  it("assigns a single target for single-qubit gates", () => {
    expect(defaultConnections("H", 2, 4)).toEqual({
      targets: [2],
      controls: [],
    });
  });
  it("spreads CX control to the wire above", () => {
    expect(defaultConnections("CX", 2, 4)).toEqual({
      targets: [2],
      controls: [1],
    });
  });
  it("falls back downward at the top edge", () => {
    expect(defaultConnections("CX", 0, 4)).toEqual({
      targets: [0],
      controls: [1],
    });
  });
  it("handles CCX", () => {
    expect(defaultConnections("CCX", 3, 4)).toEqual({
      targets: [3],
      controls: [2, 1],
    });
  });
  it("handles SWAP", () => {
    expect(defaultConnections("SWAP", 1, 4)).toEqual({
      targets: [1, 2],
      controls: [],
    });
  });
  it("handles SWAP at bottom edge", () => {
    expect(defaultConnections("SWAP", 3, 4)).toEqual({
      targets: [2, 3],
      controls: [],
    });
  });
});

describe("spannedConnections", () => {
  it("CX between wires targets the lower wire with the upper as control", () => {
    expect(spannedConnections("CX", 1, 2, 4)).toEqual({
      targets: [2],
      controls: [1],
    });
  });

  it("SWAP between wires takes both bracketing wires", () => {
    expect(spannedConnections("SWAP", 0, 1, 4)).toEqual({
      targets: [0, 1],
      controls: [],
    });
  });

  it("CCX hugs the target from above and below", () => {
    expect(spannedConnections("CCX", 1, 2, 4)).toEqual({
      targets: [2],
      controls: [1, 3],
    });
  });

  it("CCX at the bottom edge falls back to two controls above", () => {
    // Target q2 is the last wire; below it is out of range.
    expect(spannedConnections("CCX", 1, 2, 3)).toEqual({
      targets: [2],
      controls: [1, 0],
    });
  });

  it("CCX in a 2-wire document falls back to on-wire defaults", () => {
    // No room for target + 2 distinct controls.
    expect(spannedConnections("CCX", 0, 1, 2)).toEqual(
      defaultConnections("CCX", 1, 2),
    );
  });

  it("clamps out-of-range wires to the document bounds", () => {
    expect(spannedConnections("CX", -2, 7, 4)).toEqual({
      targets: [3],
      controls: [0],
    });
  });

  it("single-wire types dropped between wires snap to the lower wire", () => {
    expect(spannedConnections("H", 1, 2, 4)).toEqual({
      targets: [2],
      controls: [],
    });
  });

  it("collapsed pair falls back to on-wire defaults", () => {
    expect(spannedConnections("CX", 2, 2, 4)).toEqual(
      defaultConnections("CX", 2, 4),
    );
  });
});

describe("spannedDropConnections", () => {
  // wireY(1) = 26 + 8 + 38 = 72 logical px (GRID constants).
  const ON_WIRE_Y = 72;

  it("returns null when the pointer is on a wire (within tolerance)", () => {
    expect(
      spannedDropConnections(
        "CX",
        ON_WIRE_Y + SPAN_TOLERANCE_PX,
        1,
        4,
      ),
    ).toBeNull();
    expect(spannedDropConnections("CX", ON_WIRE_Y, 1, 4)).toBeNull();
  });

  it("spans when the pointer is below the wire beyond tolerance", () => {
    expect(
      spannedDropConnections("CX", ON_WIRE_Y + SPAN_TOLERANCE_PX + 1, 1, 4),
    ).toEqual({ targets: [2], controls: [1] });
  });

  it("spans when the pointer is above the wire beyond tolerance", () => {
    expect(
      spannedDropConnections("CX", ON_WIRE_Y - SPAN_TOLERANCE_PX - 1, 1, 4),
    ).toEqual({ targets: [1], controls: [0] });
  });

  it("returns null for single-wire gate types", () => {
    expect(spannedDropConnections("H", ON_WIRE_Y + 20, 1, 4)).toBeNull();
  });

  it("bottom-edge drops beyond the last wire clamp to the last pair", () => {
    // Pointer below wire 3 (the last of 4): bracket {2, 3}.
    const y = 26 + 8 + 3 * 38 + 15; // wireY(3) + 15
    expect(spanBracket(y, 3, 4)).toEqual({ above: 2, below: 3 });
    expect(spannedDropConnections("CX", y, 3, 4)).toEqual({
      targets: [3],
      controls: [2],
    });
  });

  it("top-edge drops above the first wire clamp to the first pair", () => {
    const y = 26 + 8 - 15; // above wire 0
    expect(spanBracket(y, 0, 4)).toEqual({ above: 0, below: 1 });
  });

  it("single-wire document never spans", () => {
    expect(spanBracket(72, 0, 1)).toBeNull();
  });
});

describe("useEditorState", () => {
  it("places ops and undoes them", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 2, 1));
    expect(result.current.doc.ops).toHaveLength(1);
    act(() => result.current.undo());
    expect(result.current.doc.ops).toHaveLength(0);
    act(() => result.current.redo());
    expect(result.current.doc.ops).toHaveLength(1);
  });

  it("round-trips a circuit through the editor doc", () => {
    const circuit: Circuit = {
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
        {
          id: 2,
          type: "CX",
          segment: 1,
          targets: [1],
          controls: [0],
          angle: null,
        },
        {
          id: 3,
          type: "Rx",
          segment: 2,
          targets: [2],
          controls: [],
          angle: 1.5,
        },
        {
          id: 99,
          type: "BOGUS",
          segment: 3,
          targets: [0],
          controls: [],
          angle: null,
        },
      ],
    };
    const doc = circuitToDoc(circuit);
    expect(doc.ops).toHaveLength(3);
    expect(docToCircuit(doc)).toEqual({
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
        {
          id: 2,
          type: "CX",
          segment: 1,
          targets: [1],
          controls: [0],
          angle: null,
        },
        {
          id: 3,
          type: "Rx",
          segment: 2,
          targets: [2],
          controls: [],
          angle: 1.5,
        },
      ],
    });
  });

  it("moves a wire connection with undo", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("CX", 1, 2));
    act(() =>
      result.current.moveWire(
        result.current.doc.ops[0].id,
        { kind: "target", index: 0 },
        3,
      ),
    );
    expect(result.current.doc.ops[0].targets).toEqual([3]);
    act(() => result.current.undo());
    expect(result.current.doc.ops[0].targets).toEqual([2]);
  });

  it("refuses moving a wire onto an occupied slot of the same op", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("CX", 1, 2)); // target 2, control 1
    act(() =>
      result.current.moveWire(
        result.current.doc.ops[0].id,
        { kind: "target", index: 0 },
        1,
      ),
    );
    expect(result.current.doc.ops[0].targets).toEqual([2]); // unchanged
  });

  it("suspends ops that lose wires when numBits shrinks, restores on grow", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 0, 3)); // target wire 3, 4 wires
    act(() => result.current.setNumBits(2));
    // The op stays in the document but is suspended: hidden and not
    // serialized (glyph AND dots all gone together).
    expect(result.current.doc.ops).toHaveLength(1);
    expect(docToCircuit(result.current.doc).ops).toHaveLength(0);
    // Growing the wire count back restores it — fully symmetric.
    act(() => result.current.setNumBits(4));
    expect(docToCircuit(result.current.doc).ops).toHaveLength(1);
    // Undo walks back through the shrink/grow states.
    act(() => result.current.undo());
    expect(result.current.doc.numBits).toBe(2);
    expect(docToCircuit(result.current.doc).ops).toHaveLength(0);
    act(() => result.current.undo());
    expect(result.current.doc.numBits).toBe(4);
    expect(docToCircuit(result.current.doc).ops).toHaveLength(1);
  });
});
