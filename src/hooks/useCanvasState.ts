import { useState } from 'react';
import type { GateType, CanvasGate, GateLine, DragPreview, DraggingGateLine } from '../types';
import {
  WORKSPACE_WIDTH,
  WORKSPACE_HEIGHT,
  SEGMENTS_START_X,
  GATE_WIDTH,
  GATE_HEIGHT,
  SNAPPED_ABS_Y,
  FIRST_BIT_LINE_Y,
} from '../constants/canvas';
import { GATE_CONFIGS, getGateWidth } from '../constants/gates';
import {
  getSegmentWidths,
  getSegmentLayout,
  getSegmentIndex,
  getClosestBitLine,
} from '../utils/geometry';
import { deserializeCircuit } from '../api/deserialize';
import type { Circuit } from '../api/types';

export type CanvasState = ReturnType<typeof useCanvasState>;

/** Re-derives every gate's x from its segment and the current layout:
 *  segments that hold wide gates are expanded, so gates to their right
 *  shift over; emptied segments shrink back and gates shift left again. */
const reflowGates = (list: CanvasGate[]): CanvasGate[] => {
  const widths = getSegmentWidths(list);
  const layout = getSegmentLayout(widths);
  return list.map(g =>
    g.segment == null
      ? g
      : { ...g, x: layout.starts[g.segment] + widths[g.segment] / 2 - g.width / 2 },
  );
};

/** Collision-safe id generator: Date.now() alone can repeat within the same
 *  millisecond (e.g. a gate and its connection created together). */
let idCounter = 0;
const nextId = () => {
  idCounter = (idCounter + 1) % 1000;
  return Date.now() * 1000 + idCounter;
};

/** In-flight drag state for a gate. The gate itself stays in `gates` until the
 *  drag ends; this record overrides its rendered position. */
type GateDrag = {
  gateId: number;
  offsetX: number;
  x: number;
  y: number;
};

/** In-flight drag state for a line endpoint. The line stays in `gateLines`
 *  until the drag ends; this record overrides its rendered bit line. */
type LineDrag = {
  lineId: number;
  barY: number;
};

/**
 * @param fitScale  Scale applied to the stage so the workspace fits its
 *                  container (QuantumCanvas measures it). Drop coordinates
 *                  are divided by `fitScale * stageScale`. Defaults to 1.
 */
export function useCanvasState(fitScale = 1) {
  const [gates, setGates] = useState<CanvasGate[]>([]);

  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [numBits, setNumBits] = useState<number>(4);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [draggingGateLine, setDraggingGateLine] = useState<DraggingGateLine | null>(null);
  const [gateLines, setGateLines] = useState<GateLine[]>([]);
  const [selectedPlacedGateId, setSelectedPlacedGateId] = useState<number | null>(null);

  const [stageScale, setStageScale] = useState(1);

  // SVG drag overlays — these keep React state stable during a drag so the
  // simulator (which depends on gates/gateLines) is not recomputed on every
  // mouse move.
  const [gateDrag, setGateDrag] = useState<GateDrag | null>(null);
  const [lineDrag, setLineDrag] = useState<LineDrag | null>(null);

  const handleDragStart = (e: React.DragEvent, gateType: GateType) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('type', 'gate');
    e.dataTransfer.setData('gateType', gateType);
    try { e.dataTransfer.setData('text/plain', gateType); } catch { /* noop */ }
    setSelectedGate(gateType);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragPreview(null);

    // Map client coords → canvas coords through the stage holder, whose
    // on-screen rect already reflects the effective (fit × zoom) scale.
    const holder = document.getElementById('stage-holder') as HTMLDivElement | null;
    const rect = (holder || (e.currentTarget as HTMLDivElement)).getBoundingClientRect();
    const pointerX = (e.clientX - rect.left) / (stageScale * fitScale);

    const rawGateType = e.dataTransfer.getData('gateType') || e.dataTransfer.getData('text/plain') || selectedGate || 'H';
    const gateTypeFromData = (rawGateType in GATE_CONFIGS ? rawGateType : 'H') as GateType;
    const config = GATE_CONFIGS[gateTypeFromData] || GATE_CONFIGS['H'];

    // Segment lookup against the current (possibly expanded) layout.
    const widths = getSegmentWidths(gates);
    const segment = getSegmentIndex(pointerX, widths);
    const gateWidth = getGateWidth(config);

    // x is provisional — reflow centers the gate in its (now possibly
    // widened) segment and shifts the gates to its right.
    setGates(prev =>
      reflowGates([
        ...prev,
        {
          id: nextId(),
          type: gateTypeFromData,
          x: 0,
          y: SNAPPED_ABS_Y,
          width: gateWidth,
          height: GATE_HEIGHT,
          color: config.color,
          segment,
          ...(config.defaultAngle != null ? { angle: config.defaultAngle } : {}),
        },
      ]),
    );
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!selectedGate) return;
    const container = e.currentTarget as HTMLDivElement;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragPreview({ gateType: selectedGate, x, y, visible: true });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const container = e.currentTarget as HTMLDivElement;
    const related = e.relatedTarget as Element | null;
    if (!related || !container.contains(related)) {
      setDragPreview(null);
    }
  };

  const handleGateDragStart = (gateId: number, pointerX: number) => {
    const gate = gates.find(g => g.id === gateId);
    if (!gate) return;
    setSelectedPlacedGateId(gateId);
    setGateDrag({
      gateId,
      offsetX: pointerX - gate.x,
      x: gate.x,
      y: gate.y,
    });
  };

  const handleGateDragMove = (pointerX: number) => {
    if (!gateDrag) return;
    setGateDrag({
      ...gateDrag,
      x: pointerX - gateDrag.offsetX,
      y: SNAPPED_ABS_Y,
    });
  };

  const handleGateDragEnd = () => {
    if (!gateDrag) return;

    const gate = gates.find(g => g.id === gateDrag.gateId);
    if (!gate) {
      setGateDrag(null);
      return;
    }

    // Use the gate center for segment lookup (respecting per-type widths)
    const gateWidth = gate.width ?? GATE_WIDTH;
    const absX = gateDrag.x + gateWidth / 2;
    const widths = getSegmentWidths(gates);
    const layout = getSegmentLayout(widths);
    const isInColumnRange = absX >= SEGMENTS_START_X && absX <= layout.right;

    if (!isInColumnRange) {
      setGateDrag(null);
      handleDeleteGate(gateDrag.gateId);
      return;
    }

    const segment = getSegmentIndex(absX, widths);

    // Reflow: the old segment shrinks back if it lost its widest gate, the
    // new segment widens to fit. Same-segment drops leave x unchanged.
    setGates(prev => reflowGates(prev.map(g => (g.id === gateDrag.gateId ? { ...g, segment, y: SNAPPED_ABS_Y } : g))));
    setGateDrag(null);
  };

  const handleTotalDragEnd = () => {
    setDragPreview(null);
  };

  const handleGateLineStart = (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => {
    setDraggingGateLine({ gateId, originIndex, originX, startX, startY, currentX: startX, currentY: startY, rawX: startX, rawY: startY });
  };

  const handleDeleteGate = (gateId: number) => {
    // Reflow so the freed segment shrinks back to its default width.
    setGates(prev => reflowGates(prev.filter(g => g.id !== gateId)));
    setGateLines(prev => prev.filter(line => line.gateId !== gateId));
    setSelectedPlacedGateId(prev => (prev === gateId ? null : prev));
    if (gateDrag?.gateId === gateId) setGateDrag(null);
  };

  const handleSelectGate = (gateId: number) => {
    setSelectedPlacedGateId(prev => (prev === gateId ? null : gateId));
  };

  const handleGateAngleChange = (gateId: number, angle: number) => {
    setGates(prev => prev.map(g => (g.id === gateId ? { ...g, angle } : g)));
  };

  const toggleGateLineRole = (lineId: number) => {
    setGateLines(prev => prev.map(line =>
      line.id === lineId
        ? { ...line, role: line.role === 'target' ? 'control' : 'target' }
        : line
    ));
  };

  const handleLineDragStart = (lineId: number) => {
    const line = gateLines.find(l => l.id === lineId);
    if (!line) return;
    setLineDrag({ lineId, barY: line.barY });
  };

  const handleLineDragMove = (pointerY: number) => {
    if (!lineDrag) return;
    const nearestY = getClosestBitLine(pointerY, numBits);
    setLineDrag({ ...lineDrag, barY: nearestY });
  };

  const handleLineDragEnd = () => {
    if (!lineDrag) return;
    updateGateLineBarY(lineDrag.lineId, lineDrag.barY);
    setLineDrag(null);
  };

  const handleStageMouseMove = (pos: { x: number; y: number }) => {
    if (!draggingGateLine) return;

    // The line stays inline with its origin: x is locked to the origin's
    // absolute x. The end snaps to a bit line when within the same
    // tolerance the drop check uses, otherwise follows the pointer.
    const closestLine = getClosestBitLine(pos.y, numBits);
    const barTolerance = 20;
    const snappedY =
      Math.abs(pos.y - closestLine) <= barTolerance && pos.y >= FIRST_BIT_LINE_Y - barTolerance
        ? closestLine
        : pos.y;
    setDraggingGateLine({
      ...draggingGateLine,
      currentX: draggingGateLine.startX,
      currentY: snappedY,
      rawX: pos.x,
      rawY: pos.y,
    });
  };

  const handleStageMouseUp = () => {
    if (draggingGateLine) {
      const line = draggingGateLine;
      const closestLine = getClosestBitLine(line.currentY, numBits);
      const barTolerance = 20;
      if (Math.abs(line.currentY - closestLine) <= barTolerance && line.currentY >= FIRST_BIT_LINE_Y - barTolerance) {
        const gate = gates.find(g => g.id === line.gateId);
        const config = gate ? GATE_CONFIGS[gate.type] : null;
        if (config) {
          const role: GateLine['role'] =
            line.originIndex < config.targetCapacity ? 'target' : 'control';
          setGateLines(prev => {
            const existing = prev.find(
              item => item.gateId === line.gateId && item.originIndex === line.originIndex,
            );
            if (existing) {
              return prev.map(item => (item.id === existing.id ? { ...item, barY: closestLine } : item));
            }
            return [
              ...prev,
              {
                id: nextId(),
                gateId: line.gateId,
                barY: closestLine,
                role,
                originIndex: line.originIndex,
                originX: line.originX,
              },
            ];
          });
        }
      }
      setDraggingGateLine(null);
    }
  };

  const updateGateLineBarY = (lineId: number, barY: number) => {
    setGateLines(prev => prev.map(line => (line.id === lineId ? { ...line, barY } : line)));
  };

  const loadCircuit = (circuit: Circuit) => {
    const loaded = deserializeCircuit(circuit);
    setGates(loaded.gates);
    setGateLines(loaded.gateLines);
    setNumBits(Math.min(16, Math.max(1, loaded.numBits)));
    setSelectedPlacedGateId(null);
    setDraggingGateLine(null);
    setDragPreview(null);
    setGateDrag(null);
    setLineDrag(null);
  };

  return {
    gates,
    selectedGate,
    numBits,
    dragPreview,
    draggingGateLine,
    gateLines,
    selectedPlacedGateId,
    stageScale,
    gateConfigs: GATE_CONFIGS,
    workspaceWidth: WORKSPACE_WIDTH,
    workspaceHeight: WORKSPACE_HEIGHT,
    // SVG drag overlays
    gateDrag,
    lineDrag,
    handleDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleTotalDragEnd,
    handleGateDragStart,
    handleGateDragMove,
    handleGateDragEnd,
    handleGateLineStart,
    handleLineDragStart,
    handleLineDragMove,
    handleLineDragEnd,
    handleDeleteGate,
    handleSelectGate,
    handleGateAngleChange,
    toggleGateLineRole,
    handleStageMouseMove,
    handleStageMouseUp,
    updateGateLineBarY,
    loadCircuit,
    setNumBits,
    zoomIn: () => setStageScale(s => Math.min(3, +(s + 0.1).toFixed(2))),
    zoomOut: () => setStageScale(s => Math.max(0.3, +(s - 0.1).toFixed(2))),
    resetZoom: () => setStageScale(1),
  };
}
