import { Toolbox } from './components/toolbox';
import { StatePanel } from './components/StatePanel';
import { QuantumCanvas } from './components/canvas';
import { useCanvasState } from './hooks/useCanvasState';
import { useSimulation } from './hooks/useSimulation';

function App() {
  const {
    gates,
    selectedGate,
    numBits,
    dragPreview,
    draggingGateLine,
    gateLines,
    selectedPlacedGateId,
    stageScale,
    gateConfigs,
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
    setNumBits,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useCanvasState();

  const sim = useSimulation(gates, gateLines, numBits);

  const selectedPlacedGate = gates.find(g => g.id === selectedPlacedGateId) ?? null;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
      <Toolbox
        gateConfigs={gateConfigs}
        selectedGate={selectedGate}
        numBits={numBits}
        selectedPlacedGate={selectedPlacedGate}
        onDragStart={handleDragStart}
        onDragEnd={handleTotalDragEnd}
        onNumBitsChange={setNumBits}
        onGateAngleChange={handleGateAngleChange}
      />

      <QuantumCanvas
        gates={gates}
        numBits={numBits}
        dragPreview={dragPreview}
        draggingGateLine={draggingGateLine}
        gateLines={gateLines}
        stageScale={stageScale}
        gateConfigs={gateConfigs}
        selectedPlacedGateId={selectedPlacedGateId}
        simStatus={sim.status}
        currentSegment={sim.currentSegment}
        numSteps={sim.numSteps}
        handleDrop={handleDrop}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleGateDragEnd={handleGateDragEnd}
        handleGateLineStart={handleGateLineStart}
        handleDeleteGate={handleDeleteGate}
        handleSelectGate={handleSelectGate}
        handleStageMouseMove={handleStageMouseMove}
        handleStageMouseUp={handleStageMouseUp}
        updateGateLineBarY={updateGateLineBarY}
        toggleGateLineRole={toggleGateLineRole}
        onSimStart={sim.start}
        onSimStep={sim.step}
        onSimRun={sim.run}
        onSimReset={sim.reset}
        onPeekSegment={sim.peek}
        onPeekEnd={sim.clearPeek}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
      />

      <StatePanel
        status={sim.status}
        snapshot={sim.snapshot}
        peekSnapshot={sim.peekSnapshot}
        errors={sim.errors}
        unconnectedGateIds={sim.unconnectedGateIds}
      />
    </div>
  );
}

export default App;
