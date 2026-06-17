import { useState } from 'react';
import { Stage, Layer, Group, Rect, Circle, Line, Text } from 'react-konva';
import { Toolbox } from './components/toolbox';

export type GateType = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'C';

type Gate = {
  id: number;
  type: GateType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

type AppNode = {
  id: number;
  x: number;
  y: number;
  gates: Gate[];
};

type GateLine = {
  id: number;
  nodeId: number;
  gateId: number;
  barY: number;
};

function App() {
  // Multiple nodes state
  const [nodes, setNodes] = useState<AppNode[]>([
    { id: 1, x: 100, y: 100, gates: [] },
  ]);
  
  // Toolbox state
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [lineEnd, setLineEnd] = useState<{ x: number; y: number } | null>(null);
  const [lineStartNode, setLineStartNode] = useState<number | null>(null);
  // bits
  const [numBits, setNumBits] = useState<number>(4);
  const [dragPreview, setDragPreview] = useState<{
    gateType: GateType;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);
  const [draggingGateLine, setDraggingGateLine] = useState<{
    nodeId: number;
    gateId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [gateLines, setGateLines] = useState<GateLine[]>([]);
  // Workspace fixed size
  const workspaceWidth = 1200;
  const workspaceHeight = 800;
  const numSegments = 10;
  const segmentsStartX = workspaceWidth * 0.3;
  const segmentWidth = (workspaceWidth - segmentsStartX) / numSegments;
  // viewport / zoom
  const [stageScale, setStageScale] = useState(1);

  // Box size
  const boxWidth = 100;
  const boxHeight = 100;
  const dotRadius = 8;
  const dotOffset = 0; // center vertically

  // Gate configurations
  const gateConfigs: Record<GateType, { name: string; color: string; symbol: string }> = {
    H: { name: 'H', color: '#2196F3', symbol: 'H' },
    X: { name: 'X', color: '#F44336', symbol: 'X' },
    Y: { name: 'Y', color: '#9C27B0', symbol: 'Y' },
    Z: { name: 'Z', color: '#FF9800', symbol: 'Z' },
    S: { name: 'S', color: '#4CAF50', symbol: 'S' },
    T: { name: 'T', color: '#E91E63', symbol: 'T' },
    C: { name: 'C', color: '#9C27B0', symbol: 'C' },
  };

  // Drag from toolbox
  const handleDragStart = (e: React.DragEvent, gateType: GateType) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('type', 'gate');
    e.dataTransfer.setData('gateType', gateType);
    // also set a plain text fallback for some browsers
    try { e.dataTransfer.setData('text/plain', gateType); } catch {}
    setSelectedGate(gateType);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragPreview(null);
    const scrollContainer = document.getElementById('stage-scroll-container') as HTMLDivElement | null;
    const rect = (scrollContainer || (e.currentTarget as HTMLDivElement)).getBoundingClientRect();
    const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const pointerX = (e.clientX - rect.left + scrollLeft) / stageScale;
    const pointerY = (e.clientY - rect.top + scrollTop) / stageScale;
    const rawGateType = e.dataTransfer.getData('gateType') || e.dataTransfer.getData('text/plain') || selectedGate || 'H';
    const gateTypeFromData = (rawGateType in gateConfigs ? rawGateType : 'H') as GateType;

    console.log('drop:', { pointerX, pointerY, gateTypeFromData, rect });

    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id === 1) {
        const gateW = 40;
        const gateH = 40;

        // snapping: if drop y is in top half of workspace, snap to topmost line above the first horizontal line
        let finalX = pointerX;
        let finalY = pointerY;
        const topLineY = workspaceHeight / 2; // first horizontal line
        if (pointerY < workspaceHeight * 0.5) {
          // snap X to nearest segment center
          const relX = Math.max(segmentsStartX, Math.min(pointerX, workspaceWidth));
          const idx = Math.floor((relX - segmentsStartX) / segmentWidth);
          const clampedIdx = Math.max(0, Math.min(numSegments - 1, idx));
          const segCenter = segmentsStartX + clampedIdx * segmentWidth + segmentWidth / 2;
          finalX = segCenter;
          // snap bottom edge 10px above the top horizontal line
          // block bottom = block.y + 40 = topLineY - 10, so block.y = topLineY - 50
          finalY = topLineY - 50;
        }

        const localX = finalX - node.x - gateW / 2;
        const localY = finalY - node.y;

        return {
          ...node,
          gates: [
            ...node.gates,
            {
              id: Date.now(),
              type: gateTypeFromData,
              x: localX,
              y: localY,
              width: gateW,
              height: gateH,
              color: (gateConfigs[gateTypeFromData] || gateConfigs['H']).color,
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

  // Handlers for node drag
  const handleNodeDrag = (id: number, e: any) => {
    const pos = e.currentTarget.position();
    const { x, y } = pos;
    setNodes(nodes => nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  // Handler for gate drag end (within a node)
  const handleGateDragEnd = (nodeId: number, gateId: number, e: any) => {
    const pos = e.currentTarget.position();
    const { x } = pos;
    const gateW = 40;
    const gateH = 40;
    const topLineY = workspaceHeight / 2;
    
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node;

      const gate = node.gates.find(g => g.id === gateId);
      if (!gate) return node;

      const absX = node.x + x;
      const isInColumnRange = absX >= segmentsStartX && absX <= workspaceWidth;

      if (!isInColumnRange) {
        return {
          ...node,
          gates: node.gates.filter(g => g.id !== gateId),
        };
      }

      const idx = Math.floor((absX - segmentsStartX) / segmentWidth);
      const clampedIdx = Math.max(0, Math.min(numSegments - 1, idx));
      const segCenter = segmentsStartX + clampedIdx * segmentWidth + segmentWidth / 2;
      const finalX = segCenter - node.x - gateW / 2;
      // Always lock Y to 10px above the top line
      const lockedY = topLineY - 10 - gateH - node.y;

      return {
        ...node,
        gates: node.gates.map(g => g.id === gateId ? { ...g, x: finalX, y: lockedY } : g),
      };
    }));
  };

  // Handlers for line drag
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

  const getClosestBitLine = (y: number) => {
    const bitLines = Array.from({ length: numBits }).map((_, i) => workspaceHeight / 2 + i * 40);
    return bitLines.reduce((prev, cur) => Math.abs(y - cur) < Math.abs(y - prev) ? cur : prev, bitLines[0]);
  };

  const handleBarDotDragEnd = (lineId: number, e: any) => {
    const y = e.target.y();
    const nearestY = getClosestBitLine(y);
    setGateLines(prev => prev.map(line => line.id === lineId ? { ...line, barY: nearestY } : line));
  };

  const handleDeleteGate = (nodeId: number, gateId: number) => {
    setNodes(prev => prev.map(node => node.id === nodeId ? { ...node, gates: node.gates.filter(g => g.id !== gateId) } : node));
  };

  const handleStageMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (draggingGateLine) {
      setDraggingGateLine({ ...draggingGateLine, currentX: pointer.x, currentY: pointer.y });
      return;
    }

    if (!isDraggingLine) return;
    if (!pointer) return;
    setLineEnd({ x: pointer.x, y: pointer.y });
  };

  const handleStageMouseUp = () => {
    if (draggingGateLine) {
      const line = draggingGateLine;
      const bitLines = Array.from({ length: numBits }).map((_, i) => workspaceHeight / 2 + i * 40);
      const closestLine = bitLines.reduce((prev, cur) => Math.abs(line.currentY - cur) < Math.abs(line.currentY - prev) ? cur : prev, bitLines[0]);
      const barTolerance = 20;
      if (Math.abs(line.currentY - closestLine) <= barTolerance && line.currentY >= workspaceHeight / 2 - barTolerance) {
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

    setIsDraggingLine(false);
    setLineEnd(null);
    setLineStartNode(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
      <Toolbox
        gateConfigs={gateConfigs}
        selectedGate={selectedGate}
        numBits={numBits}
        onDragStart={handleDragStart}
        onDragEnd={handleTotalDragEnd}
        onNumBitsChange={setNumBits}
      />

      {/* Canvas */}
      <div
        style={{ width: '75%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div style={{ position: 'absolute', right: 12, top: '40%', zIndex: 3, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setStageScale(s => Math.min(3, +(s + 0.1).toFixed(2)))} style={{ width: 40, height: 40 }}>+</button>
          <button onClick={() => setStageScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))} style={{ width: 40, height: 40 }}>−</button>
          <button onClick={() => setStageScale(1)} style={{ width: 40, height: 28 }}>reset</button>
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
          <div id="stage-scroll-container" style={{ width: workspaceWidth, height: workspaceHeight, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Stage
              width={workspaceWidth}
              height={workspaceHeight}
              scaleX={stageScale}
              scaleY={stageScale}
              style={{ border: '1px solid #ccc', background: '#f9f9f9' }}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
            >
          <Layer>
            {/* Horizontal bit lines */}
            {Array.from({ length: numBits }).map((_, i) => {
              const startY = workspaceHeight / 2 + i * 40;
              return (
                <Line
                  key={`bit-line-${i}`}
                  points={[0, startY, workspaceWidth, startY]}
                  stroke={'#666'}
                  strokeWidth={2}
                  dash={[6, 4]}
                  listening={false}
                />
              );
            })}
            {/* Vertical segment dividers (red) starting at 30% */}
            {Array.from({ length: numSegments + 1 }).map((_, i) => {
              const x = segmentsStartX + i * segmentWidth;
              const topY = workspaceHeight * 0.2;
              const bottomY = workspaceHeight / 2 + (numBits - 1) * 40 + 20;
              return (
                <Line
                  key={`seg-${i}`}
                  points={[x, topY, x, bottomY]}
                  stroke={'#e53935'}
                  strokeWidth={2}
                  dash={[4, 4]}
                  listening={false}
                />
              );
            })}
            {draggingGateLine && (
              <Line
                points={[draggingGateLine.startX, draggingGateLine.startY, draggingGateLine.currentX, draggingGateLine.currentY]}
                stroke='#000'
                strokeWidth={3}
                lineCap='round'
                lineJoin='round'
                listening={false}
              />
            )}
            {gateLines.map(line => {
              const node = nodes.find(n => n.id === line.nodeId);
              if (!node) return null;
              const gate = node.gates.find(g => g.id === line.gateId);
              if (!gate) return null;
              const gateCenterX = node.x + gate.x + (gate.width || 40) / 2;
              const gateCenterY = node.y + gate.y + (gate.height || 40) / 2;
              return (
                <Group key={`line-group-${line.id}`}>
                  <Line
                    points={[gateCenterX, gateCenterY, gateCenterX, line.barY]}
                    stroke='#000'
                    strokeWidth={3}
                    lineCap='round'
                    lineJoin='round'
                    listening={false}
                  />
                  <Circle
                    x={gateCenterX}
                    y={line.barY}
                    radius={7}
                    fill='#000'
                    draggable={true}
                    onDragEnd={e => handleBarDotDragEnd(line.id, e)}
                  />
                </Group>
              );
            })}
            {nodes.map(node => {
              const localDotX = boxWidth;
              const localDotY = boxHeight / 2 + dotOffset;
              const absDotX = node.x + localDotX;
              const absDotY = node.y + localDotY;

              return (
                <Group
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  draggable
                  onDragMove={e => handleNodeDrag(node.id, e)}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={boxWidth}
                    height={boxHeight}
                    fill='#29b6f6'
                    draggable={false}
                    shadowBlur={10}
                    cornerRadius={10}
                  />
                  <Circle
                    x={localDotX}
                    y={localDotY}
                    radius={dotRadius}
                    fill='#ff7043'
                    stroke='#fff'
                    strokeWidth={2}
                    onMouseDown={() => handleDotMouseDown(node.id, absDotX, absDotY)}
                    onTouchStart={() => handleDotMouseDown(node.id, absDotX, absDotY)}
                    draggable={false}
                    listening={true}
                    shadowBlur={4}
                  />

                  {node.gates.map(gate => {
                    const gateWidth = gate.width || 40;
                    const gateHeight = gate.height || 40;
                    const gateCenterX = gateWidth / 2;
                    const absGateCenterX = node.x + gate.x + gateCenterX;
                    return (
                      <Group key={gate.id} x={gate.x} y={gate.y} draggable onDragEnd={e => handleGateDragEnd(node.id, gate.id, e)}>
                        <Rect
                          x={0}
                          y={0}
                          width={gateWidth}
                          height={gateHeight}
                          fill={gate.color}
                          opacity={0.95}
                          draggable={false}
                          shadowBlur={6}
                          cornerRadius={8}
                        />
                        <Circle
                          x={gateWidth / 2}
                          y={gateHeight}
                          radius={6}
                          fill='#fff'
                          stroke='#000'
                          strokeWidth={2}
                          draggable={false}
                          onMouseDown={e => {
                            e.cancelBubble = true;
                            handleGateLineStart(node.id, gate.id, absGateCenterX, node.y + gate.y + gateHeight);
                          }}
                          listening={true}
                        />
                        <Circle
                          x={gateWidth}
                          y={0}
                          radius={10}
                          fill={gate.color}
                          shadowBlur={2}
                          onClick={() => handleDeleteGate(node.id, gate.id)}
                          listening={true}
                        />
                        <Line
                          points={[gateWidth - 6, -6, gateWidth + 6, 6]}
                          stroke='#fff'
                          strokeWidth={2}
                          lineCap='round'
                          listening={false}
                        />
                        <Line
                          points={[gateWidth + 6, -6, gateWidth - 6, 6]}
                          stroke='#fff'
                          strokeWidth={2}
                          lineCap='round'
                          listening={false}
                        />
                        <Text
                          text={gate.type}
                          fontSize={14}
                          fill='#fff'
                          align='center'
                          verticalAlign='middle'
                          listening={false}
                          draggable={false}
                          x={gateWidth / 2}
                          y={gateHeight / 2}
                        />
                      </Group>
                    );
                  })}
                </Group>
              );
            })}

            

            {/* Drag spline (Bezier-like) */}
            {isDraggingLine && lineEnd && lineStartNode !== null && (() => {
              const node = nodes.find(n => n.id === lineStartNode);
              if (!node) return null;
              
              const dotX = node.x + boxWidth;
              const dotY = node.y + boxHeight / 2 + dotOffset;
              
              return (
                <Line
                  points={[
                    dotX,
                    dotY,
                    dotX + 60,
                    dotY,
                    lineEnd.x - 60,
                    lineEnd.y,
                    lineEnd.x,
                    lineEnd.y,
                  ]}
                  stroke='#ff7043'
                  strokeWidth={3}
                  lineCap='round'
                  lineJoin='round'
                  bezier={true}
                  dash={[8, 4]}
                />
              );
            })()}
          </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;