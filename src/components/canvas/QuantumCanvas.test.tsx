import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QuantumCanvas } from './QuantumCanvas';
import { GATE_CONFIGS } from '../../constants/gates';
import type { SimStatus } from '../../hooks/useSimulation';
import type { CanvasGate, GateLine, DragPreview, GateType, GateConfig } from '../../types';

const defaultProps = () => ({
  gates: [] as CanvasGate[],
  numBits: 4,
  dragPreview: null as DragPreview | null,
  draggingGateLine: null,
  gateLines: [] as GateLine[],
  stageScale: 1,
  fitScale: 1,
  gateConfigs: GATE_CONFIGS as Record<GateType, GateConfig>,
  selectedPlacedGateId: null as number | null,
  simStatus: 'idle' as SimStatus,
  currentSegment: -1,
  numSteps: 0,
  gateDrag: null,
  lineDrag: null,
  handleDrop: vi.fn(),
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleGateDragStart: vi.fn(),
  handleGateDragMove: vi.fn(),
  handleGateDragEnd: vi.fn(),
  handleGateLineStart: vi.fn(),
  handleLineDragStart: vi.fn(),
  handleLineDragMove: vi.fn(),
  handleLineDragEnd: vi.fn(),
  handleDeleteGate: vi.fn(),
  handleSelectGate: vi.fn(),
  handleStageMouseMove: vi.fn(),
  handleStageMouseUp: vi.fn(),
  toggleGateLineRole: vi.fn(),
  updateGateLineBarY: vi.fn(),
  onSimStart: vi.fn(),
  onSimStep: vi.fn(),
  onSimRun: vi.fn(),
  onSimReset: vi.fn(),
  onPeekSegment: vi.fn(),
  onPeekEnd: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  resetZoom: vi.fn(),
});

afterEach(cleanup);

describe('QuantumCanvas', () => {
  it('renders an SVG workspace with bit lines and empty-state hint', () => {
    const { container } = render(<QuantumCanvas {...defaultProps()} />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // Empty-state hint is shown when no gates are present.
    expect(container.textContent).toContain('Drag gates from the toolbox');

    // Bit lines are drawn.
    expect(container.querySelectorAll('line').length).toBeGreaterThan(0);
  });

  it('renders placed gates and their connection lines', () => {
    const gate: CanvasGate = {
      id: 1,
      type: 'H',
      x: 100,
      y: 50,
      width: 40,
      height: 40,
      color: GATE_CONFIGS.H.color,
      segment: 0,
    };
    const line: GateLine = {
      id: 2,
      gateId: 1,
      barY: 400,
      role: 'target',
      originIndex: 0,
      originX: 20,
    };

    const { container } = render(
      <QuantumCanvas {...defaultProps()} gates={[gate]} gateLines={[line]} />,
    );

    expect(container.textContent).not.toContain('Drag gates from the toolbox');
    expect(container.querySelector('rect[fill="' + GATE_CONFIGS.H.color + '"]')).toBeTruthy();
    expect(container.querySelectorAll('line').length).toBeGreaterThan(1);
  });

  it('exposes the svg ref for thumbnail capture', () => {
    const ref = { current: null as SVGSVGElement | null };
    render(<QuantumCanvas {...defaultProps()} stageRef={ref} />);
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
  });
});
