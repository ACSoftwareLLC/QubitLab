import { NUM_SEGMENTS, MAX_BITS } from "../../constants/canvas";

/**
 * Grid geometry for the v2 wires-based editor: uniform columns × wires with
 * a label gutter. Pure math, no React — exhaustively unit-testable.
 */

export const GRID = {
  /** Width of the wire-label gutter on the left. */
  gutterW: 46,
  /** Height of the column ruler at the top. */
  rulerH: 26,
  /** Horizontal gap between wires. */
  wireSpacing: 38,
  /** Column (time step) width. */
  colW: 56,
  /** Padding around the grid content. */
  padTop: 8,
  padBottom: 14,
  padRight: 10,
} as const;

/** Logical grid size for the given wire count. */
export function gridSize(numBits: number): { width: number; height: number } {
  return {
    width: GRID.gutterW + NUM_SEGMENTS * GRID.colW + GRID.padRight,
    height:
      GRID.rulerH +
      GRID.padTop +
      (numBits - 1) * GRID.wireSpacing +
      GRID.padBottom,
  };
}

/** Y coordinate of a wire (0-based from the top). */
export function wireY(wire: number): number {
  return GRID.rulerH + GRID.padTop + wire * GRID.wireSpacing;
}

/** X range (left edge) of a column (0-based from the left). */
export function colX(column: number): number {
  return GRID.gutterW + column * GRID.colW;
}

/** Center x of a column. */
export function colCenterX(column: number): number {
  return colX(column) + GRID.colW / 2;
}

/** Snap a pointer x to the nearest column index, clamped 0..9. */
export function snapColumn(x: number): number {
  const rel = x - GRID.gutterW;
  return Math.max(
    0,
    Math.min(NUM_SEGMENTS - 1, Math.round((rel - GRID.colW / 2) / GRID.colW)),
  );
}

/** Snap a pointer y to the nearest wire index, clamped to the wire count. */
export function snapWire(y: number, numBits: number): number {
  const rel = y - (GRID.rulerH + GRID.padTop);
  return Math.max(0, Math.min(numBits - 1, Math.round(rel / GRID.wireSpacing)));
}

/** Pointer position (SVG logical coords) → nearest grid cell. */
export function pointToCell(
  x: number,
  y: number,
  numBits: number,
): { column: number; wire: number } {
  return { column: snapColumn(x), wire: snapWire(y, numBits) };
}

/** Column occupancy: which ops occupy each column (for collision checks). */
export function columnOccupancy(
  ops: { segment: number; id: number }[],
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const op of ops) {
    if (op.segment < 0 || op.segment >= NUM_SEGMENTS) continue;
    const list = map.get(op.segment) ?? [];
    list.push(op.id);
    map.set(op.segment, list);
  }
  return map;
}

/** First column at or after `preferred` not occupied by another op. */
export function firstFreeColumn(
  occupancy: Map<number, number[]>,
  preferred: number,
  excludeOpId?: number,
): number {
  for (let c = preferred; c < NUM_SEGMENTS; c++) {
    if (!isOccupied(occupancy, c, excludeOpId)) return c;
  }
  // Full to the right: scan left of the preferred column.
  for (let c = preferred - 1; c >= 0; c--) {
    if (!isOccupied(occupancy, c, excludeOpId)) return c;
  }
  return preferred; // grid full — allow stacking in the preferred column
}

export function isOccupied(
  occupancy: Map<number, number[]>,
  column: number,
  excludeOpId?: number,
): boolean {
  const ids = occupancy.get(column);
  if (!ids) return false;
  return ids.some((id) => id !== excludeOpId);
}

/** Maximum wires the grid supports (matches simulator MAX_BITS). */
export const MAX_WIRES = MAX_BITS;
