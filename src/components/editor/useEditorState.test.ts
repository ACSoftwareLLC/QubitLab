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
import {
  opIntersectsMarquee,
  wireY,
  colX,
} from "./gridGeometry";
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

describe("useEditorState multi-selection", () => {
  it("removeOps deletes a group as ONE undo gesture", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 0, 0));
    act(() => result.current.placeOp("X", 1, 1));
    act(() => result.current.placeOp("Y", 2, 2));
    const ids = result.current.doc.ops.slice(0, 2).map((o) => o.id);
    act(() => result.current.selectAll(ids));
    act(() => result.current.removeOps(ids));
    expect(result.current.doc.ops).toHaveLength(1);
    expect(result.current.selectedIds.size).toBe(0);
    // One undo restores both removed ops.
    act(() => result.current.undo());
    expect(result.current.doc.ops).toHaveLength(3);
  });

  it("pasteOps regenerates ids, preserves relative segments, selects pasted", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 0, 0));
    act(() => result.current.placeOp("CX", 2, 1));
    const originals = result.current.doc.ops;
    const copied = originals.map((o) => ({ ...o }));
    act(() => result.current.pasteOps(copied));
    // Pasted at the earliest collision-free window: originals occupy cols
    // 0 and 2, so the group (relative span 0→2) shifts right by one and
    // lands at cols 1 and 3 — the earliest start with both slots free.
    expect(result.current.doc.ops).toHaveLength(4);
    const pasted = result.current.doc.ops.slice(2);
    expect(pasted.map((o) => o.segment)).toEqual([1, 3]);
    // New ids, none shared with the originals.
    const originalIds = new Set(originals.map((o) => o.id));
    expect(pasted.every((o) => !originalIds.has(o.id))).toBe(true);
    // Selection is exactly the pasted group.
    expect([...result.current.selectedIds]).toEqual(pasted.map((o) => o.id));
    // One undo removes both pasted ops.
    act(() => result.current.undo());
    expect(result.current.doc.ops).toHaveLength(2);
  });

  it("pasteOps shifts right past column collisions (dynamic columns)", () => {
    const { result } = renderHook(() => useEditorState());
    // Fill the first 10 columns with H gates.
    for (let c = 0; c < 10; c++) {
      act(() => result.current.placeOp("H", c, c % 4));
    }
    const copied = result.current.doc.ops
      .filter((o) => o.segment < 2)
      .map((o) => ({ ...o }));
    act(() => result.current.pasteOps(copied));
    // Columns are dynamic: the paste lands in the first free window —
    // columns 10 and 11 (the grid grows instead of clamping).
    const pasted = result.current.doc.ops.slice(10);
    expect(pasted).toHaveLength(2);
    expect(pasted.map((o) => o.segment)).toEqual([10, 11]);
  });

  it("moveOpsBy clamps to the column ceiling", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 1021, 0));
    act(() => result.current.placeOp("X", 1022, 1));
    const ids = result.current.doc.ops.map((o) => o.id);
    act(() => result.current.moveOpsBy(ids, 5));
    expect(result.current.doc.ops.map((o) => o.segment)).toEqual([1023, 1023]);
    act(() => result.current.moveOpsBy(ids, -100));
    expect(result.current.doc.ops.map((o) => o.segment)).toEqual([923, 923]);
    // One gesture each way.
    act(() => result.current.undo());
    expect(result.current.doc.ops.map((o) => o.segment)).toEqual([1023, 1023]);
  });

  it("toggleSelect builds and shrinks a selection; selectedOpId is last-selected", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 0, 0));
    act(() => result.current.placeOp("X", 1, 1));
    act(() => result.current.placeOp("Y", 2, 2));
    const [a, b, c] = result.current.doc.ops;
    act(() => result.current.selectOnly(a.id));
    act(() => result.current.toggleSelect(b.id));
    act(() => result.current.toggleSelect(c.id));
    expect([...result.current.selectedIds]).toEqual([a.id, b.id, c.id]);
    expect(result.current.selectedOpId).toBe(c.id); // last-selected
    act(() => result.current.toggleSelect(a.id));
    expect([...result.current.selectedIds]).toEqual([b.id, c.id]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectedOpId).toBeNull();
  });

  it("selectAll + removeOps clears the document in one gesture", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 0, 0));
    act(() => result.current.placeOp("CX", 1, 2));
    const ids = result.current.doc.ops.map((o) => o.id);
    act(() => result.current.selectAll(ids));
    act(() => result.current.removeOps(ids));
    expect(result.current.doc.ops).toHaveLength(0);
    act(() => result.current.undo());
    expect(result.current.doc.ops).toHaveLength(2);
  });

  it("single-op actions still work within the set model", () => {
    const { result } = renderHook(() => useEditorState());
    act(() => result.current.placeOp("H", 3, 1));
    const id = result.current.doc.ops[0].id;
    expect(result.current.selectedOpId).toBe(id);
    act(() => result.current.select(id)); // select() on an id selects only it
    expect([...result.current.selectedIds]).toEqual([id]);
    act(() => result.current.removeOp(id));
    expect(result.current.doc.ops).toHaveLength(0);
    expect(result.current.selectedIds.size).toBe(0);
  });
});

describe("opIntersectsMarquee", () => {
  // GRID: gutterW 46, colW 56, rulerH 26, padTop 8, wireSpacing 38.
  // colX(0)=46, colX(1)=102; wireY(0)=34, wireY(1)=72, wireY(2)=110.
  it("selects a single-wire op whose column the rect crosses", () => {
    const op = { segment: 1, targets: [1], controls: [] };
    const rect = { x1: 100, y1: 40, x2: 160, y2: 90 };
    expect(opIntersectsMarquee(op, rect)).toBe(true);
  });

  it("misses an op in a different column", () => {
    const op = { segment: 1, targets: [1], controls: [] };
    const rect = { x1: 46, y1: 0, x2: 100, y2: 200 }; // column 0 only
    expect(opIntersectsMarquee(op, rect)).toBe(false);
  });

  it("misses an op on a non-spanned wire", () => {
    const op = { segment: 1, targets: [2], controls: [] }; // wireY 110
    const rect = { x1: 100, y1: 30, x2: 200, y2: 80 }; // wires 0-1 span only
    expect(opIntersectsMarquee(op, rect)).toBe(false);
  });

  it("selects multi-wire ops whose span the rect partially crosses", () => {
    const cx = { segment: 2, targets: [2], controls: [0] }; // wires 0→2
    const rect = { x1: 150, y1: 100, x2: 220, y2: 140 }; // touches wire 2 only
    expect(opIntersectsMarquee(cx, rect)).toBe(true);
  });

  it("treats reversed corner order identically", () => {
    const op = { segment: 1, targets: [1], controls: [] };
    expect(
      opIntersectsMarquee(op, { x1: 160, y1: 90, x2: 100, y2: 40 }),
    ).toBe(true);
  });

  it("op footprint is the full column width", () => {
    const op = { segment: 1, targets: [0], controls: [] };
    // Rect covers only the left half of column 1's cell.
    const rect = {
      x1: colX(1) + 1,
      y1: 0,
      x2: colX(1) + 10,
      y2: 100,
    };
    expect(opIntersectsMarquee(op, rect)).toBe(true);
  });

  it("an empty-wire op defaults to wire 0 for the hit test", () => {
    const op = { segment: 0, targets: [], controls: [] };
    const rect = { x1: 0, y1: wireY(0) - 10, x2: 100, y2: wireY(0) + 10 };
    expect(opIntersectsMarquee(op, rect)).toBe(true);
  });
});
