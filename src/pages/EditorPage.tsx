import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type Konva from 'konva';
import { Toolbox } from '../components/toolbox';
import { StatePanel } from '../components/StatePanel';
import { QuantumCanvas } from '../components/canvas';
import { useCanvasState } from '../hooks/useCanvasState';
import { useSimulation } from '../hooks/useSimulation';
import { useEditorActions } from '../context/EditorActionsContext';
import { serializeCircuit } from '../api/serialize';
import type { Circuit } from '../api/types';

export function EditorPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const { registerActions } = useEditorActions();
  const location = useLocation();

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
    loadCircuit,
    setNumBits,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useCanvasState();

  const sim = useSimulation(gates, gateLines, numBits);

  const selectedPlacedGate = gates.find(g => g.id === selectedPlacedGateId) ?? null;

  // Expose serialize/thumbnail capture to the header's Save button.
  useEffect(() => {
    registerActions({
      serialize: () => serializeCircuit(gates, gateLines, numBits),
      captureThumbnail: () =>
        stageRef.current?.toDataURL({ pixelRatio: 0.35, mimeType: 'image/png' }),
    });
    return () => registerActions(null);
  }, [registerActions, gates, gateLines, numBits]);

  // Load a circuit handed over via navigation state (e.g. from My Circuits).
  useEffect(() => {
    const circuit = (location.state as { circuit?: Circuit } | null)?.circuit;
    if (circuit) {
      sim.reset();
      loadCircuit(circuit);
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' }}>
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
        stageRef={stageRef}
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
