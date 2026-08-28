import { useMemo, useState } from "react";
import type { Circuit } from "../../api/types";
import { GATE_CONFIGS } from "../../constants/gates";
import type { GateType } from "../../types";
import {
  wireY,
  columnOccupancy,
  isOccupied,
} from "./gridGeometry";

/**
 * Op-centric editor state: the working document IS the persisted circuit
 * format (docs/api.md), so serialization is a field rename (column →
 * segment) and "unconnected gate" bugs are impossible by construction.
 *
 * All mutating actions are gesture-scoped: each completed gesture pushes
 * one entry onto the undo stack.
 */

export type PlacedOp = {
  id: number;
  type: GateType;
  segment: number;
  targets: number[];
  controls: number[];
  angle: number | null;
};

export type EditorDoc = {
  numBits: number;
  ops: PlacedOp[];
};

const UNDO_LIMIT = 100;

let idCounter = 0;
/** Collision-safe op ids (Date.now() can repeat within a millisecond). */
const nextId = () => Date.now() * 1000 + (idCounter = (idCounter + 1) % 1000);

export const emptyDoc = (): EditorDoc => ({ numBits: 4, ops: [] });

/** Default wire assignments for a newly placed gate dropped on `wire`.
 *  Multi-wire gates spread their extra connections to adjacent wires,
 *  clamped to the document's wire count. Mirrors simulator validation
 *  arity rules (CX: 1t/1c, CCX: 1t/2c, SWAP: 2t). */
export function defaultConnections(
  type: GateType,
  wire: number,
  numBits: number,
): { targets: number[]; controls: number[] } {
  const config = GATE_CONFIGS[type];
  const clamp = (w: number) => Math.max(0, Math.min(numBits - 1, w));
  const targets: number[] = [];
  const controls: number[] = [];

  if (config.category === "multi") {
    if (type === "SWAP") {
      targets.push(clamp(wire), clamp(wire + 1));
      if (targets[0] === targets[1]) {
        // Single-wire document: SWAP needs two distinct targets; place on
        // the other wire instead.
        targets[0] = clamp(wire - 1);
      }
    } else {
      targets.push(clamp(wire));
      const controlCount = config.controlCapacity; // CX/CZ/C: 1, CCX: 2
      for (let i = 0; i < controlCount; i++) {
        // Spread controls upward, falling back downward when out of range.
        controls.push(
          clamp(
            wire - 1 - i >= 0 ? wire - 1 - i : wire + 1 + (i === 0 ? 0 : 1),
          ),
        );
      }
      // Deduplicate while preserving order (tiny wire counts can collide).
      const seen = new Set<number>();
      const unique = (arr: number[]) =>
        arr.filter((w) => {
          if (seen.has(w) || targets.includes(w)) return false;
          seen.add(w);
          return true;
        });
      return { targets, controls: unique(controls) };
    }
    return { targets, controls };
  }

  // Single-qubit, parameterized, and measurement gates: one target.
  return { targets: [clamp(wire)], controls: [] };
}

/** Logical-px distance from a wire within which a drop snaps to that wire;
 *  drops farther away land "between" wires and span the bracketing pair. */
export const SPAN_TOLERANCE_PX = 10;

/** Wire pair bracketing a pointer dropped between wires, or null when the
 *  pointer sits on a wire (within SPAN_TOLERANCE_PX). Edge drops clamp to
 *  the outermost pair; a single-wire document has no pair (null). */
export function spanBracket(
  y: number,
  nearestWire: number,
  numBits: number,
): { above: number; below: number } | null {
  const dy = y - wireY(nearestWire);
  if (Math.abs(dy) <= SPAN_TOLERANCE_PX) return null;
  if (dy > 0) {
    const below = Math.min(nearestWire + 1, numBits - 1);
    if (below === nearestWire) {
      // Bottom edge: bracket the last pair.
      return nearestWire - 1 >= 0
        ? { above: nearestWire - 1, below: nearestWire }
        : null;
    }
    return { above: nearestWire, below };
  }
  const above = Math.max(nearestWire - 1, 0);
  if (above === nearestWire) {
    // Top edge: bracket the first pair.
    return nearestWire + 1 <= numBits - 1
      ? { above: nearestWire, below: nearestWire + 1 }
      : null;
  }
  return { above, below: nearestWire };
}

/** Connections for a multi-wire gate dropped BETWEEN two wires so the
 *  gate spans the cursor: CX/CZ/C target the lower wire with the upper as
 *  control; SWAP takes both; CCX targets the lower wire with controls
 *  hugging it from above and below (single-side fallback at the bottom
 *  edge). Collapsed pairs fall back to on-wire defaults. */
export function spannedConnections(
  type: GateType,
  aboveWire: number,
  belowWire: number,
  numBits: number,
): { targets: number[]; controls: number[] } {
  const clamp = (w: number) => Math.max(0, Math.min(numBits - 1, w));
  const above = clamp(aboveWire);
  const below = clamp(belowWire);
  if (above === below) return defaultConnections(type, below, numBits);

  if (type === "SWAP") return { targets: [above, below], controls: [] };

  if (type === "CCX") {
    if (below + 1 < numBits)
      return { targets: [below], controls: [above, below + 1] };
    // Bottom edge: hug the target from above (needs two wires above it).
    if (above - 1 >= 0) return { targets: [below], controls: [above, above - 1] };
    return defaultConnections(type, below, numBits);
  }

  if (GATE_CONFIGS[type].category === "multi") {
    return { targets: [below], controls: [above] };
  }
  // Single-wire types dropped between wires: snap to the lower wire.
  return { targets: [below], controls: [] };
}

/** Connections for a multi-wire gate dropped at logical pointer y: spans
 *  the bracketing wire pair when the drop is between wires; null when it
 *  is on a wire (use defaultConnections) or the gate is not multi-wire. */
export function spannedDropConnections(
  type: GateType,
  y: number,
  nearestWire: number,
  numBits: number,
): { targets: number[]; controls: number[] } | null {
  if (GATE_CONFIGS[type].category !== "multi") return null;
  const bracket = spanBracket(y, nearestWire, numBits);
  return bracket
    ? spannedConnections(type, bracket.above, bracket.below, numBits)
    : null;
}

/** Serialize the document to the wire format. Ops whose connections
 *  don't fit the current wire count are suspended — excluded until the
 *  wires grow back — never serialized in that state. */
export function isSuspended(op: PlacedOp, numBits: number): boolean {
  const config = GATE_CONFIGS[op.type];
  if (!config) return true;
  const wires = [...op.targets, ...op.controls];
  return (
    wires.some((w) => w >= numBits) ||
    op.targets.length !== config.targetCapacity ||
    op.controls.length !== config.controlCapacity
  );
}

export function docToCircuit(doc: EditorDoc): Circuit {
  return {
    numBits: doc.numBits,
    ops: doc.ops
      .filter((op) => !isSuspended(op, doc.numBits))
      .map((op) => ({ ...op })),
  };
}

/** Load a persisted circuit, dropping ops with unknown gate types (the
 *  simulator rejects those too). */
export function circuitToDoc(circuit: Circuit): EditorDoc {
  return {
    numBits: Math.min(16, Math.max(1, circuit.numBits)),
    ops: circuit.ops
      .filter((op) => op.type in GATE_CONFIGS)
      .map((op) => ({ ...op, type: op.type as GateType })),
  };
}

/** Wire coordinates used by glyph hit-testing: each entry in `wires` is
 *  (kind, wireIndex) where kind is 'target' | 'control'. */
export type WireSlot = { kind: "target" | "control"; index: number };

export function opWireSlots(op: PlacedOp): WireSlot[] {
  return [
    ...op.targets.map((index): WireSlot => ({ kind: "target", index })),
    ...op.controls.map((index): WireSlot => ({ kind: "control", index })),
  ];
}

export function useEditorState(initial: EditorDoc = emptyDoc()) {
  const [doc, setDoc] = useState<EditorDoc>(initial);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  // Multi-selection. Sets iterate in insertion order, so the last entry
  // is the most recently selected op — the one the Inspector edits.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const selectedOpId = useMemo(() => {
    let last: number | null = null;
    for (const id of selectedIds) last = id;
    return last;
  }, [selectedIds]);

  /** Commit the next document state as one undoable gesture. */
  const commit = (next: EditorDoc) => {
    setPast((prev) => [...prev.slice(-UNDO_LIMIT + 1), doc]);
    setFuture([]);
    setDoc(next);
  };

  const placeOp = (
    type: GateType,
    column: number,
    wire: number,
    connections?: { targets: number[]; controls: number[] },
  ) => {
    const { targets, controls } =
      connections ?? defaultConnections(type, wire, doc.numBits);
    const op: PlacedOp = {
      id: nextId(),
      type,
      segment: Math.max(0, Math.min(9, column)),
      targets,
      controls,
      angle: GATE_CONFIGS[type].defaultAngle ?? null,
    };
    commit({ ...doc, ops: [...doc.ops, op] });
    selectOnly(op.id);
  };

  const moveOp = (opId: number, column: number, wire?: number) => {
    const op = doc.ops.find((o) => o.id === opId);
    if (!op) return;
    const nextColumn = Math.max(0, Math.min(9, column));
    const nextWire =
      wire == null ? null : Math.max(0, Math.min(doc.numBits - 1, wire));
    if (nextColumn === op.segment && nextWire === null) return;
    if (
      nextWire != null &&
      op.targets.length === 1 &&
      op.targets[0] === nextWire &&
      nextColumn === op.segment
    )
      return;
    commit({
      ...doc,
      ops: doc.ops.map((o) => {
        if (o.id !== opId) return o;
        const patch: PlacedOp = { ...o, segment: nextColumn };
        // Single-bit ops: the body drag carries the target wire.
        if (nextWire != null && o.targets.length === 1) {
          patch.targets = [nextWire];
        }
        return patch;
      }),
    });
  };

  /** Body-drag a single-bit op to another wire (vertical drag). */
  const moveOpToWire = (opId: number, wire: number) => {
    const op = doc.ops.find((o) => o.id === opId);
    if (!op || op.targets.length !== 1) return;
    const clamped = Math.max(0, Math.min(doc.numBits - 1, wire));
    if (op.targets[0] === clamped) return;
    commit({
      ...doc,
      ops: doc.ops.map((o) =>
        o.id === opId ? { ...o, targets: [clamped] } : o,
      ),
    });
  };

  /** Move one connection (target or control) to a different wire. */
  const moveWire = (opId: number, slot: WireSlot, wire: number) => {
    const op = doc.ops.find((o) => o.id === opId);
    if (!op) return;
    const clamped = Math.max(0, Math.min(doc.numBits - 1, wire));
    const key = slot.kind === "target" ? "targets" : "controls";
    const list = op[key];
    if (list[slot.index] === clamped) return;

    const otherKey = slot.kind === "target" ? "controls" : "targets";
    if (op[otherKey].includes(clamped)) return; // a wire can host only one connection of an op

    const next: PlacedOp = {
      ...op,
      [key]: list.map((w, i) => (i === slot.index ? clamped : w)),
    };
    commit({ ...doc, ops: doc.ops.map((o) => (o.id === opId ? next : o)) });
  };

  const removeOp = (opId: number) => removeOps([opId]);

  /** Remove a group of ops as ONE undo gesture. */
  const removeOps = (ids: number[]) => {
    const idSet = new Set(ids);
    if (!doc.ops.some((o) => idSet.has(o.id))) return;
    commit({ ...doc, ops: doc.ops.filter((o) => !idSet.has(o.id)) });
    setSelectedIds((prev) => {
      if (![...prev].some((id) => idSet.has(id))) return prev;
      const next = new Set(prev);
      for (const id of idSet) next.delete(id);
      return next;
    });
  };

  /** Shift a group of ops by whole columns as ONE undo gesture. Clamped
   *  to the grid; sharing columns with other ops is allowed (paste-move
   *  semantics — no occupancy enforcement). */
  const moveOpsBy = (
    ids: number[] | Set<number>,
    deltaColumns: number,
  ) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (idSet.size === 0 || deltaColumns === 0) return;
    if (!doc.ops.some((o) => idSet.has(o.id))) return;
    commit({
      ...doc,
      ops: doc.ops.map((o) =>
        idSet.has(o.id)
          ? {
              ...o,
              segment: Math.max(
                0,
                Math.min(9, o.segment + deltaColumns),
              ),
            }
          : o,
      ),
    });
  };

  /** Paste copied ops as ONE undo gesture: ids regenerate, relative
   *  segment deltas are preserved, and the group lands at the earliest
   *  column window free of existing ops (shifting right past collisions;
   *  stacking only when the grid is too full — then clamped to the last
   *  columns). In-group column sharing stays as copied. */
  const pasteOps = (ops: PlacedOp[]) => {
    if (ops.length === 0) return;
    const occupancy = columnOccupancy(doc.ops);
    const minSeg = Math.min(...ops.map((o) => o.segment));
    const groupWidth = Math.max(...ops.map((o) => o.segment)) - minSeg;
    let start = -1;
    for (let s = 0; s + groupWidth <= 9; s++) {
      if (
        ops.every((o) => !isOccupied(occupancy, s + (o.segment - minSeg)))
      ) {
        start = s;
        break;
      }
    }
    if (start < 0) start = Math.max(0, 9 - groupWidth); // full grid: stack at the end
    const pasted = ops.map((o) => ({
      ...o,
      id: nextId(),
      segment: Math.max(0, Math.min(9, start + (o.segment - minSeg))),
    }));
    commit({ ...doc, ops: [...doc.ops, ...pasted] });
    setSelectedIds(new Set(pasted.map((o) => o.id)));
  };

  // --- Selection helpers -------------------------------------------------
  function selectOnly(id: number) {
    setSelectedIds(new Set([id]));
  }
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  /** Select exactly `ids` (page passes the active/visible ops). */
  function selectAll(ids: Iterable<number>) {
    setSelectedIds(new Set(ids));
  }
  const select = (id: number | null) =>
    id == null ? clearSelection() : selectOnly(id);

  const setAngle = (opId: number, angle: number) => {
    const op = doc.ops.find((o) => o.id === opId);
    if (!op || op.angle === angle) return;
    commit({
      ...doc,
      ops: doc.ops.map((o) => (o.id === opId ? { ...o, angle } : o)),
    });
  };

  /** Drag-scrubbing the dial produces many intermediate values; only the
   *  first value of a scrub should be undoable. */
  const [scrubBase, setScrubBase] = useState<EditorDoc | null>(null);
  const [scrubDirty, setScrubDirty] = useState(false);
  const beginAngleScrub = () => {
    setScrubBase(doc);
    setScrubDirty(false);
  };
  const updateAngleScrub = (opId: number, angle: number) => {
    setScrubDirty(true);
    setDoc((prev) => ({
      ...prev,
      ops: prev.ops.map((o) => (o.id === opId ? { ...o, angle } : o)),
    }));
  };
  const endAngleScrub = () => {
    const base = scrubBase;
    setScrubBase(null);
    if (base && scrubDirty) {
      setPast((prev) => [...prev.slice(-UNDO_LIMIT + 1), base]);
      setFuture([]);
    }
  };

  const setNumBits = (bits: number) => {
    const clamped = Math.max(1, Math.min(16, bits));
    if (clamped === doc.numBits) return;
    // Ops keep their wires; those that no longer fit become suspended
    // (hidden until the wire count grows back). Fully symmetric — no
    // truncation, so nothing is lost and undo/grow restores everything.
    commit({ ...doc, numBits: clamped });
    // Never keep a suspended op selected (its inspector would show stale
    // wire indices).
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const keep = new Set<number>();
      for (const id of prev) {
        const op = doc.ops.find((o) => o.id === id);
        if (op && !isSuspended(op, clamped)) keep.add(id);
      }
      return keep;
    });
  };

  const duplicateOp = (opId: number) => {
    const op = doc.ops.find((o) => o.id === opId);
    if (!op) return;
    // Find the first free column at or after the source op's column.
    let column = op.segment;
    while (column < 10 && doc.ops.some((o) => o.segment === column)) column++;
    const copy: PlacedOp = {
      ...op,
      id: nextId(),
      segment: Math.min(9, column),
    };
    commit({ ...doc, ops: [...doc.ops, copy] });
    selectOnly(copy.id);
  };

  const undo = () => {
    if (past.length === 0) return;
    setPast(past.slice(0, -1));
    setFuture([doc, ...future]);
    setDoc(past.at(-1)!);
  };

  const redo = () => {
    if (future.length === 0) return;
    setPast([...past, doc]);
    setDoc(future[0]);
    setFuture(future.slice(1));
  };

  const loadCircuit = (circuit: Circuit) => {
    setDoc(circuitToDoc(circuit));
    setPast([]);
    setFuture([]);
    clearSelection();
  };

  return {
    doc,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    selectedOpId,
    selectedIds,
    placeOp,
    moveOp,
    moveOpToWire,
    moveWire,
    removeOp,
    removeOps,
    moveOpsBy,
    pasteOps,
    duplicateOp,
    setAngle,
    beginAngleScrub,
    updateAngleScrub,
    endAngleScrub,
    setNumBits,
    undo,
    redo,
    loadCircuit,
    select,
    selectOnly,
    toggleSelect,
    clearSelection,
    selectAll,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
