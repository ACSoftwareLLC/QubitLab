import { useRef, type Ref } from 'react';
import { WORKSPACE_WIDTH, WORKSPACE_HEIGHT } from '../../constants/canvas';
import type { CanvasGate, GateLine, DragPreview, DraggingGateLine, GateType, GateConfig } from '../../types';
import type { SimStatus } from '../../hooks/useSimulation';
import {
  BitLines,
  SegmentGrid,
  GateLinePreview,
  GateLineConnection,
  Gate,
} from './index';
import { getSegmentWidths, getSegmentLayout } from '../../utils/geometry';
import './QuantumCanvas.css';

interface QuantumCanvasProps {
  gates: CanvasGate[];
  numBits: number;
  dragPreview: DragPreview | null;
  draggingGateLine: DraggingGateLine | null;
  gateLines: GateLine[];
  stageScale: number;
  /** Base scale that fits the workspace into the container (ResizeObserver). */
  fitScale: number;
  gateConfigs: Record<GateType, GateConfig>;
  selectedPlacedGateId: number | null;
  simStatus: SimStatus;
  currentSegment: number;
  numSteps: number;
  /** Currently dragged gate overlay, if any. */
  gateDrag: { gateId: number; x: number; y: number } | null;
  /** Currently dragged line endpoint overlay, if any. */
  lineDrag: { lineId: number; barY: number } | null;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleGateDragStart: (gateId: number, pointerX: number) => void;
  handleGateDragMove: (pointerX: number) => void;
  handleGateDragEnd: () => void;
  handleGateLineStart: (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => void;
  handleLineDragStart: (lineId: number) => void;
  handleLineDragMove: (pointerY: number) => void;
  handleLineDragEnd: () => void;
  handleDeleteGate: (gateId: number) => void;
  handleSelectGate: (gateId: number) => void;
  handleStageMouseMove: (pos: { x: number; y: number }) => void;
  handleStageMouseUp: () => void;
  toggleGateLineRole: (lineId: number) => void;
  updateGateLineBarY: (lineId: number, barY: number) => void;
  onSimStart: () => void;
  onSimStep: () => void;
  onSimRun: () => void;
  onSimReset: () => void;
  onPeekSegment: (segment: number) => void;
  onPeekEnd: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  stageRef?: Ref<SVGSVGElement>;
}

function logicalCoordsFromRect(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * WORKSPACE_WIDTH,
    y: ((clientY - rect.top) / rect.height) * WORKSPACE_HEIGHT,
  };
}

const STATUS_LABELS: Record<SimStatus, string> = {
  idle: 'Idle',
  ready: 'Ready',
  running: 'Running',
  done: 'Done',
  invalid: 'Invalid',
  offline: 'Offline',
};

export function QuantumCanvas({
  gates,
  numBits,
  dragPreview,
  draggingGateLine,
  gateLines,
  stageScale,
  fitScale,
  gateConfigs,
  selectedPlacedGateId,
  simStatus,
  currentSegment,
  numSteps,
  gateDrag,
  lineDrag,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleGateDragStart,
  handleGateDragMove,
  handleGateDragEnd,
  handleGateLineStart,
  handleLineDragStart,
  handleLineDragMove,
  handleLineDragEnd,
  handleDeleteGate,
  handleSelectGate,
  handleStageMouseMove,
  handleStageMouseUp,
  toggleGateLineRole,
  updateGateLineBarY,
  onSimStart,
  onSimStep,
  onSimRun,
  onSimReset,
  onPeekSegment,
  onPeekEnd,
  zoomIn,
  zoomOut,
  resetZoom,
  stageRef,
}: QuantumCanvasProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const executing = simStatus === 'ready' || simStatus === 'running' || simStatus === 'done';
  const canInteract = simStatus === 'ready' || simStatus === 'running';
  const idle = !draggingGateLine && !gateDrag && !lineDrag;

  // The stage viewport is sized to the *displayed* pixels so the whole
  // workspace is always visible and never clipped; content is drawn at
  // effectiveScale, keeping pointer math exact.
  const effectiveScale = fitScale * stageScale;
  const stageW = Math.max(1, Math.round(WORKSPACE_WIDTH * effectiveScale));
  const stageH = Math.max(1, Math.round(WORKSPACE_HEIGHT * effectiveScale));

  // Segments widen around wide gates; bit lines extend to the layout's
  // right edge (never past the stage viewport).
  const segmentWidths = getSegmentWidths(gates);
  const layoutRight = getSegmentLayout(segmentWidths).right;
  const linesWidth = Math.max(WORKSPACE_WIDTH, layoutRight);

  const toLogicalCoords = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = holderRef.current?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
    return logicalCoordsFromRect(e.clientX, e.clientY, rect);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gateDrag) {
      const pos = toLogicalCoords(e);
      handleGateDragMove(pos.x);
      return;
    }
    if (lineDrag) {
      const pos = toLogicalCoords(e);
      handleLineDragMove(pos.y);
      return;
    }
    handleStageMouseMove(toLogicalCoords(e));
  };

  const onMouseUp = () => {
    if (gateDrag) {
      handleGateDragEnd();
      return;
    }
    if (lineDrag) {
      handleLineDragEnd();
      return;
    }
    handleStageMouseUp();
  };

  const gateWithDrag = (gate: CanvasGate): CanvasGate => {
    if (gateDrag?.gateId === gate.id) {
      return { ...gate, x: gateDrag.x, y: gateDrag.y };
    }
    return gate;
  };

  const lineWithDrag = (line: GateLine): GateLine => {
    if (lineDrag?.lineId === line.id) {
      return { ...line, barY: lineDrag.barY };
    }
    return line;
  };

  return (
    <div
      className="quantum-canvas"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Simulation controls */}
      <div className="canvas-toolbar canvas-toolbar-sim">
        {!executing ? (
          <button className="btn btn-icon btn-primary" onClick={onSimStart} title="Start simulation" aria-label="Start simulation">
            <i className="bi bi-play-fill" />
          </button>
        ) : (
          <>
            <button className="btn btn-icon" onClick={onSimStep} disabled={!canInteract} title="Step one segment" aria-label="Step one segment">
              <i className="bi bi-skip-end-fill" />
            </button>
            <button className="btn btn-icon" onClick={onSimRun} disabled={!canInteract} title="Run to completion" aria-label="Run to completion">
              <i className="bi bi-fast-forward-fill" />
            </button>
            <button className="btn btn-icon" onClick={onSimReset} title="Reset simulation" aria-label="Reset simulation">
              <i className="bi bi-arrow-counterclockwise" />
            </button>
          </>
        )}
        <span className={`canvas-status-pill canvas-status-${simStatus}`}>{STATUS_LABELS[simStatus]}</span>
        {executing && (
          <span className="canvas-segment-readout">
            {simStatus === 'done' ? `${numSteps > 0 ? numSteps - 1 : 0} / ${numSteps > 0 ? numSteps - 1 : 0}` : `${currentSegment} / ${numSteps > 0 ? numSteps - 1 : 0}`}
          </span>
        )}
      </div>

      {/* Zoom controls */}
      <div className="canvas-toolbar canvas-toolbar-zoom">
        <button className="btn btn-icon" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
          <i className="bi bi-dash" />
        </button>
        <span className="canvas-zoom-label">{Math.round(effectiveScale * 100)}%</span>
        <button className="btn btn-icon" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
          <i className="bi bi-plus" />
        </button>
        <span className="canvas-toolbar-divider" />
        <button className="btn btn-icon" onClick={resetZoom} title="Fit to window" aria-label="Fit to window">
          <i className="bi bi-aspect-ratio" />
        </button>
      </div>

      {/* Empty-state hint */}
      {gates.length === 0 && (
        <div className="canvas-empty-hint">
          <div className="canvas-empty-hint-card">
            <i className="bi bi-box-arrow-in-left" />
            <span className="canvas-empty-hint-title">Drag gates from the toolbox onto the canvas</span>
            <span className="canvas-empty-hint-sub">
              Drop a gate on a segment, drag lines from the dots below it to bit lines,
              then press Start. Filled dots are targets; open dots are controls.
            </span>
          </div>
        </div>
      )}

      {/* Drag preview chip */}
      {dragPreview && dragPreview.visible && (
        <div
          className="canvas-drag-preview"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            background: gateConfigs[dragPreview.gateType]?.color || '#444',
          }}
        >
          {gateConfigs[dragPreview.gateType]?.symbol ?? dragPreview.gateType}
        </div>
      )}

      <div id="stage-holder" ref={holderRef} className="canvas-stage-holder" style={{ width: stageW, height: stageH }}>
        <svg
          ref={stageRef}
          width={stageW}
          height={stageH}
          viewBox={`0 0 ${WORKSPACE_WIDTH} ${WORKSPACE_HEIGHT}`}
          className="canvas-svg"
        >
          <BitLines numBits={numBits} workspaceWidth={linesWidth} />

          <SegmentGrid
            numBits={numBits}
            widths={segmentWidths}
            currentSegment={executing ? currentSegment : -1}
            onPeekSegment={idle && executing ? onPeekSegment : undefined}
            onPeekEnd={onPeekEnd}
          />

          {draggingGateLine && <GateLinePreview draggingGateLine={draggingGateLine} />}

          {gateLines.map(line => (
            <GateLineConnection
              key={line.id}
              line={line}
              gates={gates}
              numBits={numBits}
              barY={lineWithDrag(line).barY}
              onUpdateBarY={updateGateLineBarY}
              onToggleRole={toggleGateLineRole}
              onDragStart={handleLineDragStart}
            />
          ))}

          {gates.map(gate => (
            <Gate
              key={gate.id}
              gate={gateWithDrag(gate)}
              selected={gate.id === selectedPlacedGateId}
              onDragStart={handleGateDragStart}
              onLineStart={handleGateLineStart}
              onDelete={handleDeleteGate}
              onSelect={handleSelectGate}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
