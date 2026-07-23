import { Toolbox } from './components/toolbox';
import { QuantumCanvas } from './components/canvas';
import { useCanvasState } from './hooks/useCanvasState';

function App() {
  const {
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
    gateConfigs,
    handleDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleTotalDragEnd,
    handleNodeDrag,
    handleGateDragEnd,
    handleDotMouseDown,
    handleGateLineStart,
    handleDeleteGate,
    handleStageMouseMove,
    handleStageMouseUp,
    updateGateLineBarY,
    updateNodeLineBitY,
    setNumBits,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useCanvasState();

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

      <QuantumCanvas
        nodes={nodes}
        isDraggingLine={isDraggingLine}
        lineEnd={lineEnd}
        lineStartNode={lineStartNode}
        numBits={numBits}
        dragPreview={dragPreview}
        draggingGateLine={draggingGateLine}
        gateLines={gateLines}
        nodeLines={nodeLines}
        stageScale={stageScale}
        gateConfigs={gateConfigs}
        handleDrop={handleDrop}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleNodeDrag={handleNodeDrag}
        handleGateDragEnd={handleGateDragEnd}
        handleDotMouseDown={handleDotMouseDown}
        handleGateLineStart={handleGateLineStart}
        handleDeleteGate={handleDeleteGate}
        handleStageMouseMove={handleStageMouseMove}
        handleStageMouseUp={handleStageMouseUp}
        updateGateLineBarY={updateGateLineBarY}
        updateNodeLineBitY={updateNodeLineBitY}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
      />
    </div>
  );
}

export default App;
