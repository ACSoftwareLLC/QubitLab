import './App.css';
import { Toolbox } from './components/toolbox';
import { StatePanel } from './components/StatePanel';
import { QuantumCanvas } from './components/canvas';
import { useCanvasState } from './hooks/useCanvasState';
import { useFitScale } from './hooks/useFitScale';
import { useSimulation } from './hooks/useSimulation';
import { AuthPage } from './components/AuthPage.tsx';
import { useAuth } from './context/AuthContext.tsx';

function App() {
  const { user, loading, logout } = useAuth();
  const { ref: canvasRegionRef, fitScale } = useFitScale();

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
  } = useCanvasState(fitScale);

  const sim = useSimulation(gates, gateLines, numBits);

  const selectedPlacedGate = gates.find(g => g.id === selectedPlacedGateId) ?? null;

  if (loading) {
    return (
      <div className="app-loading">
        <span className="app-loading-spinner" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <span className="app-header-logo" aria-hidden="true">
            <i className="bi bi-cpu" />
          </span>
          <h1 className="app-header-title">Quantum DnD</h1>
        </div>
        <div className="app-header-user">
          <span className="app-user-chip">
            <i className="bi bi-person-circle" aria-hidden="true" />
            @{user.username}
          </span>
          <button className="btn" onClick={() => logout()}>
            <i className="bi bi-box-arrow-right" aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>

      <div className="builder-layout">
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

        <div ref={canvasRegionRef} className="builder-canvas-region">
          <QuantumCanvas
            gates={gates}
            numBits={numBits}
            dragPreview={dragPreview}
            draggingGateLine={draggingGateLine}
            gateLines={gateLines}
            stageScale={stageScale}
            fitScale={fitScale}
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
        </div>

        <StatePanel
          status={sim.status}
          snapshot={sim.snapshot}
          peekSnapshot={sim.peekSnapshot}
          errors={sim.errors}
          unconnectedGateIds={sim.unconnectedGateIds}
        />
      </div>
    </div>
  );
}

export default App;
