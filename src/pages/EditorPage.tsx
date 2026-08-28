import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Toolbox } from "../components/toolbox";
import { StatePanel } from "../components/StatePanel";
import { QuantumCanvas } from "../components/canvas";
import { useCanvasState } from "../hooks/useCanvasState";
import { useFitScale } from "../hooks/useFitScale";
import { useSimulation } from "../hooks/useSimulation";
import { useEditorActions } from "../context/EditorActionsContext";
import { serializeCircuit } from "../api/serialize";
import type { Circuit } from "../api/types";
import { consumeTemplatePrefetch } from "./templatePrefetch";
import { TemplateBanner } from "./TemplateBanner";
import "../App.css";

async function captureSvgThumbnail(
  svg: SVGSVGElement | null,
  scale = 0.35,
): Promise<string | undefined> {
  if (!svg) return undefined;

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    return undefined;
  }

  // Fill with the canvas background color so thumbnails are not transparent.
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

export function EditorPage() {
  const canvasRef = useRef<SVGSVGElement>(null);
  const { registerActions } = useEditorActions();
  const location = useLocation();
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
    gateDrag,
    lineDrag,
    handleDragStart,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleTotalDragEnd,
    handleGateDragStart,
    handleGateDragMove,
    handleGateDragEnd,
    handleGateLineStart,
    handleLineDragStart,
    handleLineDragMove,
    handleLineDragEnd,
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
  } = useCanvasState(fitScale);

  const serialized = useMemo(
    () => serializeCircuit(gates, gateLines, numBits),
    [gates, gateLines, numBits],
  );
  const sim = useSimulation(serialized.circuit, serialized.unconnectedGateIds);
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(
    null,
  );

  const selectedPlacedGate =
    gates.find((g) => g.id === selectedPlacedGateId) ?? null;

  // Expose serialize/thumbnail capture to the header's Save button.
  useEffect(() => {
    registerActions({
      serialize: () => serializeCircuit(gates, gateLines, numBits),
      captureThumbnail: () => captureSvgThumbnail(canvasRef.current),
    });
    return () => registerActions(null);
  }, [registerActions, gates, gateLines, numBits]);

  // Load a circuit handed over via navigation state (My Circuits) or a
  // template prefetch from the gallery (sessionStorage contract).
  useEffect(() => {
    const handed = location.state as { circuit?: Circuit } | null;
    const prefetched = consumeTemplatePrefetch();
    if (prefetched) {
      sim.reset();
      loadCircuit(prefetched.circuit);
      setLoadedTemplateName(prefetched.title);
    } else if (handed?.circuit) {
      sim.reset();
      loadCircuit(handed.circuit);
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <div className="editor-root">
      {loadedTemplateName && (
        <TemplateBanner
          name={loadedTemplateName}
          onDismiss={() => setLoadedTemplateName(null)}
        />
      )}
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
            gateDrag={gateDrag}
            lineDrag={lineDrag}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleGateDragStart={handleGateDragStart}
            handleGateDragMove={handleGateDragMove}
            handleGateDragEnd={handleGateDragEnd}
            handleGateLineStart={handleGateLineStart}
            handleLineDragStart={handleLineDragStart}
            handleLineDragMove={handleLineDragMove}
            handleLineDragEnd={handleLineDragEnd}
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
            stageRef={canvasRef}
          />
        </div>

        <StatePanel
          status={sim.status}
          snapshot={sim.snapshot}
          peekSnapshot={sim.peekSnapshot}
          snapshotHistory={sim.snapshotHistory}
          errors={sim.errors}
          unconnectedGateIds={sim.unconnectedGateIds}
          numBits={numBits}
        />
      </div>
    </div>
  );
}
