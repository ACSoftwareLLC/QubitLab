
import { useState } from 'react';
import { Stage, Layer, Rect, Circle, Line } from 'react-konva';

function App() {
  // Multiple nodes state
  const [nodes, setNodes] = useState([
    { id: 1, x: 100, y: 100 },
  ]);
  // Line drag state
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [lineEnd, setLineEnd] = useState<{ x: number; y: number } | null>(null);
  const [lineStartNode, setLineStartNode] = useState<number | null>(null);

  // Box size
  const boxWidth = 100;
  const boxHeight = 100;
  // Dot (node origin) position relative to box
  const dotRadius = 8;
  const dotOffset = 0; // center vertically

  // Drag from toolbox
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('type', 'node');
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const stageRect = (e.target as HTMLDivElement).getBoundingClientRect();
    const pointerX = e.clientX - stageRect.left;
    const pointerY = e.clientY - stageRect.top;
    setNodes(nodes => [
      ...nodes,
      {
        id: Date.now(),
        x: pointerX - boxWidth / 2,
        y: pointerY - boxHeight / 2,
      },
    ]);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handlers for node drag
  const handleNodeDrag = (id: number, e: any) => {
    const { x, y } = e.target.position();
    setNodes(nodes => nodes.map(n => n.id === id ? { ...n, x, y } : n));
  };

  // Handlers for line drag
  const handleDotMouseDown = (id: number, dotX: number, dotY: number) => {
    setIsDraggingLine(true);
    setLineStartNode(id);
    setLineEnd({ x: dotX, y: dotY });
  };
  const handleStageMouseMove = (e: any) => {
    if (!isDraggingLine) return;
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (pointer) {
      setLineEnd({ x: pointer.x, y: pointer.y });
    }
  };
  const handleStageMouseUp = () => {
    setIsDraggingLine(false);
    setLineEnd(null);
    setLineStartNode(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
      {/* Toolbox */}
      <div
        className="toolbox"
        style={{ width: 100, background: '#222', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, boxShadow: '2px 0 8px #0002', zIndex: 2 }}
      >
        <div style={{ marginBottom: 24, fontWeight: 'bold', fontSize: 18 }}>Toolbox</div>
        <div
          className="toolbox-item"
          draggable
          onDragStart={handleDragStart}
        >
          Node
        </div>
        {/* Add more tools here */}
      </div>
      {/* Canvas */}
      <div
        style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <Stage
          width={500}
          height={400}
          style={{ border: '1px solid #ccc', background: '#f9f9f9' }}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          <Layer>
            {nodes.map(node => {
              const dotX = node.x + boxWidth;
              const dotY = node.y + boxHeight / 2 + dotOffset;
              return (
                <>
                  <Rect
                    key={node.id}
                    x={node.x}
                    y={node.y}
                    width={boxWidth}
                    height={boxHeight}
                    fill="#29b6f6"
                    draggable
                    shadowBlur={10}
                    cornerRadius={10}
                    onDragMove={e => handleNodeDrag(node.id, e)}
                  />
                  <Circle
                    key={node.id + '-dot'}
                    x={dotX}
                    y={dotY}
                    radius={dotRadius}
                    fill="#ff7043"
                    stroke="#fff"
                    strokeWidth={2}
                    onMouseDown={() => handleDotMouseDown(node.id, dotX, dotY)}
                    onTouchStart={() => handleDotMouseDown(node.id, dotX, dotY)}
                    draggable={false}
                    listening={true}
                    shadowBlur={4}
                  />
                </>
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
                  stroke="#ff7043"
                  strokeWidth={3}
                  lineCap="round"
                  lineJoin="round"
                  bezier={true}
                  dash={[8, 4]}
                />
              );
            })()}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

export default App;
