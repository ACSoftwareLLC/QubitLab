import type { KonvaEventObject } from 'konva/lib/Node';
import { Stage, Layer } from 'react-konva';
import { WORKSPACE_WIDTH, WORKSPACE_HEIGHT } from '../../constants/canvas';
import type { AppNode, GateLine, NodeLine, DragPreview, DraggingGateLine, GateType, GateConfig } from '../../types';
import {
  BitLines,
  SegmentGrid,
  GateLinePreview,
  NodeLinePreview,
  GateLineConnection,
  NodeLineConnection,
  Node,
} from './index';

interface QuantumCanvasProps {
  nodes: AppNode[];
  isDraggingLine: boolean;
  lineEnd: { x: number; y: number } | null;
  lineStartNode: number | null;
  numBits: number;
  dragPreview: DragPreview | null;
  draggingGateLine: DraggingGateLine | null;
  gateLines: GateLine[];
  nodeLines: NodeLine[];
  stageScale: number;
  gateConfigs: Record<GateType, GateConfig>;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleNodeDrag: (id: number, e: KonvaEventObject<DragEvent>) => void;
  handleGateDragEnd: (nodeId: number, gateId: number, e: KonvaEventObject<DragEvent>) => void;
  handleDotMouseDown: (id: number, dotX: number, dotY: number) => void;
  handleGateLineStart: (nodeId: number, gateId: number, startX: number, startY: number) => void;
  handleDeleteGate: (nodeId: number, gateId: number) => void;
  handleStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
  handleStageMouseUp: () => void;
  updateGateLineBarY: (lineId: number, barY: number) => void;
  updateNodeLineBitY: (lineId: number, bitY: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export function QuantumCanvas({
  nodes,
  isDraggingLine,
  lineEnd,
  lineStartNode,
  numBits,
  dragPreview,
  draggingGateLine,
  gateLines,
  nodeLines,
  stageScale,
  gateConfigs,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleNodeDrag,
  handleGateDragEnd,
  handleDotMouseDown,
  handleGateLineStart,
  handleDeleteGate,
  handleStageMouseMove,
  handleStageMouseUp,
  updateGateLineBarY,
  updateNodeLineBitY,
  zoomIn,
  zoomOut,
  resetZoom,
}: QuantumCanvasProps) {
  return (
    <div
      style={{ width: '75%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div style={{ position: 'absolute', right: 12, top: '40%', zIndex: 3, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={zoomIn} style={{ width: 40, height: 40 }}>+</button>
        <button onClick={zoomOut} style={{ width: 40, height: 40 }}>−</button>
        <button onClick={resetZoom} style={{ width: 40, height: 28 }}>reset</button>
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

              <SegmentGrid numBits={numBits} />

              {draggingGateLine && <GateLinePreview draggingGateLine={draggingGateLine} />}

              {gateLines.map(line => (
                <GateLineConnection
                  key={line.id}
                  line={line}
                  nodes={nodes}
                  numBits={numBits}
                  onUpdateBarY={updateGateLineBarY}
                />
              ))}

              {nodes.map(node => (
                <Node
                  key={node.id}
                  node={node}
                  onDragMove={handleNodeDrag}
                  onGateDragEnd={handleGateDragEnd}
                  onGateLineStart={handleGateLineStart}
                  onDeleteGate={handleDeleteGate}
                  onDotMouseDown={handleDotMouseDown}
                />
              ))}

              {nodeLines.map(line => (
                <NodeLineConnection
                  key={line.id}
                  line={line}
                  nodes={nodes}
                  numBits={numBits}
                  onUpdateBitY={updateNodeLineBitY}
                />
              ))}

              {isDraggingLine && lineEnd && lineStartNode !== null && (
                <NodeLinePreview
                  lineStartNode={lineStartNode}
                  lineEnd={lineEnd}
                  nodes={nodes}
                />
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
