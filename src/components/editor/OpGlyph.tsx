import { GATE_CONFIGS } from "../../constants/gates";
import type { PlacedOp, WireSlot } from "./useEditorState";
import { colCenterX, wireY } from "./gridGeometry";
import { glyphColor } from "./glyphColors";

/**
 * Standard quantum-circuit notation for one op, drawn on the grid. Each
 * rendered part carries its own pointer routing: the box/connector is the
 * op body (drag to move), and each control dot / ⊕ / ✕ is that
 * connection's handle (drag vertically to re-wire). There are no separate
 * "handle dots" — the notation is the interaction surface.
 */

/** Which part of a glyph a pointer event landed on. */
export type OpPart = { part: "body" } | { part: "slot"; slot: WireSlot };

interface OpGlyphProps {
  op: PlacedOp;
  /** Ghost mode: translucent, no hit targets. */
  ghost?: boolean;
  /** Invalid cell: rendered with the danger color. */
  invalid?: boolean;
  /** Per-part pointer routing. */
  onPartPointerDown?: (e: React.PointerEvent, part: OpPart) => void;
}

const BOX = 30; // labeled box size
const TARGET_R = 11; // ⊕ radius

export function OpGlyph({
  op,
  ghost,
  invalid,
  onPartPointerDown,
}: OpGlyphProps) {
  const config = GATE_CONFIGS[op.type];
  const color = invalid ? "var(--danger, #f87171)" : glyphColor(op.type);
  const opacity = ghost ? 0.45 : 1;

  const bodyProps = ghost
    ? {}
    : {
        className: "op-part op-part-body",
        onPointerDown: (e: React.PointerEvent) => {
          e.stopPropagation();
          onPartPointerDown?.(e, { part: "body" });
        },
      };

  const slotProps = (slot: WireSlot) =>
    ghost
      ? {}
      : {
          className: "op-part op-part-slot",
          onPointerDown: (e: React.PointerEvent) => {
            e.stopPropagation();
            onPartPointerDown?.(e, { part: "slot", slot });
          },
        };

  // --- Multi-wire gates --------------------------------------------------
  if (config.category === "multi" && op.type !== "M") {
    const targetYs = op.targets.map((t) => wireY(t));
    const controlYs = op.controls.map((c) => wireY(c));
    const ys = [...targetYs, ...controlYs];
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const cx = colCenterX(op.segment);

    if (op.type === "SWAP") {
      return (
        <g className="op-glyph" opacity={opacity}>
          <line
            x1={cx}
            y1={top}
            x2={cx}
            y2={bottom}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            {...bodyProps}
          />
          {targetYs.map((y, i) => (
            <g
              key={i}
              transform={`translate(${cx}, ${y})`}
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
              {...slotProps({ kind: "target", index: i })}
            >
              <line x1={-6} y1={-6} x2={6} y2={6} />
              <line x1={-6} y1={6} x2={6} y2={-6} />
            </g>
          ))}
        </g>
      );
    }

    return (
      <g className="op-glyph" opacity={opacity}>
        <line
          x1={cx}
          y1={top}
          x2={cx}
          y2={bottom}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          {...bodyProps}
        />
        {op.controls.map((w, i) => (
          <circle
            key={`c-${i}`}
            cx={cx}
            cy={wireY(w)}
            r={5.5}
            fill={color}
            {...slotProps({ kind: "control", index: i })}
          />
        ))}
        {op.targets.map((w, i) =>
          op.type === "CZ" ? (
            <g
              key={`t-${i}`}
              transform={`translate(${cx}, ${wireY(w)})`}
              {...slotProps({ kind: "target", index: i })}
            >
              <circle
                r={TARGET_R - 3}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            </g>
          ) : (
            <g
              key={`t-${i}`}
              transform={`translate(${cx}, ${wireY(w)})`}
              {...slotProps({ kind: "target", index: i })}
            >
              <circle r={TARGET_R} fill="none" stroke={color} strokeWidth={2} />
              <line
                x1={-TARGET_R}
                y1={0}
                x2={TARGET_R}
                y2={0}
                stroke={color}
                strokeWidth={2}
              />
              <line
                x1={0}
                y1={-TARGET_R}
                x2={0}
                y2={TARGET_R}
                stroke={color}
                strokeWidth={2}
              />
            </g>
          ),
        )}
      </g>
    );
  }

  // --- Boxed gates (single-qubit, parameterized, measurement) ------------
  const y = wireY(op.targets[0] ?? 0);
  const cx = colCenterX(op.segment);
  const isMeasure = op.type === "M";
  const isParam = config.category === "parameterized";

  return (
    <g
      className="op-glyph"
      transform={`translate(${cx}, ${y})`}
      opacity={opacity}
    >
      <rect
        x={-BOX / 2}
        y={-BOX / 2}
        width={BOX}
        height={BOX}
        rx={isMeasure ? 15 : 6}
        fill="var(--bg-deep, #0b1220)"
        stroke={color}
        strokeWidth={1.8}
        {...bodyProps}
      />
      <text
        textAnchor="middle"
        dominantBaseline={isParam ? "auto" : "middle"}
        y={isParam ? -1 : 0.5}
        fontSize={isParam ? 11 : 13}
        fontWeight={700}
        fill={color}
        pointerEvents="none"
        style={{ userSelect: "none" }}
      >
        {isMeasure ? "M" : config.symbol.replace(/[°]/g, "")}
      </text>
      {isParam && op.angle != null && (
        <text
          textAnchor="middle"
          dominantBaseline="hanging"
          y={4}
          fontSize={7.5}
          fontWeight={600}
          fill="var(--muted, #64748b)"
          pointerEvents="none"
          style={{ userSelect: "none" }}
        >
          {`${Math.round((op.angle * 180) / Math.PI)}°`}
        </text>
      )}
    </g>
  );
}
