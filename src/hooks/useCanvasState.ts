import { useState } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { GateType, AppNode, GateLine, NodeLine, DragPreview, DraggingGateLine } from '../types';
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

export type CanvasState = ReturnType<typeof useCanvasState>;

export function useCanvasState() {
  const [nodes, setNodes] = useState<AppNode[]>([
    { id: 1, x: 100, y: 100, gates: [] },
  ]);

  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [lineEnd, setLineEnd] = useState<{ x: number; y: number } | null>(null);
  const [lineStartNode, setLineStartNode] = useState<number | null>(null);
  const [numBits, setNumBits] = useState<number>(4);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [draggingGateLine, setDraggingGateLine] = useState<DraggingGateLine | null>(null);
  const [gateLines, setGateLines] = useState<GateLine[]>([]);
  const [nodeLines, setNodeLines] = useState<NodeLine[]>([]);

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

    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id === 1) {
        const snappedX = snapXToSegment(pointerX);
        const localX = snappedX - node.x - GATE_WIDTH / 2;
        // Always snap Y — gate top so bottom edge is 10px above first bit line
        const localY = SNAPPED_ABS_Y - node.y;

        return {
          ...node,
          gates: [
            ...node.gates,
            {
              id: Date.now(),
              type: gateTypeFromData,
              x: localX,
              y: localY,
              width: GATE_WIDTH,
              height: GATE_HEIGHT,
              color: (GATE_CONFIGS[gateTypeFromData] || GATE_CONFIGS['H']).color,
            }
          ]
        };
      }
      return node;
    }));

    setIsDraggingLine(false);
    setLineEnd(null);
    setLineStartNode(null);
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

  const handleNodeDrag = (id: number, e: KonvaEventObject<DragEvent>) => {
    const pos = e.currentTarget.position();
    const { x, y } = pos;
    setNodes(nodes => nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  const handleGateDragEnd = (nodeId: number, gateId: number, e: KonvaEventObject<DragEvent>) => {
    // pos is local to the parent node Group
    const pos = e.currentTarget.position();

    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;

      // Convert local x to absolute to find the right segment
      const absX = node.x + pos.x + GATE_WIDTH / 2; // use gate center for segment lookup
      const isInColumnRange = absX >= SEGMENTS_START_X && absX <= WORKSPACE_WIDTH;

      if (!isInColumnRange) {
        return {
          ...node,
          gates: node.gates.filter(g => g.id !== gateId),
        };
      }

      // Snap X: segment center → back to local space (left edge of gate)
      const snappedCenterX = snapXToSegment(absX);
      const finalX = snappedCenterX - node.x - GATE_WIDTH / 2;

      // Snap Y: always lock so bottom edge is 10px above first bit line
      const finalY = SNAPPED_ABS_Y - node.y;

      return {
        ...node,
        gates: node.gates.map(g => g.id === gateId ? { ...g, x: finalX, y: finalY } : g),
      };
    }));
  };

  const handleDotMouseDown = (id: number, dotX: number, dotY: number) => {
    setIsDraggingLine(true);
    setLineStartNode(id);
    setLineEnd({ x: dotX, y: dotY });
  };

  const handleTotalDragEnd = () => {
    setDragPreview(null);
  };

  const handleGateLineStart = (nodeId: number, gateId: number, startX: number, startY: number) => {
    setDraggingGateLine({ nodeId, gateId, startX, startY, currentX: startX, currentY: startY });
  };

  const handleBarDotDragEnd = (lineId: number, e: KonvaEventObject<DragEvent>) => {
    const y = e.target.y();
    const nearestY = getClosestBitLine(y, numBits);
    setGateLines(prev => prev.map(line => line.id === lineId ? { ...line, barY: nearestY } : line));
  };

  const handleDeleteGate = (nodeId: number, gateId: number) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, gates: node.gates.filter(g => g.id !== gateId) } : node
    ));
  };

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (draggingGateLine) {
      setDraggingGateLine({ ...draggingGateLine, currentX: pointer.x, currentY: pointer.y });
      return;
    }

    if (!isDraggingLine) return;

    const bitY = getClosestBitLine(pointer.y, numBits);
    const barTolerance = 20;
    const snapY =
      Math.abs(pointer.y - bitY) <= barTolerance && pointer.y >= FIRST_BIT_LINE_Y - barTolerance
        ? bitY
        : pointer.y;
    setLineEnd({ x: pointer.x, y: snapY });
  };

  const handleStageMouseUp = () => {
    if (draggingGateLine) {
      const line = draggingGateLine;
      const closestLine = getClosestBitLine(line.currentY, numBits);
      const barTolerance = 20;
      if (Math.abs(line.currentY - closestLine) <= barTolerance && line.currentY >= FIRST_BIT_LINE_Y - barTolerance) {
        setGateLines(prev => {
          const existing = prev.find(item => item.gateId === line.gateId);
          if (existing) {
            return prev.map(item => item.gateId === line.gateId ? { ...item, barY: closestLine } : item);
          }
          return [...prev, { id: Date.now(), nodeId: line.nodeId, gateId: line.gateId, barY: closestLine }];
        });
      }
      setDraggingGateLine(null);
      return;
    }

    if (isDraggingLine && lineEnd && lineStartNode !== null) {
      const bitY = getClosestBitLine(lineEnd.y, numBits);
      const barTolerance = 20;
      if (
        Math.abs(lineEnd.y - bitY) <= barTolerance &&
        lineEnd.y >= FIRST_BIT_LINE_Y - barTolerance
      ) {
        setNodeLines(prev => {
          const existing = prev.find(item => item.nodeId === lineStartNode);
          if (existing) {
            return prev.map(item =>
              item.nodeId === lineStartNode ? { ...item, bitY } : item
            );
          }
          return [...prev, { id: Date.now(), nodeId: lineStartNode, bitY }];
        });
      }
    }

    setIsDraggingLine(false);
    setLineEnd(null);
    setLineStartNode(null);
  };

  const updateGateLineBarY = (lineId: number, barY: number) => {
    setGateLines(prev => prev.map(line => line.id === lineId ? { ...line, barY } : line));
  };

  const updateNodeLineBitY = (lineId: number, bitY: number) => {
    setNodeLines(prev => prev.map(line => line.id === lineId ? { ...line, bitY } : line));
  };

  return {
    nodes,
    selectedGate,
    isDraggingLine,
    lineEnd,
    lineStartNode,
    numBits,
    dragPreview,
    draggingGateLine,
    gateLines,
    nodeLines,
    stageScale,
    gateConfigs: GATE_CONFIGS,
    workspaceWidth: WORKSPACE_WIDTH,
    workspaceHeight: WORKSPACE_HEIGHT,
    handleDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleTotalDragEnd,
    handleNodeDrag,
    handleGateDragEnd,
    handleDotMouseDown,
    handleGateLineStart,
    handleBarDotDragEnd,
    handleDeleteGate,
    handleStageMouseMove,
    handleStageMouseUp,
    updateGateLineBarY,
    updateNodeLineBitY,
    setNumBits,
    zoomIn: () => setStageScale(s => Math.min(3, +(s + 0.1).toFixed(2))),
    zoomOut: () => setStageScale(s => Math.max(0.3, +(s - 0.1).toFixed(2))),
    resetZoom: () => setStageScale(1),
  };
}
