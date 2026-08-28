import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { GateType } from "../types";
import { useSimulation } from "../hooks/useSimulation";
import { useFitScale } from "../hooks/useFitScale";
import { useEditorActions } from "../context/EditorActionsContext";
import { StatePanel } from "../components/StatePanel";
import { simulateCircuit } from "../api/client";
import type { Circuit, Snapshot, ValidationError } from "../api/types";
import { consumeTemplatePrefetch } from "./templatePrefetch";
import { CircuitGrid } from "../components/editor/CircuitGrid";
import type { GridHandle } from "../components/editor/CircuitGrid";
import type { OpPart } from "../components/editor/OpGlyph";
import { Toolbox } from "../components/editor/Toolbox";
import { Inspector } from "../components/editor/Inspector";
import { TransportBar } from "../components/editor/TransportBar";
import { ShotsPanel } from "../components/editor/ShotsPanel";
import {
  docToCircuit,
  useEditorState,
  spannedDropConnections,
} from "../components/editor/useEditorState";
import {
  readDraft,
  shouldRestoreDraft,
  useCircuitDraft,
} from "../components/editor/useCircuitDraft";
import { wireProbabilitiesFromStatevector } from "../components/editor/stateVectorMath";
import type { WireSlot } from "../components/editor/useEditorState";
import {
  gridSize,
  columnOccupancy,
  isOccupied,
  firstFreeColumn,
} from "../components/editor/gridGeometry";
import { isSuspended } from "../components/editor/useEditorState";
import {
  buildShareUrl,
  decodeHashToCircuit,
} from "../components/editor/shareUrl";
import "../components/editor/editor.css";

/**
 * Prototype page for the v2 wires-based circuit editor. Lives at /editor-v2
 * alongside the legacy editor until the cutover decision.
 *
 * All pointer drags (palette → place, op body → move, handle → rewire) are
 * window-level, with a 4px movement threshold so plain clicks still arm /
 * select. Runs a captureSvgThumbnail clone of the legacy page's helper.
 */

const DRAG_THRESHOLD_PX = 4;

type PendingDrag =
  | { kind: "place"; type: GateType; startX: number; startY: number }
  | { kind: "moveOp"; opId: number; startX: number; startY: number }
  | {
      kind: "slot";
      opId: number;
      slot: WireSlot;
      startX: number;
      startY: number;
    };

type ActiveDrag =
  | { kind: "place"; type: GateType }
  | { kind: "moveOp"; opId: number }
  | { kind: "slot"; opId: number; slot: WireSlot };

async function captureSvgThumbnail(
  svg: SVGSVGElement | null,
  scale = 0.35,
): Promise<string | undefined> {
  if (!svg) return undefined;
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    return undefined;
  }
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

export function EditorV2Page() {
  const { registerActions } = useEditorActions();
  const location = useLocation();
  const editor = useEditorState();
  const { doc, selectedOpId } = editor;

  const gridHandleRef = useRef<GridHandle | null>(null);
  const gridElRef = useRef<HTMLDivElement | null>(null);

  const logicalSize = useMemo(() => gridSize(doc.numBits), [doc.numBits]);
  const { ref: fitRef, fitScale } = useFitScale(logicalSize);

  const circuit = useMemo(() => docToCircuit(doc), [doc]);
  const sim = useSimulation(circuit);

  // --- Live auto-simulation (opt-in) --------------------------------------
  // Final statevector recomputes automatically as the user edits — no
  // Start press. Manual Start/Step/Run are disabled while on; toggling off
  // clears the live state and restores the manual transport flow.
  const [liveAuto, setLiveAuto] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<Snapshot | null>(null);
  const [liveErrors, setLiveErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    if (!liveAuto) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      simulateCircuit(circuit, null)
        .then((raw) => {
          if (cancelled) return;
          // The wasm wrapper returns {valid:false, errors} cast to Snapshot
          // when the circuit is invalid — detect it before use.
          const result = raw as Snapshot & {
            valid?: false;
            errors?: ValidationError[];
          };
          if (result.valid === false && result.errors) {
            setLiveErrors(result.errors);
            setLiveSnapshot(null);
          } else {
            setLiveErrors([]);
            setLiveSnapshot(result);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setLiveErrors([
            { opId: null, message: "Simulation engine failed to load." },
          ]);
          setLiveSnapshot(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveAuto, circuit]);

  const toggleLive = () => {
    const next = !liveAuto;
    setLiveAuto(next);
    if (!next) {
      setLiveSnapshot(null);
      setLiveErrors([]);
    }
  };

  // Ops hidden while their wires don't fit (wire-count shrink); they return
  // when the count grows back. All interaction works on the visible set.
  const activeOps = useMemo(
    () => doc.ops.filter((o) => !isSuspended(o, doc.numBits)),
    [doc],
  );
  const activeColumns = useMemo(
    () => [...new Set(activeOps.map((o) => o.segment))],
    [activeOps],
  );
  // Per-wire P(1) readouts derive from whichever snapshot the StatePanel
  // displays (a peek overrides the stepped snapshot while hovering).
  const displayedSnapshot = liveAuto
    ? (sim.peekSnapshot ?? liveSnapshot)
    : (sim.peekSnapshot ?? sim.snapshot);
  const wireProbabilities = useMemo(
    () =>
      displayedSnapshot
        ? wireProbabilitiesFromStatevector(
            displayedSnapshot.statevector,
            doc.numBits,
          )
        : null,
    [displayedSnapshot, doc.numBits],
  );

  // --- Drag state ---------------------------------------------------------
  const [pending, setPending] = useState<PendingDrag | null>(null);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const [ghost, setGhost] = useState<{
    type: GateType;
    column: number;
    wire: number;
    invalid: boolean;
    connections: { targets: number[]; controls: number[] } | null;
  } | null>(null);
  const [movePreview, setMovePreview] = useState<{
    opId: number;
    column: number;
    wire?: number;
  } | null>(null);
  const [slotPreview, setSlotPreview] = useState<{
    opId: number;
    slot: WireSlot;
    wire: number;
  } | null>(null);
  const [armedType, setArmedType] = useState<GateType | null>(null);
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(
    null,
  );
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [sharedLoaded, setSharedLoaded] = useState(false);
  /** Op being dragged with the pointer outside the grid — releasing
   *  deletes it; the glyph renders in the danger style meanwhile. */
  const [dangerOpId, setDangerOpId] = useState<number | null>(null);

  const registerHandle = useCallback((handle: GridHandle | null) => {
    gridHandleRef.current = handle;
  }, []);

  const cellAt = (clientX: number, clientY: number) =>
    gridHandleRef.current?.clientToCell(clientX, clientY) ?? null;

  // --- Window-level pointer routing ----------------------------------------
  useEffect(() => {
    if (!pending && !drag) return;

    const onMove = (e: PointerEvent) => {
      if (pending) {
        const dist = Math.hypot(
          e.clientX - pending.startX,
          e.clientY - pending.startY,
        );
        if (dist < DRAG_THRESHOLD_PX) return;
        const active: ActiveDrag =
          pending.kind === "place"
            ? { kind: "place", type: pending.type }
            : pending.kind === "moveOp"
              ? { kind: "moveOp", opId: pending.opId }
              : { kind: "slot", opId: pending.opId, slot: pending.slot };
        setPending(null);
        setDrag(active);
        return;
      }
      if (!drag) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (drag.kind === "place") {
        if (!cell) return;
        const occupied = isOccupied(columnOccupancy(activeOps), cell.column);
        const connections = spannedDropConnections(
          drag.type,
          cell.y,
          cell.wire,
          doc.numBits,
        );
        setGhost({
          type: drag.type,
          column: cell.column,
          wire: cell.wire,
          invalid: occupied,
          connections,
        });
      } else if (drag.kind === "moveOp") {
        if (!cell) {
          // Off-grid: preview the delete-on-release cue.
          setDangerOpId(drag.opId);
          return;
        }
        setDangerOpId(null);
        // Single-bit ops drag in 2-D: the hovered wire re-targets them.
        const dragged = activeOps.find((o) => o.id === drag.opId);
        const wire =
          dragged && dragged.targets.length + dragged.controls.length === 1
            ? cell.wire
            : undefined;
        setMovePreview({ opId: drag.opId, column: cell.column, wire });
      } else {
        if (!cell) return;
        setSlotPreview({ opId: drag.opId, slot: drag.slot, wire: cell.wire });
      }
    };

    const finish = (e: PointerEvent) => {
      const cell = cellAt(e.clientX, e.clientY);
      if (drag) {
        if (drag.kind === "place" && cell) {
          const column = firstFreeColumn(
            columnOccupancy(activeOps),
            cell.column,
          );
          const connections = spannedDropConnections(
            drag.type,
            cell.y,
            cell.wire,
            doc.numBits,
          );
          editor.placeOp(
            drag.type,
            column,
            cell.wire,
            connections ?? undefined,
          );
        } else if (drag.kind === "moveOp") {
          if (!cell) {
            // Released off-grid: delete (undoable, no confirmation).
            editor.removeOp(drag.opId);
          } else {
            const occupancy = columnOccupancy(activeOps);
            const column = isOccupied(occupancy, cell.column, drag.opId)
              ? firstFreeColumn(occupancy, cell.column, drag.opId)
              : cell.column;
            const dragged = activeOps.find((o) => o.id === drag.opId);
            const wire =
              dragged && dragged.targets.length + dragged.controls.length === 1
                ? cell.wire
                : undefined;
            editor.moveOp(drag.opId, column, wire);
          }
        } else if (drag.kind === "slot" && cell) {
          editor.moveWire(drag.opId, drag.slot, cell.wire);
        }
      }
      setPending(null);
      setDrag(null);
      setGhost(null);
      setMovePreview(null);
      setSlotPreview(null);
      setDangerOpId(null);
    };

    const onCancel = () => {
      setPending(null);
      setDrag(null);
      setGhost(null);
      setMovePreview(null);
      setSlotPreview(null);
      setDangerOpId(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", onCancel);
    };
    // editor actions are stable-ish but activeOps matters for occupancy checks
  }, [pending, drag, doc.numBits, activeOps, editor]);

  // --- Palette callbacks ----------------------------------------------------
  const onItemPointerDown = (e: React.PointerEvent, type: GateType) => {
    if (e.button !== 0) return;
    setPending({ kind: "place", type, startX: e.clientX, startY: e.clientY });
  };

  // --- Grid callbacks -------------------------------------------------------
  /** Unified per-part routing from OpGlyph: the box/connector starts an op
   *  move; a control dot / ⊕ / ✕ starts that connection's re-wire drag. */
  const onOpPartPointerDown = (
    e: React.PointerEvent,
    opId: number,
    part: OpPart,
  ) => {
    if (e.button !== 0) return;
    // Any part press selects the op (this is the authoritative selection
    // path — the glyph's stopPropagation blocks bubbling to the grid).
    editor.select(opId);
    if (part.part === "body") {
      setPending({
        kind: "moveOp",
        opId,
        startX: e.clientX,
        startY: e.clientY,
      });
      return;
    }
    setPending({
      kind: "slot",
      opId,
      slot: part.slot,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  const onCellClick = (column: number, wire: number) => {
    if (armedType) {
      const free = firstFreeColumn(columnOccupancy(activeOps), column);
      editor.placeOp(armedType, free, wire);
    } else {
      editor.select(null);
    }
  };

  /** Empty-state example loader: hands the starter circuit to the editor. */
  const loadExample = (circuit: Circuit) => editor.loadCircuit(circuit);

  // --- Keyboard shortcuts -----------------------------------------------------
  const selectedOp = activeOps.find((o) => o.id === selectedOpId) ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        if (drag || pending) {
          setPending(null);
          setDrag(null);
          setGhost(null);
          setMovePreview(null);
          setSlotPreview(null);
        } else if (armedType) {
          setArmedType(null);
        } else {
          editor.select(null);
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedOp) {
        e.preventDefault();
        editor.duplicateOp(selectedOp.id);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedOp) {
        e.preventDefault();
        editor.removeOp(selectedOp.id);
        return;
      }
      if (selectedOp && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const occupancy = columnOccupancy(activeOps);
        let next = selectedOp.segment + delta;
        while (
          next >= 0 &&
          next <= 9 &&
          isOccupied(occupancy, next, selectedOp.id)
        )
          next += delta;
        if (next >= 0 && next <= 9) editor.moveOp(selectedOp.id, next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, selectedOp, activeOps, drag, pending, armedType]);

  // --- Save-button bridge -------------------------------------------------------
  // Saving also clears any restored draft so it stops reappearing on
  // refresh.
  const { clear: clearDraft } = useCircuitDraft(doc);
  useEffect(() => {
    registerActions({
      serialize: () => {
        clearDraft();
        return { circuit: docToCircuit(doc), unconnectedGateIds: [] };
      },
      captureThumbnail: () =>
        captureSvgThumbnail(gridElRef.current?.querySelector("svg") ?? null),
    });
    return () => registerActions(null);
  }, [registerActions, doc, clearDraft]);

  // --- Circuit handoff (My Circuits / template gallery) --------------------------
  // Priority: URL hash (explicit external intent) > template prefetch >
  // navigation-state handoff > saved draft. The hash is consumed once on
  // mount then stripped via replaceState so a refresh doesn't keep
  // overriding the draft chain.
  useEffect(() => {
    const hashCircuit = (() => {
      const hash = window.location.hash;
      if (!hash.startsWith("#c=")) return null;
      const decoded = decodeHashToCircuit(hash.slice(3));
      // Consume the hash either way — a malformed link must not loop.
      window.history.replaceState({}, "", "/editor-v2");
      return decoded;
    })();
    const handed = location.state as { circuit?: Circuit } | null;
    const prefetched = consumeTemplatePrefetch();
    // Captured before branching so shouldRestoreDraft sees unnarrowed
    // values (the branch tests themselves narrow `prefetched`).
    const handoffCircuit: Circuit | null = handed?.circuit ?? null;
    const prefetchCircuit: Circuit | null = prefetched?.circuit ?? null;
    if (hashCircuit) {
      sim.reset();
      editor.loadCircuit(hashCircuit);
      setSharedLoaded(true);
    } else if (prefetched) {
      sim.reset();
      editor.loadCircuit(prefetched.circuit);
      setLoadedTemplateName(prefetched.title);
    } else if (handoffCircuit) {
      sim.reset();
      editor.loadCircuit(handoffCircuit);
      window.history.replaceState({}, "");
    } else {
      const draft = readDraft();
      if (draft && shouldRestoreDraft(handoffCircuit, prefetchCircuit)) {
        editor.loadCircuit(draft.circuit);
        setRestoredDraft(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const ghostForGrid =
    drag?.kind === "place" && ghost
      ? {
          type: ghost.type,
          column: firstFreeColumn(columnOccupancy(activeOps), ghost.column),
          wire: ghost.wire,
          invalid: ghost.invalid,
          connections: ghost.connections,
        }
      : null;

  return (
    <div className="ev2-root">
      {loadedTemplateName && (
        <div className="ev2-banner">
          <span>
            Loaded template <b>{loadedTemplateName}</b> — edits are yours until
            you save.
          </span>
          <button
            onClick={() => setLoadedTemplateName(null)}
            aria-label="Dismiss"
          >
            <i className="bi bi-x" />
          </button>
        </div>
      )}
      {sharedLoaded && !loadedTemplateName && !restoredDraft && (
        <div className="ev2-banner">
          <span>Loaded shared circuit</span>
          <button onClick={() => setSharedLoaded(false)} aria-label="Dismiss">
            <i className="bi bi-x" />
          </button>
        </div>
      )}
      {restoredDraft && !loadedTemplateName && (
        <div className="ev2-banner">
          <span>Restored unsaved draft</span>
          <button
            onClick={() => setRestoredDraft(false)}
            aria-label="Dismiss"
          >
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      <div className="ev2-top">
        <div className="ev2-left">
          <Toolbox
            armedType={armedType}
            onArm={setArmedType}
            onItemPointerDown={onItemPointerDown}
            numBits={doc.numBits}
            onNumBitsChange={editor.setNumBits}
            circuit={circuit}
            onImportCircuit={editor.loadCircuit}
          />
          <Inspector
            op={selectedOp}
            numBits={doc.numBits}
            onAngleScrubStart={editor.beginAngleScrub}
            onAngleScrub={(rad) =>
              selectedOp && editor.updateAngleScrub(selectedOp.id, rad)
            }
            onAngleScrubEnd={editor.endAngleScrub}
            onDelete={() => selectedOp && editor.removeOp(selectedOp.id)}
            onDuplicate={() => selectedOp && editor.duplicateOp(selectedOp.id)}
          />
        </div>

        <div className="ev2-center">
          <div ref={fitRef} className="ev2-canvas-region">
            <div ref={gridElRef} className="ev2-grid-root">
              <CircuitGrid
                doc={{ ...doc, ops: activeOps }}
                selectedOpId={selectedOpId}
                ghost={ghostForGrid}
                armedType={armedType}
                movePreview={movePreview}
                slotPreview={slotPreview}
                dangerOpId={dangerOpId}
                executing={
                  sim.status === "ready" ||
                  sim.status === "running" ||
                  sim.status === "done"
                }
                currentSegment={sim.currentSegment}
                measurements={sim.snapshot?.measurements ?? {}}
                wireProbabilities={wireProbabilities}
                onSelect={editor.select}
                onCellClick={onCellClick}
                onPeekSegment={sim.peek}
                onPeekEnd={sim.clearPeek}
                onOpPartPointerDown={onOpPartPointerDown}
                onLoadExample={loadExample}
                registerHandle={registerHandle}
                scale={fitScale}
              />
            </div>
          </div>

          <ShotsPanel circuit={circuit} numBits={doc.numBits} />
        </div>

        <StatePanel
          status={liveAuto ? "done" : sim.status}
          snapshot={liveAuto ? liveSnapshot : sim.snapshot}
          peekSnapshot={sim.peekSnapshot}
          snapshotHistory={sim.snapshotHistory}
          errors={liveAuto ? liveErrors : sim.errors}
          unconnectedGateIds={[]}
          numBits={doc.numBits}
        />
      </div>

      <TransportBar
        status={sim.status}
        numSteps={sim.numSteps}
        currentSegment={sim.currentSegment}
        activeColumns={activeColumns}
        onStart={sim.start}
        onRun={sim.run}
        onStep={sim.step}
        onReset={sim.reset}
        onScrub={sim.peek}
        onScrubEnd={sim.clearPeek}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        isLive={liveAuto}
        onToggleLive={toggleLive}
        onShare={() => {
          const url = buildShareUrl(docToCircuit(doc));
          navigator.clipboard?.writeText(url).catch(() => {
            // Clipboard unavailable (permissions/insecure context) — the
            // URL still builds; failure is silent like the draft writes.
          });
        }}
      />
    </div>
  );
}
