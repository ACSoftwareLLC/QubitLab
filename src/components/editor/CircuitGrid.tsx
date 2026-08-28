import { useCallback, useRef } from "react";
import { NUM_SEGMENTS } from "../../constants/canvas";
import { GATE_CONFIGS } from "../../constants/gates";
import type { GateType } from "../../types";
import type { Circuit } from "../../api/types";
import { EXAMPLE_CIRCUITS } from "./exampleCircuits";
import {
  gridSize,
  wireY,
  colX,
  colCenterX,
  snapColumn,
  snapWire,
  GRID,
} from "./gridGeometry";
import { OpGlyph } from "./OpGlyph";
import type { OpPart } from "./OpGlyph";
import type { PlacedOp, EditorDoc, WireSlot } from "./useEditorState";
import { defaultConnections } from "./useEditorState";

/** Layout offsets for the per-wire P(1) readout at the wire's right end. */
const PROB_BAR_W = 36;
const PROB_TEXT_GAP = 4;
const PROB_TEXT_W = 26;
/** Space kept between the probability readout and a classical bit box. */
const PROB_CLASSICAL_GAP = 22;

/** Bridge between the page-level window-pointer drag logic and the SVG
 *  stage: converts client coordinates into grid cells. */
export type GridHandle = {
  /** Nearest cell for a client coordinate (with logical y, used for
   *  drop-between-wires span detection); null when outside the stage. */
  clientToCell(
    clientX: number,
    clientY: number,
  ): { column: number; wire: number; y: number } | null;
  /** Raw logical SVG coordinates for a client point (no bounds check —
   *  used by the marquee, which may start/travel outside the stage);
   *  null only when the stage itself is unavailable. */
  clientToLogical(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null;
};

export type GhostPreview = {
  type: GateType;
  column: number;
  wire: number;
  invalid: boolean;
  /** Explicit connections (drop-between-wires spans); null → default
   *  on-wire connections via defaultConnections. */
  connections?: { targets: number[]; controls: number[] } | null;
};

interface CircuitGridProps {
  doc: EditorDoc;
  /** Multi-selection set; the derived single selection drives the
      Inspector (last-selected op). */
  selectedIds: Set<number>;
  ghost: GhostPreview | null;
  armedType: GateType | null;
  /** In-progress op move: render the op at this column (and wire for
      single-bit ops, whose body drag is 2-D). */
  movePreview: { opId: number; column: number; wire?: number } | null;
  /** In-progress slot drag: the dragged connection renders on this wire. */
  slotPreview: { opId: number; slot: WireSlot; wire: number } | null;
  /** Op whose move drag is currently off-grid — releasing deletes it. */
  dangerOpId?: number | null;
  /** Rubber-band rect in logical SVG coords (any corner order). */
  marquee?: { x1: number; y1: number; x2: number; y2: number } | null;
  executing: boolean;
  currentSegment: number;
  measurements: Record<string, 0 | 1>;
  /** Per-wire P(|1⟩) readouts at the wire's right end; null = no sim data. */
  wireProbabilities: number[] | null;
  onSelect: (opId: number | null) => void;
  onCellClick: (column: number, wire: number) => void;
  onPeekSegment: (segment: number) => void;
  onPeekEnd: () => void;
  /** Per-part pointer routing from OpGlyph: body drags move the op; slot
      parts (control dot / ⊕ / ✕) drag re-wire that connection. */
  onOpPartPointerDown: (
    e: React.PointerEvent,
    opId: number,
    part: OpPart,
  ) => void;
  /** Empty-state example loader: replaces the doc with the given circuit. */
  onLoadExample?: (circuit: Circuit) => void;
  /** Pointer press on empty grid background (no op part consumed it) —
      the page starts a marquee selection. */
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  registerHandle: (handle: GridHandle | null) => void;
  /** Display scale (fit-to-container); the viewBox stays logical. */
  scale?: number;
}

export function CircuitGrid({
  doc,
  selectedIds,
  ghost,
  armedType,
  movePreview,
  slotPreview,
  dangerOpId = null,
  marquee,
  executing,
  currentSegment,
  measurements,
  wireProbabilities,
  onSelect,
  onCellClick,
  onPeekSegment,
  onPeekEnd,
  onOpPartPointerDown,
  onLoadExample,
  onBackgroundPointerDown,
  registerHandle,
  scale = 1,
}: CircuitGridProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { width, height } = gridSize(doc.numBits);

  const clientToCell = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      const x = ((clientX - rect.left) / rect.width) * width;
      const y = ((clientY - rect.top) / rect.height) * height;
      return {
        column: snapColumn(x),
        wire: snapWire(y, doc.numBits),
        y,
      };
    },
    [width, height, doc.numBits],
  );

  const clientToLogical = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height],
  );

  const register = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        registerHandle({ clientToCell, clientToLogical });
      } else {
        registerHandle(null);
      }
    },
    [clientToCell, clientToLogical, registerHandle],
  );

  const handleClick = (e: React.MouseEvent) => {
    const cell = clientToCell(e.clientX, e.clientY);
    if (cell) onCellClick(cell.column, cell.wire);
  };

  /** The op as rendered: in-progress drags preview directly on the real
   *  notation (no floating markers) — movePreview repositions the whole
   *  glyph, slotPreview re-wires one connection. */
  const displayOp = (op: PlacedOp): PlacedOp => {
    let next = op;
    if (movePreview && movePreview.opId === op.id) {
      const wire =
        movePreview.wire != null && op.targets.length === 1
          ? movePreview.wire
          : null;
      next =
        wire != null
          ? { ...next, segment: movePreview.column, targets: [wire] }
          : { ...next, segment: movePreview.column };
    }
    if (slotPreview && slotPreview.opId === op.id) {
      const key = slotPreview.slot.kind === "target" ? "targets" : "controls";
      const idx = slotPreview.slot.index;
      next = {
        ...next,
        [key]: next[key].map((w, i) => (i === idx ? slotPreview.wire : w)),
      };
    }
    return next;
  };

  // Classical readout values live per measurement *op* (keyed by op id);
  // map them onto the measured wire for display.
  const measuredByWire = new Map<number, 0 | 1>();
  for (const op of doc.ops) {
    if (op.type !== "M") continue;
    const value = measurements[String(op.id)];
    if (value != null && op.targets[0] != null)
      measuredByWire.set(op.targets[0], value);
  }

  // Full connection layout for the ghost so multi-wire gates preview
  // completely (⊕ + dots), not as a lone circle. Drop-between-wires
  // drags pass explicit spanned connections; otherwise on-wire defaults.
  const ghostOp = (g: GhostPreview): PlacedOp => {
    const { targets, controls } =
      g.connections ?? defaultConnections(g.type, g.wire, doc.numBits);
    return {
      id: -1,
      type: g.type,
      segment: g.column,
      targets,
      controls,
      angle: GATE_CONFIGS[g.type].defaultAngle ?? null,
    };
  };

  return (
    <div className="ev2-grid-root" ref={register}>
      <svg
        ref={svgRef}
        className={`ev2-grid${armedType ? " ev2-grid-armed" : ""}`}
        width={Math.max(1, Math.round(width * scale))}
        height={Math.max(1, Math.round(height * scale))}
        viewBox={`0 0 ${width} ${height}`}
        onClick={handleClick}
        onPointerDown={onBackgroundPointerDown}
      >
        {/* Column ruler */}
        <g className="ev2-ruler">
          {Array.from({ length: NUM_SEGMENTS }, (_, i) => (
            <g
              key={`ruler-${i}`}
              onMouseEnter={() => executing && onPeekSegment(i)}
              onMouseLeave={() => executing && onPeekEnd()}
              style={{
                cursor: executing ? "crosshair" : "default",
              }}
            >
              <rect
                x={colX(i)}
                y={0}
                width={GRID.colW}
                height={height}
                className={`ev2-ruler-hit${executing && currentSegment === i ? " current" : ""}`}
                fill="transparent"
              />
              <text
                x={colCenterX(i)}
                y={16}
                textAnchor="middle"
                fontSize={10}
                className={`ev2-ruler-label${currentSegment === i ? " current" : ""}`}
              >
                {i + 1}
              </text>
            </g>
          ))}
        </g>

        {/* Wires + gutter labels */}
        {Array.from({ length: doc.numBits }, (_, w) => {
          const y = wireY(w);
          const measured = measuredByWire.get(w);
          const p1 = wireProbabilities?.[w];
          // Probability readout sits at the wire's right end, shifted left
          // of a classical bit box when both are present.
          const probRightX =
            width - GRID.padRight - (measured != null ? PROB_CLASSICAL_GAP : 0);
          return (
            <g key={`wire-${w}`} className="ev2-wire-group">
              <line
                x1={GRID.gutterW}
                y1={y}
                x2={width - GRID.padRight}
                y2={y}
                className="ev2-wire"
              />
              <text
                x={GRID.gutterW - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="ev2-wire-label"
              >
                q{w}
              </text>
              {p1 != null && (
                <g
                  className="ev2-wire-prob"
                  transform={`translate(${probRightX - PROB_BAR_W - PROB_TEXT_GAP - PROB_TEXT_W}, ${y})`}
                >
                  <title>{`P(|1⟩) = ${p1.toFixed(2)}`}</title>
                  <rect
                    x={0}
                    y={-3}
                    width={PROB_BAR_W}
                    height={6}
                    rx={3}
                    className="ev2-wire-prob-track"
                  />
                  <rect
                    x={0}
                    y={-3}
                    width={Math.max(0, PROB_BAR_W * p1)}
                    height={6}
                    rx={3}
                    className="ev2-wire-prob-fill"
                  />
                  <text
                    x={PROB_BAR_W + PROB_TEXT_GAP}
                    y={0}
                    dominantBaseline="middle"
                    className="ev2-wire-prob-text"
                  >
                    {`${Math.round(p1 * 100)}%`}
                  </text>
                </g>
              )}
              {/* Classical readout after measurement */}
              {measured != null && (
                <g transform={`translate(${width - GRID.padRight - 10}, ${y})`}>
                  <rect
                    x={-8}
                    y={-9}
                    width={16}
                    height={18}
                    rx={4}
                    className="ev2-classical-bit"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="ev2-classical-bit-text"
                  >
                    {measured}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Ops — each glyph routes its own pointer events per part */}
        {doc.ops.map((op) => (
          <g
            key={op.id}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(op.id);
            }}
            className={`ev2-op${selectedIds.has(op.id) ? " selected" : ""}${
              movePreview?.opId === op.id || slotPreview?.opId === op.id
                ? " dragging"
                : ""
            }${dangerOpId === op.id ? " dragging-danger" : ""}`}
          >
            <OpGlyph
              op={displayOp(op)}
              onPartPointerDown={(e, part) =>
                onOpPartPointerDown(e, op.id, part)
              }
            />
          </g>
        ))}

        {/* Marquee rubber-band — drawn above ops, hit-test happens in the
            page on release. */}
        {marquee && (
          <rect
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            className="ev2-marquee"
            rx={4}
            pointerEvents="none"
          />
        )}

        {/* Ghost preview — the complete glyph, translucent */}
        {ghost && (
          <g className="ev2-ghost" pointerEvents="none">
            <OpGlyph op={ghostOp(ghost)} ghost invalid={ghost.invalid} />
          </g>
        )}
      </svg>

      {doc.ops.length === 0 && !ghost && (
        <div className="ev2-empty-hint">
          <i className="bi bi-grid-1x2" />
          <span className="ev2-empty-title">Build your circuit</span>
          <span className="ev2-empty-sub">
            Drag a gate from the palette onto a wire, or click a gate then click
            a cell. Columns run left → right in time.
          </span>
          <span className="ev2-empty-examples-label">Or start from an example</span>
          <div className="ev2-example-row">
            {EXAMPLE_CIRCUITS.map(({ key, title, blurb, circuit }) => (
              <button
                key={key}
                type="button"
                className="ev2-example-chip"
                title={blurb}
                onClick={() => onLoadExample?.(circuit)}
              >
                <i className="bi bi-diagram-3" />
                <span>{title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
