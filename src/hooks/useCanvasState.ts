import { useState } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
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
import { GATE_CONFIGS } from '../constants/gates';
import { snapXToSegment, getClosestBitLine } from '../utils/geometry';
import { deserializeCircuit } from '../api/deserialize';
import type { Circuit } from '../api/types';

export type CanvasState = ReturnType<typeof useCanvasState>;

export function useCanvasState() {
  const [gates, setGates] = useState<CanvasGate[]>([]);

  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [numBits, setNumBits] = useState<number>(4);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [draggingGateLine, setDraggingGateLine] = useState<DraggingGateLine | null>(null);
  const [gateLines, setGateLines] = useState<GateLine[]>([]);
  const [selectedPlacedGateId, setSelectedPlacedGateId] = useState<number | null>(null);

  const [stageScale, setStageScale] = useState(1);

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

    const scrollContainer = document.getElementById('stage-scroll-container') as HTMLDivElement | null;
    const rect = (scrollContainer || (e.currentTarget as HTMLDivElement)).getBoundingClientRect();
    const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
    const pointerX = (e.clientX - rect.left + scrollLeft) / stageScale;

    const rawGateType = e.dataTransfer.getData('gateType') || e.dataTransfer.getData('text/plain') || selectedGate || 'H';
    const gateTypeFromData = (rawGateType in GATE_CONFIGS ? rawGateType : 'H') as GateType;
    const config = GATE_CONFIGS[gateTypeFromData] || GATE_CONFIGS['H'];

    const snappedX = snapXToSegment(pointerX);

    setGates(prev => [
      ...prev,
      {
        id: Date.now(),
        type: gateTypeFromData,
        x: snappedX - GATE_WIDTH / 2,
        y: SNAPPED_ABS_Y,
        width: GATE_WIDTH,
        height: GATE_HEIGHT,
        color: config.color,
        ...(config.defaultAngle != null ? { angle: config.defaultAngle } : {}),
      },
    ]);
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

  const handleGateDragEnd = (gateId: number, e: KonvaEventObject<DragEvent>) => {
    const pos = e.currentTarget.position(); // absolute — gates live on the canvas root

    // Use the gate center for segment lookup
    const absX = pos.x + GATE_WIDTH / 2;
    const isInColumnRange = absX >= SEGMENTS_START_X && absX <= WORKSPACE_WIDTH;

    if (!isInColumnRange) {
      handleDeleteGate(gateId);
      return;
    }

    const snappedCenterX = snapXToSegment(absX);
    const finalX = snappedCenterX - GATE_WIDTH / 2;

    // Snap the Konva node imperatively too: if the gate lands back in its
    // old segment, React sees unchanged props and wouldn't move the node
    // back from wherever the drag left it.
    e.currentTarget.position({ x: finalX, y: SNAPPED_ABS_Y });

    setGates(prev => prev.map(g =>
      g.id === gateId ? { ...g, x: finalX, y: SNAPPED_ABS_Y } : g,
    ));
  };

  const handleTotalDragEnd = () => {
    setDragPreview(null);
  };

  const handleGateLineStart = (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => {
    setDraggingGateLine({ gateId, originIndex, originX, startX, startY, currentX: startX, currentY: startY, rawX: startX, rawY: startY });
  };

  const handleDeleteGate = (gateId: number) => {
    setGates(prev => prev.filter(g => g.id !== gateId));
    setGateLines(prev => prev.filter(line => line.gateId !== gateId));
    setSelectedPlacedGateId(prev => (prev === gateId ? null : prev));
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

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!draggingGateLine) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // getPointerPosition is in unscaled CSS px — convert to canvas coords.
    const scale = stage.scaleX() || 1;
    const pointerX = pointer.x / scale;
    const pointerY = pointer.y / scale;

    // The line stays inline with its origin: x is locked to the origin's
    // absolute x. The end snaps to a bit line when within the same
    // tolerance the drop check uses, otherwise follows the pointer.
    const closestLine = getClosestBitLine(pointerY, numBits);
    const barTolerance = 20;
    const snappedY =
      Math.abs(pointerY - closestLine) <= barTolerance && pointerY >= FIRST_BIT_LINE_Y - barTolerance
        ? closestLine
        : pointerY;
    setDraggingGateLine({
      ...draggingGateLine,
      currentX: draggingGateLine.startX,
      currentY: snappedY,
      rawX: pointerX,
      rawY: pointerY,
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
                id: Date.now(),
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
    setNumBits(loaded.numBits);
    setSelectedPlacedGateId(null);
    setDraggingGateLine(null);
    setDragPreview(null);
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
    handleDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleTotalDragEnd,
    handleGateDragEnd,
    handleGateLineStart,
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
