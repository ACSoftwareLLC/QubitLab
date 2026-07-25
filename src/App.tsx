import { Toolbox } from './components/toolbox';
import { StatePanel } from './components/StatePanel';
import { QuantumCanvas } from './components/canvas';
import { useCanvasState } from './hooks/useCanvasState';
import { useSimulation } from './hooks/useSimulation';
import { AuthPage } from './components/AuthPage.tsx';
import { useAuth } from './context/AuthContext.tsx';

function App() {
  const { user, loading, logout } = useAuth();

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

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: '1.25rem',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 1rem',
          background: '#1e293b',
          color: '#e2e8f0',
          borderBottom: '1px solid #334155',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Quantum DnD</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#94a3b8' }}>@{user.username}</span>
          <button
            onClick={() => logout()}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#e2e8f0',
              borderRadius: '0.375rem',
              padding: '0.35rem 0.75rem',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </header>

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
        />

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
