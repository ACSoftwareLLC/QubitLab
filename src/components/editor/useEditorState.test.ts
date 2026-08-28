import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useEditorState,
  defaultConnections,
  docToCircuit,
  circuitToDoc,
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
