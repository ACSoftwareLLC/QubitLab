import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { Ref } from 'react';
import { Stage, Layer } from 'react-konva';
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

interface QuantumCanvasProps {
  gates: CanvasGate[];
  numBits: number;
  dragPreview: DragPreview | null;
  draggingGateLine: DraggingGateLine | null;
  gateLines: GateLine[];
  stageScale: number;
  gateConfigs: Record<GateType, GateConfig>;
  selectedPlacedGateId: number | null;
  simStatus: SimStatus;
  currentSegment: number;
  numSteps: number;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleGateDragEnd: (gateId: number, e: KonvaEventObject<DragEvent>) => void;
  handleGateLineStart: (gateId: number, originIndex: number, originX: number, startX: number, startY: number) => void;
  handleDeleteGate: (gateId: number) => void;
  handleSelectGate: (gateId: number) => void;
  handleStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
  handleStageMouseUp: () => void;
  updateGateLineBarY: (lineId: number, barY: number) => void;
  toggleGateLineRole: (lineId: number) => void;
  onSimStart: () => void;
  onSimStep: () => void;
  onSimRun: () => void;
  onSimReset: () => void;
  onPeekSegment: (segment: number) => void;
  onPeekEnd: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  stageRef?: Ref<Konva.Stage>;
}

const simButtonStyle: React.CSSProperties = {
  width: 64,
  height: 28,
  fontSize: 12,
  cursor: 'pointer',
};

export function QuantumCanvas({
  gates,
  numBits,
  dragPreview,
  draggingGateLine,
  gateLines,
  stageScale,
  gateConfigs,
  selectedPlacedGateId,
  simStatus,
  currentSegment,
  numSteps,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleGateDragEnd,
  handleGateLineStart,
  handleDeleteGate,
  handleSelectGate,
  handleStageMouseMove,
  handleStageMouseUp,
  updateGateLineBarY,
  toggleGateLineRole,
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
  const executing = simStatus === 'ready' || simStatus === 'running' || simStatus === 'done';
  const canInteract = simStatus === 'ready' || simStatus === 'running';
  const idle = !draggingGateLine;

  return (
    <div
      style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div style={{ position: 'absolute', right: 12, top: '40%', zIndex: 3, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={zoomIn} style={{ width: 40, height: 40 }}>+</button>
        <button onClick={zoomOut} style={{ width: 40, height: 40 }}>−</button>
        <button onClick={resetZoom} style={{ width: 40, height: 28 }}>reset</button>
      </div>

      {/* Execution controls */}
      <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
        {!executing ? (
          <button onClick={onSimStart} style={simButtonStyle}>▶ start</button>
        ) : (
          <>
            <button onClick={onSimStep} disabled={!canInteract} style={simButtonStyle}>step</button>
            <button onClick={onSimRun} disabled={!canInteract} style={simButtonStyle}>run</button>
            <button onClick={onSimReset} style={simButtonStyle}>reset</button>
            <span style={{ fontSize: 12, color: '#555' }}>
              {simStatus === 'done' ? 'done' : `segment ${currentSegment} / ${numSteps > 0 ? numSteps - 1 : 0}`}
            </span>
          </>
        )}
      </div>

      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {dragPreview && dragPreview.visible && (
          <div
            style={{
              position: 'absolute',
              left: dragPreview.x,
              top: dragPreview.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              width: 48,
              height: 48,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 16,
              background: gateConfigs[dragPreview.gateType]?.color || '#444',
              color: '#fff',
              fontWeight: 700,
              zIndex: 5,
              boxShadow: '0 8px 18px rgba(0,0,0,0.25)',
            }}
          >
            {dragPreview.gateType}
          </div>
        )}

        <div id="stage-scroll-container" style={{ width: WORKSPACE_WIDTH, height: WORKSPACE_HEIGHT, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Stage
            ref={stageRef}
            width={WORKSPACE_WIDTH}
            height={WORKSPACE_HEIGHT}
            scaleX={stageScale}
            scaleY={stageScale}
            style={{ border: '1px solid #ccc', background: '#f9f9f9' }}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
          >
            <Layer>
              <BitLines numBits={numBits} workspaceWidth={WORKSPACE_WIDTH} />

              <SegmentGrid
                numBits={numBits}
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
                  onUpdateBarY={updateGateLineBarY}
                  onToggleRole={toggleGateLineRole}
                />
              ))}

              {gates.map(gate => (
                <Gate
                  key={gate.id}
                  gate={gate}
                  selected={gate.id === selectedPlacedGateId}
                  onDragEnd={handleGateDragEnd}
                  onLineStart={handleGateLineStart}
                  onDelete={handleDeleteGate}
                  onSelect={handleSelectGate}
                />
              ))}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
