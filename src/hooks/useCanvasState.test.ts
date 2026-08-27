import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type * as React from 'react';
import { useCanvasState } from './useCanvasState';
import type { GateType } from '../types';
import {
  GATE_WIDTH,
  SNAPPED_ABS_Y,
  SEGMENTS_START_X,
  SEGMENT_WIDTH,
  FIRST_BIT_LINE_Y,
  BIT_LINE_SPACING,
} from '../constants/canvas';
import { GATE_CONFIGS } from '../constants/gates';

const SEGMENT0_CENTER = SEGMENTS_START_X + SEGMENT_WIDTH / 2;

/** Minimal stand-in for a React drag event carrying a gate type. */
const makeDropEvent = (clientX: number, gateType: GateType | '' = 'H') =>
  ({
    preventDefault: vi.fn(),
    dataTransfer: {
      effectAllowed: '',
      setData: vi.fn(),
      getData: (key: string) => (key === 'gateType' ? gateType : ''),
    },
    clientX,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      contains: () => false,
    },
    relatedTarget: null,
  }) as unknown as React.DragEvent;

const dropGate = (
  result: { current: ReturnType<typeof useCanvasState> },
  clientX: number,
  gateType: GateType = 'H',
) => {
  act(() => result.current.handleDrop(makeDropEvent(clientX, gateType)));
  return result.current.gates[result.current.gates.length - 1];
};

const dragGateTo = (
  result: { current: ReturnType<typeof useCanvasState> },
  gateId: number,
  targetX: number,
) => {
  const gate = result.current.gates.find(g => g.id === gateId);
  if (!gate) throw new Error('gate not found');
  // Start the drag at the gate's top-left corner so offset is zero and the
  // move coordinates directly reflect the desired gate position.
  act(() => result.current.handleGateDragStart(gateId, gate.x));
  act(() => result.current.handleGateDragMove(targetX));
  act(() => result.current.handleGateDragEnd());
};

describe('useCanvasState', () => {
  beforeEach(() => {
    let id = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => id++);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with an empty canvas and sensible defaults', () => {
    const { result } = renderHook(() => useCanvasState());
    expect(result.current.gates).toEqual([]);
    expect(result.current.gateLines).toEqual([]);
    expect(result.current.numBits).toBe(4);
    expect(result.current.stageScale).toBe(1);
    expect(result.current.selectedGate).toBeNull();
    expect(result.current.selectedPlacedGateId).toBeNull();
    expect(result.current.dragPreview).toBeNull();
    expect(result.current.draggingGateLine).toBeNull();
    expect(result.current.gateDrag).toBeNull();
    expect(result.current.lineDrag).toBeNull();
  });

  describe('handleDrop', () => {
    it('places a gate snapped to the segment under the pointer', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, 'X');

      expect(gate.type).toBe('X');
      expect(gate.x).toBe(SEGMENT0_CENTER - GATE_WIDTH / 2);
      expect(gate.y).toBe(SNAPPED_ABS_Y);
      expect(gate.color).toBe(GATE_CONFIGS.X.color);
    });

    it('applies the default angle for parameterized gates only', () => {
      const { result } = renderHook(() => useCanvasState());
      const rx = dropGate(result, SEGMENT0_CENTER, 'Rx');
      const h = dropGate(result, SEGMENT0_CENTER, 'H');

      expect(rx.angle).toBe(GATE_CONFIGS.Rx.defaultAngle);
      expect(h.angle).toBeUndefined();
    });

    it('falls back to H for unknown gate types', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, '' as GateType);
      expect(gate.type).toBe('H');
    });

    it('widens multi-origin gates and centers them in their cell', () => {
      const { result } = renderHook(() => useCanvasState());

      // 2 origins → 80px: fits the default 84px cell, so no widening —
      // the gate just centers in segment 0.
      const cx = dropGate(result, SEGMENT0_CENTER, 'CX');
      expect(cx.width).toBe(80);
      expect(cx.segment).toBe(0);
      expect(cx.x).toBe(SEGMENT0_CENTER - 40);

      // 3 origins → 120px: segment 0 widens to 120 and re-centers the gate.
      const ccx = dropGate(result, SEGMENT0_CENTER, 'CCX');
      expect(ccx.width).toBe(120);
      expect(ccx.segment).toBe(0);
      expect(ccx.x).toBe(SEGMENTS_START_X);
    });
  });

  describe('handleGateDragEnd', () => {
    it('snaps the gate to the nearest segment center', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      const oneSegmentRight = SEGMENT0_CENTER + SEGMENT_WIDTH;
      dragGateTo(result, gate.id, oneSegmentRight - GATE_WIDTH / 2);

      const expectedX = SEGMENT0_CENTER + SEGMENT_WIDTH - GATE_WIDTH / 2;
      expect(result.current.gates[0]).toMatchObject({ x: expectedX, y: SNAPPED_ABS_Y });
    });

    it('deletes the gate when dropped left of the segment area', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      dragGateTo(result, gate.id, -500);

      expect(result.current.gates).toEqual([]);
    });

    it('shifts later gates right when a cell widens, and back when it empties', () => {
      const { result } = renderHook(() => useCanvasState());

      // CCX widens segment 0 to 120, so segment 1 starts at START + 120.
      const ccx = dropGate(result, SEGMENT0_CENTER, 'CCX');
      const h = dropGate(result, SEGMENTS_START_X + 120 + SEGMENT_WIDTH / 2, 'H');

      expect(h.segment).toBe(1);
      // START + 120 (cell start) + 42 (cell center) − 20 (half gate)
      expect(h.x).toBe(SEGMENTS_START_X + 120 + SEGMENT_WIDTH / 2 - 20);

      // Deleting the wide gate shrinks segment 0 back; H shifts left.
      act(() => result.current.handleDeleteGate(ccx.id));
      expect(result.current.gates[0].x).toBe(SEGMENT0_CENTER + SEGMENT_WIDTH - 20);
    });

    it('keeps the same layout when a gate is dragged within its cell', () => {
      const { result } = renderHook(() => useCanvasState());
      const ccx = dropGate(result, SEGMENT0_CENTER, 'CCX'); // x = START, cell 120 wide

      // Drag around inside widened segment 0 ([START, START + 120)).
      dragGateTo(result, ccx.id, SEGMENTS_START_X + 40);

      expect(result.current.gates[0]).toMatchObject({ x: SEGMENTS_START_X, segment: 0 });
    });

    it('snaps a wide gate using its own width and re-flows both cells', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, 'CCX'); // 120px wide

      // Segment 0 is widened to 120, so segment 1 currently starts at START + 120.
      const segment1Center = SEGMENTS_START_X + 120 + SEGMENT_WIDTH / 2;
      // Node position is the top-left corner; center must land in segment 1.
      dragGateTo(result, gate.id, segment1Center - 60 + 3);

      // After the move, segment 0 shrinks back to 84 and segment 1 widens
      // to 120: x = START + 84 + 60 (center) − 60 (half gate).
      const expectedX = SEGMENTS_START_X + SEGMENT_WIDTH;
      expect(result.current.gates[0]).toMatchObject({ x: expectedX, y: SNAPPED_ABS_Y, segment: 1 });
    });
  });

  describe('gate lines', () => {
    const connectLine = (
      result: { current: ReturnType<typeof useCanvasState> },
      gateId: number,
      originIndex: number,
      endY: number,
    ) => {
      act(() => result.current.handleGateLineStart(gateId, originIndex, 20, 400, endY));
      act(() => result.current.handleStageMouseMove({ x: 400, y: endY }));
      act(() => result.current.handleStageMouseUp());
    };

    it('creates a target line when released on a bit line', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      const barY = FIRST_BIT_LINE_Y + BIT_LINE_SPACING;

      connectLine(result, gate.id, 0, barY);

      expect(result.current.gateLines).toHaveLength(1);
      expect(result.current.gateLines[0]).toMatchObject({
        gateId: gate.id,
        barY,
        role: 'target',
        originIndex: 0,
      });
      expect(result.current.draggingGateLine).toBeNull();
    });

    it('assigns the control role to origins beyond the target capacity', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER, 'CX'); // 1 target + 1 control

      connectLine(result, gate.id, 1, FIRST_BIT_LINE_Y);

      expect(result.current.gateLines[0].role).toBe('control');
    });

    it('snaps the endpoint to the closest bit line within tolerance', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y + 10);

      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y);
    });

    it('does not create a line when released far from any bit line', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y - 100);

      expect(result.current.gateLines).toEqual([]);
    });

    it('moves the existing line when the same origin is reconnected', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING);

      expect(result.current.gateLines).toHaveLength(1);
      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y + 2 * BIT_LINE_SPACING);
    });

    it('toggleGateLineRole flips target to control and back', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      const lineId = result.current.gateLines[0].id;

      act(() => result.current.toggleGateLineRole(lineId));
      expect(result.current.gateLines[0].role).toBe('control');
      act(() => result.current.toggleGateLineRole(lineId));
      expect(result.current.gateLines[0].role).toBe('target');
    });

    it('updateGateLineBarY moves a line to another bit', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      const lineId = result.current.gateLines[0].id;

      act(() => result.current.updateGateLineBarY(lineId, FIRST_BIT_LINE_Y + BIT_LINE_SPACING));
      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y + BIT_LINE_SPACING);
    });

    it('drags a line endpoint to another bit line', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      connectLine(result, gate.id, 0, FIRST_BIT_LINE_Y);
      const lineId = result.current.gateLines[0].id;

      act(() => result.current.handleLineDragStart(lineId));
      act(() => result.current.handleLineDragMove(FIRST_BIT_LINE_Y + BIT_LINE_SPACING));
      act(() => result.current.handleLineDragEnd());

      expect(result.current.gateLines[0].barY).toBe(FIRST_BIT_LINE_Y + BIT_LINE_SPACING);
    });
  });

  describe('handleDeleteGate', () => {
    it('removes the gate along with its lines and selection', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);
      act(() => result.current.handleGateLineStart(gate.id, 0, 20, 400, FIRST_BIT_LINE_Y));
      act(() => result.current.handleStageMouseUp());
      act(() => result.current.handleSelectGate(gate.id));

      act(() => result.current.handleDeleteGate(gate.id));

      expect(result.current.gates).toEqual([]);
      expect(result.current.gateLines).toEqual([]);
      expect(result.current.selectedPlacedGateId).toBeNull();
    });
  });

  describe('handleSelectGate', () => {
    it('selects a gate and deselects it on a second click', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      act(() => result.current.handleSelectGate(gate.id));
      expect(result.current.selectedPlacedGateId).toBe(gate.id);
      act(() => result.current.handleSelectGate(gate.id));
      expect(result.current.selectedPlacedGateId).toBeNull();
    });

    it('selects a gate when a drag starts', () => {
      const { result } = renderHook(() => useCanvasState());
      const gate = dropGate(result, SEGMENT0_CENTER);

      act(() => result.current.handleGateDragStart(gate.id, gate.x));
      expect(result.current.selectedPlacedGateId).toBe(gate.id);
    });
  });

  describe('handleGateAngleChange', () => {
    it('updates only the matching gate', () => {
      const { result } = renderHook(() => useCanvasState());
      const rx = dropGate(result, SEGMENT0_CENTER, 'Rx');
      const other = dropGate(result, SEGMENT0_CENTER, 'H');

      act(() => result.current.handleGateAngleChange(rx.id, 1.23));

      expect(result.current.gates.find(g => g.id === rx.id)?.angle).toBe(1.23);
      expect(result.current.gates.find(g => g.id === other.id)?.angle).toBeUndefined();
    });
  });

  describe('zoom', () => {
    it('zooms in and out in 0.1 steps and resets to 1', () => {
      const { result } = renderHook(() => useCanvasState());

      act(() => result.current.zoomIn());
      expect(result.current.stageScale).toBeCloseTo(1.1);
      act(() => result.current.zoomOut());
      expect(result.current.stageScale).toBeCloseTo(1);
      act(() => result.current.zoomIn());
      act(() => result.current.resetZoom());
      expect(result.current.stageScale).toBe(1);
    });

    it('clamps the scale between 0.3 and 3', () => {
      const { result } = renderHook(() => useCanvasState());

      for (let i = 0; i < 30; i++) act(() => result.current.zoomIn());
      expect(result.current.stageScale).toBe(3);
      for (let i = 0; i < 40; i++) act(() => result.current.zoomOut());
      expect(result.current.stageScale).toBe(0.3);
    });
  });

  describe('setNumBits', () => {
    it('updates the number of bits', () => {
      const { result } = renderHook(() => useCanvasState());
      act(() => result.current.setNumBits(7));
      expect(result.current.numBits).toBe(7);
    });
  });

  describe('loadCircuit', () => {
    it('clamps an oversized numBits to 16', () => {
      const { result } = renderHook(() => useCanvasState());
      act(() =>
        result.current.loadCircuit({
          numBits: 30,
          ops: [{ id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null }],
        })
      );
      expect(result.current.numBits).toBe(16);
    });

    it('clamps an undersized numBits to 1', () => {
      const { result } = renderHook(() => useCanvasState());
      act(() => result.current.loadCircuit({ numBits: 0, ops: [] }));
      expect(result.current.numBits).toBe(1);
    });
  });

  describe('handleDrop with fitScale', () => {
    it('maps client coordinates through the fit scale', () => {
      const { result } = renderHook(() => useCanvasState(0.5));

      // Displayed at half size: dropping at half the canvas x lands on segment 0.
      const gate = dropGate(result, SEGMENT0_CENTER * 0.5, 'X');

      expect(gate.x).toBe(SEGMENT0_CENTER - GATE_WIDTH / 2);
      expect(gate.y).toBe(SNAPPED_ABS_Y);
    });

    it('combines the fit scale with the user zoom multiplier', () => {
      const { result } = renderHook(() => useCanvasState(0.5));
      act(() => result.current.zoomIn()); // stageScale 1.1 → effective 0.55

      const gate = dropGate(result, SEGMENT0_CENTER * 0.55);

      expect(gate.x).toBe(SEGMENT0_CENTER - GATE_WIDTH / 2);
    });

    it('snaps drops outside the workspace to the nearest segment', () => {
      const { result } = renderHook(() => useCanvasState(0.5));

      // Way past the right edge: clamps to the last segment's center.
      const lastCenter = SEGMENTS_START_X + SEGMENT_WIDTH * 9 + SEGMENT_WIDTH / 2;
      const gate = dropGate(result, 9999);

      expect(gate.x).toBe(lastCenter - GATE_WIDTH / 2);
    });
  });

  describe('id generation', () => {
    it('never reuses ids, even for gates created in the same millisecond', () => {
      vi.spyOn(Date, 'now').mockReturnValue(12345);
      const { result } = renderHook(() => useCanvasState());

      const a = dropGate(result, SEGMENT0_CENTER, 'H');
      const b = dropGate(result, SEGMENT0_CENTER, 'X');

      expect(a.id).not.toBe(b.id);
    });

    it('gate ids and line ids never collide', () => {
      vi.spyOn(Date, 'now').mockReturnValue(999);
      const { result } = renderHook(() => useCanvasState());

      const gate = dropGate(result, SEGMENT0_CENTER, 'H');
      act(() => result.current.handleGateLineStart(gate.id, 0, 20, 400, FIRST_BIT_LINE_Y));
      act(() => result.current.handleStageMouseUp());

      expect(result.current.gateLines).toHaveLength(1);
      expect(result.current.gateLines[0].id).not.toBe(gate.id);
    });
  });
});
